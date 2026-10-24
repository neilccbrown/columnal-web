// Port of xyz.columnal.transformations.Concatenate (transformations module).
import type { ExpressionIdentifier } from "../../anns/Annotations.js";
import type { CellPosition } from "../../data/data/CellPosition.js";
import { Column } from "../../data/data/Column.js";
import { KnownLengthRecordSet } from "../../data/data/KnownLengthRecordSet.js";
import type { RecordSet } from "../../data/data/RecordSet.js";
import { Table } from "../../data/data/Table.js";
import type { TableManager } from "../../data/data/TableManager.js";
import type { Transformation } from "../../data/data/Transformation.js";
import { ColumnId } from "../../identifiers/id/ColumnId.js";
import type { TableAndColumnRenames } from "../../identifiers/id/TableAndColumnRenames.js";
import { TableId } from "../../identifiers/id/TableId.js";
import { HashMap } from "../../java/HashMap.js";
import { javaListAddAll } from "../../java/JavaCollections.js";
import { javaEnumName } from "../../java/JavaEnum.js";
import type { JavaFile } from "../../java/JavaFile.js";
import { javaEquals, javaHashCode } from "../../java/JavaObject.js";
import { TransformationLexer } from "../../parsers/generated/TransformationLexer.js";
import { TransformationParser } from "../../parsers/generated/TransformationParser.js";
import type { ExpressionVersion } from "../../parsers/grammar/Versions.js";
import type { DataType } from "../../types/data/datatype/DataType.js";
import { DataTypeUtility } from "../../types/data/datatype/DataTypeUtility.js";
import { DataTypeValue, GetValue } from "../../types/data/datatype/DataTypeValue.js";
import type { Unit } from "../../types/data/unit/Unit.js";
import { Either } from "../../utility-adt/utility/adt/Either.js";
import { Pair } from "../../utility-adt/utility/adt/Pair.js";
import { InternalException } from "../../utility-error/error/InternalException.js";
import { UserException } from "../../utility-error/error/UserException.js";
import type { FXPlatformSupplier } from "../../utility-functional/utility/function/fx/FXPlatformSupplier.js";
import type { SimulationFunction } from "../../utility-functional/utility/function/simulation/SimulationFunction.js";
import type { SimulationSupplier } from "../../utility-functional/utility/function/simulation/SimulationSupplier.js";
import { IdentifierUtility } from "../../utility/utility/IdentifierUtility.js";
import { Utility } from "../../utility/utility/Utility.js";
import type { Value } from "../../utility/utility/Value.js";
import { TransformationInfo } from "./TransformationInfo.js";
import type { TransformationVisitor } from "./TransformationVisitor.js";
import { VisitableTransformation } from "./VisitableTransformation.js";

class ColumnDetails
{
    public readonly dataType: DataType;
    public readonly defaultValue: Value;
    // defaultValue, wrapped into a single item DataTypeValue:
    public readonly defaultValueWrapped: DataTypeValue;
    // Function to wrap a value which does exist.  Null means the identity function:
    public readonly wrapValue: ((v: Value) => Value) | null;

    public constructor(dataType: DataType, defaultValue: Value, wrapValue: ((v: Value) => Value) | null)
    {
        this.dataType = dataType;
        this.defaultValue = defaultValue;
        this.defaultValueWrapped = dataType.fromCollapsed(GetValue.of((_i, _prog) => defaultValue));
        this.wrapValue = wrapValue;
    }
}

/**
 * Created by neil on 18/01/2017.
 */
export class Concatenate extends VisitableTransformation
{
    private readonly sources: readonly TableId[];

    private readonly incompleteColumnHandling: Concatenate.IncompleteColumnHandling;

    private readonly error: string | null;
    private readonly recordSet: RecordSet | null;

    private readonly includeMarkerColumn: boolean;

    public constructor(mgr: TableManager, initialLoadDetails: Table.InitialLoadDetails, sources: readonly TableId[], incompleteColumnHandling: Concatenate.IncompleteColumnHandling, includeMarkerColumn: boolean)
    {
        super(mgr, initialLoadDetails);
        this.sources = sources;
        this.incompleteColumnHandling = incompleteColumnHandling;
        this.includeMarkerColumn = includeMarkerColumn;

        let rs: KnownLengthRecordSet | null = null;
        let err: string | null = null;
        try
        {
            const tables: Table[] = Utility.mapListEx(sources, t => mgr.getSingleTableOrThrow(t));
            // We used LinkedHashMap to keep original column ordering:
            // Function is either identity (represented by null), or has a default, or is a custom wrapping function:.
            const ourColumns = new HashMap<ColumnId, ColumnDetails>();
            for (const [key, value] of Concatenate.getColumnsNameAndTypes(tables).entries())
            {
                // If there is more than one type for a given column name, it's a definite error:
                if (value.size > 1)
                {
                    // This will get caught at end of constructor:
                    throw new UserException("Column " + key.toString() + " has differing types in the source tables: " + Utility.listToString([...value.keys()]));
                }
                const origType = value.keys().next().value!;
                const count = [...value.values()].reduce((a, b) => a + b, 0);
                // Otherwise there's one type, so we know the type.  Based on how many copies there are of that type, we know
                // how many columns contained the original column.  We only need to do anything special if less than all
                // of the tables have that column:
                if (count < tables.length)
                {
                    // What do we do with an incomplete column?
                    switch (incompleteColumnHandling)
                    {
                        case Concatenate.IncompleteColumnHandling.OMIT:
                            // Leave that column out
                            break;
                        case Concatenate.IncompleteColumnHandling.WRAPMAYBE:
                        {
                            const wrappedInMaybe = mgr.getTypeManager().getMaybeType().instantiate([Either.right<Unit, DataType>(origType)], mgr.getTypeManager());
                            ourColumns.set(key, new ColumnDetails(wrappedInMaybe, mgr.getTypeManager().maybeMissing(), orig => {
                                return mgr.getTypeManager().maybePresent(orig);
                            }));
                            break;
                        }
                        default: // Which includes case DEFAULT
                        {
                            const defaultValue = DataTypeUtility.makeDefaultValue(origType);
                            ourColumns.set(key, new ColumnDetails(origType, defaultValue, null));
                            break;
                        }
                    }
                }
                else
                {
                    // Default will never be used in this case:
                    ourColumns.set(key, new ColumnDetails(origType, "", null));
                }
            }


            let totalLength = 0;
            const ends: number[] = [];
            for (const table of tables)
            {
                const len = table.getData().getLength();
                totalLength += len;
                ends.push(totalLength);
            }

            const tablesFinal = tables;
            // eslint-disable-next-line @typescript-eslint/no-this-alias -- the inner class's outer instance
            const self = this;
            const columns: SimulationFunction<RecordSet, Column>[] = Utility.mapList([...ourColumns.entries()], ([colKey, colValue]): SimulationFunction<RecordSet, Column> => (rs: RecordSet): Column =>
            {
                return new class extends Column
                {
                    public type: DataTypeValue | null = null;

                    public getType(): DataTypeValue
                    {
                        if (this.type === null)
                        {
                            this.type = self.addManualEditSet(this.getName(), DataTypeValue.copySeveral(colValue.dataType, concatenatedRow =>
                            {
                                for (let srcTableIndex = 0; srcTableIndex < ends.length; srcTableIndex++)
                                {
                                    if (concatenatedRow < ends[srcTableIndex]!)
                                    {
                                        const start = srcTableIndex === 0 ? 0 : ends[srcTableIndex - 1]!;
                                        // First one with end beyond our target must be right one:
                                        const oldColumn = tablesFinal[srcTableIndex]!.getData().getColumnOrNull(colKey);
                                        if (oldColumn === null)
                                        {
                                            return new Pair(colValue.defaultValueWrapped, 0);
                                        }
                                        else if (colValue.wrapValue === null)
                                        {
                                            return new Pair(oldColumn.getType(), concatenatedRow - start);
                                        }
                                        else
                                        {
                                            const wrapValue = colValue.wrapValue;
                                            const wrapped = colValue.dataType.fromCollapsed(GetValue.of((_i, _progB) => wrapValue(oldColumn.getType().getCollapsed(concatenatedRow - start))));
                                            return new Pair(wrapped, 0);
                                        }
                                    }
                                }
                                throw new InternalException("Attempting to access beyond end of concatenated tables: index" + (concatenatedRow + 1) + " but only length " + ends[ends.length - 1]!);
                            }));
                        }
                        return this.type;
                    }

                    public getAlteredState(): Column.AlteredState
                    {
                        return Column.AlteredState.OVERWRITTEN;
                    }
                }(rs, colKey);
            });

            if (includeMarkerColumn)
            {
                // TODO guard against duplicate Source column name
                javaListAddAll(columns, 0, [recordSet => new class extends Column
                {
                    public getType(): DataTypeValue
                    {
                        return self.addManualEditSet(this.getName(), DataTypeValue.text(GetValue.of((concatenatedRow, _prog) => {
                            for (let srcTableIndex = 0; srcTableIndex < ends.length; srcTableIndex++)
                            {
                                if (concatenatedRow < ends[srcTableIndex]!)
                                {
                                    return sources[srcTableIndex]!.getRaw();
                                }
                            }
                            throw new InternalException("Attempting to access beyond end of concatenated tables: index" + (concatenatedRow + 1) + " but only length " + ends[ends.length - 1]!);
                        })));
                    }

                    public getAlteredState(): Column.AlteredState
                    {
                        return Column.AlteredState.OVERWRITTEN;
                    }
                }(recordSet, new ColumnId("Source"))]);
            }

            rs = new KnownLengthRecordSet(columns, totalLength);
        }
        catch (e)
        {
            if (!(e instanceof UserException))
                throw e;
            const msg = e.getLocalizedMessage();
            if (msg !== null)
                err = msg;
        }
        this.recordSet = rs;
        this.error = err;
    }

    public override getPrimarySources(): readonly TableId[]
    {
        return this.sources;
    }

    protected override getSourcesFromExpressions(): readonly TableId[]
    {
        return [];
    }

    protected override getTransformationName(): string
    {
        return "concatenate";
    }

    protected override saveDetail(_destination: JavaFile | null, _renames: TableAndColumnRenames): readonly string[]
    {
        return ["@INCOMPLETE " + javaEnumName(Concatenate.IncompleteColumnHandling, this.incompleteColumnHandling) + (this.includeMarkerColumn ? " SOURCE " : "")];
    }

    public override getData(): RecordSet
    {
        if (this.recordSet === null)
            throw new UserException(this.error === null ? "Unknown error" : this.error);
        return this.recordSet;
    }

    // PORT-NOTE: Java's Multiset<DataType> is a Guava HashMultiset, which iterates in insertion
    // order, as the Map of counts here does.
    private static getColumnsNameAndTypes(tables: readonly Table[]): HashMap<ColumnId, HashMap<DataType, number>>
    {
        const r = new HashMap<ColumnId, HashMap<DataType, number>>();
        for (const t of tables)
        {
            const columns: Column[] = [...t.getData().getColumns()];
            //Collections.sort(columns, Comparator.<Column, ColumnId>comparing(c -> c.getName()));
            for (const c of columns)
            {
                let ms = r.get(c.getName()) ?? null;
                if (ms === null)
                {
                    ms = new HashMap<DataType, number>();
                    r.set(c.getName(), ms);
                }
                const type = c.getType().getType();
                ms.set(type, (ms.get(type) ?? 0) + 1);
            }
        }
        return r;
    }

    public getIncompleteColumnHandling(): Concatenate.IncompleteColumnHandling
    {
        return this.incompleteColumnHandling;
    }

    public isIncludeMarkerColumn(): boolean
    {
        return this.includeMarkerColumn;
    }

    public override transformationEquals(o: Transformation): boolean
    {
        const that = o as Concatenate;

        if (!javaEquals(this.sources, that.sources)) return false;

        if (this.incompleteColumnHandling !== that.incompleteColumnHandling)
            return false;

        return true;
    }

    public override transformationHashCode(): number
    {
        let result = javaHashCode(this.sources);
        result = (Math.imul(31, result) + this.incompleteColumnHandling) | 0;
        return result;
    }

    public override visit<T>(visitor: TransformationVisitor<T>): T
    {
        return visitor.concatenate(this);
    }

    public override getSuggestedName(): TableId
    {
        return Concatenate.suggestedName(this.sources);
    }

    public static suggestedName(sources: readonly TableId[]): TableId
    {
        const parts: ExpressionIdentifier[] = [];
        parts.push("Conc");
        if (sources.length === 0)
            parts.push("none");
        else
            parts.push(IdentifierUtility.shorten(sources[0]!.getRaw()));
        if (sources.length > 1)
            parts.push("and", IdentifierUtility.shorten(sources[1]!.getRaw()));
        return new TableId(IdentifierUtility.spaceSeparated(parts));
    }


}

export namespace Concatenate
{
    // Note: these names are used directly for saving, so must match the parser.
    export enum IncompleteColumnHandling
    {
        // Leave out any column which is not in all sources:
        OMIT,
        // Include all columns, using default value for the type:
        DEFAULT,
        // Wrap them in a Maybe type:
        WRAPMAYBE,
    }

    export class Info extends TransformationInfo
    {
        public constructor()
        {
            super("concatenate", "transform.concatenate", "preview-concatenate.png", "concatenate.explanation.short", ["append", "join"]);
        }

        public override load(mgr: TableManager, initialLoadDetails: Table.InitialLoadDetails, source: readonly TableId[], detail: string, _expressionVersion: ExpressionVersion): Transformation
        {
            const ctx = Utility.parseAsOne(detail, s => new TransformationLexer(s), t => new TransformationParser(t), p => p.concatMissing());
            let incompleteColumnHandling: IncompleteColumnHandling;
            if (ctx.concatOmit() !== null)
                incompleteColumnHandling = IncompleteColumnHandling.OMIT;
            else if (ctx.concatWrapMaybe() !== null)
                incompleteColumnHandling = IncompleteColumnHandling.WRAPMAYBE;
            else
                incompleteColumnHandling = IncompleteColumnHandling.DEFAULT;
            return new Concatenate(mgr, initialLoadDetails, [...source], incompleteColumnHandling, ctx.concatIncludeSource() !== null);
        }

        public override make(mgr: TableManager, destination: CellPosition, _askForSingleSrcTable: FXPlatformSupplier<Table | null>): SimulationSupplier<Transformation> | null
        {
            return () => new Concatenate(mgr, new Table.InitialLoadDetails(null, null, destination, null), [], IncompleteColumnHandling.DEFAULT, true);
        }
    }
}
