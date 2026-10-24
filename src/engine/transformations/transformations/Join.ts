// Port of xyz.columnal.transformations.Join (transformations module).
import type { ExpressionIdentifier } from "../../anns/Annotations.js";
import type { CellPosition } from "../../data/data/CellPosition.js";
import { Column } from "../../data/data/Column.js";
import { NumericColumnStorage } from "../../data/data/NumericColumnStorage.js";
import { RecordSet } from "../../data/data/RecordSet.js";
import { Table } from "../../data/data/Table.js";
import type { TableManager } from "../../data/data/TableManager.js";
import type { Transformation } from "../../data/data/Transformation.js";
import { ColumnId } from "../../identifiers/id/ColumnId.js";
import type { TableAndColumnRenames } from "../../identifiers/id/TableAndColumnRenames.js";
import { TableId } from "../../identifiers/id/TableId.js";
import { Decimal } from "../../java/JavaBigDecimal.js";
import { javaListGet } from "../../java/JavaCollections.js";
import type { JavaFile } from "../../java/JavaFile.js";
import { javaEquals, javaObjectsHash } from "../../java/JavaObject.js";
import { TransformationLexer } from "../../parsers/generated/TransformationLexer.js";
import { TransformationParser } from "../../parsers/generated/TransformationParser.js";
import type { ExpressionVersion } from "../../parsers/grammar/Versions.js";
import type { DataTypeValue } from "../../types/data/datatype/DataTypeValue.js";
import type { TypeManager } from "../../types/data/datatype/TypeManager.js";
import { OutputBuilder } from "../../types/loadsave/OutputBuilder.js";
import { Pair } from "../../utility-adt/utility/adt/Pair.js";
import { InternalException } from "../../utility-error/error/InternalException.js";
import { UserException } from "../../utility-error/error/UserException.js";
import type { FXPlatformSupplier } from "../../utility-functional/utility/function/fx/FXPlatformSupplier.js";
import type { SimulationFunction } from "../../utility-functional/utility/function/simulation/SimulationFunction.js";
import type { SimulationSupplier } from "../../utility-functional/utility/function/simulation/SimulationSupplier.js";
import { Log } from "../../utility/log/Log.js";
import { IdentifierUtility } from "../../utility/utility/IdentifierUtility.js";
import { Utility } from "../../utility/utility/Utility.js";
import { TransformationInfo } from "./TransformationInfo.js";
import type { TransformationVisitor } from "./TransformationVisitor.js";
import { VisitableTransformation } from "./VisitableTransformation.js";

export class Join extends VisitableTransformation
{
    private readonly primarySource: TableId;
    private readonly secondarySource: TableId;
    private readonly columnsToMatch: readonly Pair<ColumnId, ColumnId>[];
    /**
     * Should we put records from the primary source into the output even
     * if we found no match in the other part of the join?  If true, and we are keeping them,
     * the types of all records in the other table become wrapped in Optional.
     */
    private readonly keepPrimaryWithNoMatch: boolean;

    // Not actually a column by itself, but holds a list of integers so reasonable to re-use:
    // Each item is a source index in the corresponding original table.
    // So if it holds [2, 5, 5] that means we have three items so far,
    // the first is from index 2 in primary table, second is from index 5, third is also from index 5.  These two items will always
    // be of the same size, but if secondary has -1 in, it means
    // there is no row (only happens when keepPrimaryWithNoMatch is true)
    private readonly primaryIndexMap: NumericColumnStorage;
    private readonly secondaryIndexMap: NumericColumnStorage;
    private examinedAllSourceRows = false;

    private readonly error: string | null;
    private readonly recordSet: RecordSet | null;

    public constructor(mgr: TableManager, initialLoadDetails: Table.InitialLoadDetails, primarySource: TableId, secondarySource: TableId, keepPrimaryWithNoMatch: boolean, columnsToMatch: readonly Pair<ColumnId, ColumnId>[])
    {
        super(mgr, initialLoadDetails);
        this.primarySource = primarySource;
        this.secondarySource = secondarySource;
        this.keepPrimaryWithNoMatch = keepPrimaryWithNoMatch;
        this.columnsToMatch = columnsToMatch;

        this.primaryIndexMap = new NumericColumnStorage(false);
        this.secondaryIndexMap = new NumericColumnStorage(false);

        let theRecordSet: RecordSet | null = null;
        let theError: string | null = null;
        try
        {
            const primary = mgr.getSingleTableOrThrow(primarySource).getData();
            const secondary = mgr.getSingleTableOrThrow(secondarySource).getData();


            const primSec = new Pair<RecordSet, RecordSet>(primary, secondary);

            // There's three kinds of column from tables P(rimary) and S(econdary):
            // Join columns of P."a" = S."b".  These remain in, named "c" if it does not also occur in a non-joined S column, or "P a" if there is a name clash.
            // Left columns of P."c".  These remain in, named "c" if it does not also occur in a non-joined S column, or "P c" if there is a name clash.
            // Right columns of S."d".  These remain in, named "d" if it does not also occur in a non-joined P column, or "S c" if there is a name clash.
            // After joining index maps are sorted, the first and second category is the same
            // eslint-disable-next-line @typescript-eslint/no-this-alias -- the inner class's outer instance
            const self = this;
            theRecordSet = new class extends RecordSet
            {
                public indexValid(index: number): boolean
                {
                    if (index < self.primaryIndexMap.filled())
                        return true;

                    Utility.later(self).fillJoinMapTo(index, primSec);
                    return index < self.primaryIndexMap.filled();
                }
            }(Utility.concatI(
                Utility.mapListI(primary.getColumns(), c => this.copyColumn(c, Join.avoidNameClash(primarySource, c.getName(), secondary.getColumnIds()), this.primaryIndexMap, primSec, null)),
                Utility.mapListI(secondary.getColumns(), c => this.copyColumn(c, Join.avoidNameClash(secondarySource, c.getName(), primary.getColumnIds()), this.secondaryIndexMap, primSec, keepPrimaryWithNoMatch ? mgr.getTypeManager() : null))
            ));
        }
        catch (e)
        {
            if (!(e instanceof InternalException || e instanceof UserException))
                throw e;
            if (e instanceof InternalException)
                Log.log(e);
            theError = e.getLocalizedMessage();
        }
        this.recordSet = theRecordSet;
        this.error = theError;
    }

    private static avoidNameClash(tableName: TableId, columnName: ColumnId, namesToNotClashWith: readonly ColumnId[]): ColumnId
    {
        while (namesToNotClashWith.some(n => n.equals(columnName)))
        {
            // Keep prepending table name until it's unique:
            const proposed = tableName.getRaw() + " " + columnName.getRaw();
            columnName = new ColumnId(IdentifierUtility.fixExpressionIdentifier(proposed, proposed as ExpressionIdentifier));
        }
        return columnName;
    }

    // If typeManager != null, wrap into optional, else keep original type
    private copyColumn(c: Column, name: ColumnId, indexMap: NumericColumnStorage, recordSets: Pair<RecordSet, RecordSet>, typeManager: TypeManager | null): SimulationFunction<RecordSet, Column>
    {
        // eslint-disable-next-line @typescript-eslint/no-this-alias -- the inner class's outer instance
        const self = this;
        return rs => new class extends Column
        {
            public getType(): DataTypeValue
            {
                return self.addManualEditSet(this.getName(), typeManager === null ?
                c.getType().copyReorder(i => {
                    Utility.later(self).fillJoinMapTo(i, recordSets);
                    return indexMap.getInt(i);
                })
                : c.getType().copyReorderWrapOptional(typeManager, i =>
                {
                    Utility.later(self).fillJoinMapTo(i, recordSets);
                    const mapped = indexMap.getInt(i);
                    return mapped < 0 ? null : mapped;
                }));
            }

            public getAlteredState(): Column.AlteredState
            {
                return Column.AlteredState.FILTERED_OR_REORDERED;
            }
        }(rs, name);
    }

    private fillJoinMapTo(destIndex: number, recordSets: Pair<RecordSet, RecordSet>): void
    {
        if (this.examinedAllSourceRows)
            return;
        // We go down the rows of the primary table, looking for secondary matches
        // If (none && keepPrimaryWithNoMatch) || some, we add a result row
        let nextPrimaryToExamine = this.primaryIndexMap.filled() === 0 ? 0 : (this.primaryIndexMap.getInt(this.primaryIndexMap.filled() - 1) + 1);
        while (recordSets.getFirst().indexValid(nextPrimaryToExamine))
        {
            let foundSecondary = false;
            for (let secondaryIndex = 0; recordSets.getSecond().indexValid(secondaryIndex); secondaryIndex++)
            {
                let allMatch = true;
                for (const toMatch of this.columnsToMatch)
                {
                    const primaryVal = recordSets.getFirst().getColumn(toMatch.getFirst()).getType().getCollapsed(nextPrimaryToExamine);
                    const secondaryVal = recordSets.getSecond().getColumn(toMatch.getSecond()).getType().getCollapsed(secondaryIndex);
                    if (Utility.compareValues(primaryVal, secondaryVal) !== 0)
                    {
                        allMatch = false;
                        break;
                    }
                }
                if (allMatch)
                {
                    foundSecondary = true;
                    this.primaryIndexMap.add(new Decimal(nextPrimaryToExamine));
                    this.secondaryIndexMap.add(new Decimal(secondaryIndex));
                }
            }

            if (!foundSecondary && this.keepPrimaryWithNoMatch)
            {
                // Add row with blank secondary
                this.primaryIndexMap.add(new Decimal(nextPrimaryToExamine));
                this.secondaryIndexMap.add(new Decimal(-1));
            }

            if (this.primaryIndexMap.filled() > destIndex)
                return;
            else
                nextPrimaryToExamine += 1;
        }
        this.examinedAllSourceRows = true;
    }

    protected override getSourcesFromExpressions(): readonly TableId[]
    {
        return [];
    }

    protected override getPrimarySources(): readonly TableId[]
    {
        return [this.primarySource, this.secondarySource];
    }

    protected override getTransformationName(): string
    {
        return "join";
    }

    // PORT-NOTE: bug fix.  Java saved the column names without applying the renames, so renaming
    // a column in a source table broke the join.
    protected override saveDetail(_destination: JavaFile | null, renames: TableAndColumnRenames): readonly string[]
    {
        return Utility.prependToList(this.keepPrimaryWithNoMatch ? "LEFTJOIN" : "INNERJOIN",
            Utility.mapListI(this.columnsToMatch, p => OutputBuilder.quoted(renames.columnId(this.primarySource, p.getFirst(), null).getSecond().getRaw()) + " EQUALS " + OutputBuilder.quoted(renames.columnId(this.secondarySource, p.getSecond(), null).getSecond().getRaw()))
        );
    }

    protected override transformationHashCode(): number
    {
        return javaObjectsHash(this.primarySource, this.secondarySource, this.keepPrimaryWithNoMatch, this.columnsToMatch);
    }

    public override transformationEquals(transformation: Transformation): boolean
    {
        if (this === transformation) return true;
        if (transformation === null || this.constructor !== transformation.constructor) return false;
        const join = transformation as Join;
        return this.keepPrimaryWithNoMatch === join.keepPrimaryWithNoMatch &&
                this.primarySource.equals(join.primarySource) &&
                javaEquals(this.columnsToMatch, join.columnsToMatch) &&
                this.secondarySource.equals(join.secondarySource);
    }

    public override getData(): RecordSet
    {
        if (this.recordSet !== null)
            return this.recordSet;
        else
            throw new UserException(this.error === null ? "Unknown error in join" : this.error);
    }

    /**
     * The primary table on the "left" of the join
     */
    public getPrimarySource(): TableId
    {
        return this.primarySource;
    }

    /**
     * The secondary table on the "right" of the join.
     */
    public getSecondarySource(): TableId
    {
        return this.secondarySource;
    }

    /**
     * A list of the (primary, secondary) columns where each pair
     * must have equal values in the join.  Empty list means result table will be
     * full cross join with all possible pairings.
     */
    public getColumnsToMatch(): readonly Pair<ColumnId, ColumnId>[]
    {
        return this.columnsToMatch;
    }

    /**
     * If true, it does a left join; all rows from primary table
     * are included at least once, even if they have no match,
     * and all secondary items become Optional wrapped.  If false,
     * does an inner join.
     */
    public isKeepPrimaryWithNoMatch(): boolean
    {
        return this.keepPrimaryWithNoMatch;
    }

    public override visit<T>(visitor: TransformationVisitor<T>): T
    {
        return visitor.join(this);
    }

    public override getSuggestedName(): TableId
    {
        return Join.suggestedName(this.columnsToMatch);
    }

    // PORT-NOTE: bug fix.  Java took both halves of the name from the primary column.
    public static suggestedName(columnsToMatch: readonly Pair<ColumnId, ColumnId>[]): TableId
    {
        return new TableId(IdentifierUtility.spaceSeparated("Join", columnsToMatch.map(p => IdentifierUtility.spaceSeparated(IdentifierUtility.shorten(p.getFirst().getRaw()), "to", IdentifierUtility.shorten(p.getSecond().getRaw())))[0] ?? "none"));
    }
}

export namespace Join
{
    export class Info extends TransformationInfo
    {
        public constructor()
        {
            super("join", "transform.join", "preview-join.png", "join.explanation.short", ["merge"]);
        }

        public override load(mgr: TableManager, initialLoadDetails: Table.InitialLoadDetails, source: readonly TableId[], detail: string, _expressionVersion: ExpressionVersion): Transformation
        {
            if (source.length !== 2)
                throw new UserException("Expected two tables as join sources but found " + source.length);
            const whole = Utility.parseAsOne(detail, s => new TransformationLexer(s), t => new TransformationParser(t), p => p.join());
            const columns: Pair<ColumnId, ColumnId>[] = [];
            for (const ctx of whole.joinColumnLine())
            {
                const a = IdentifierUtility.asExpressionIdentifier(ctx._columnA!.getText());
                const b = IdentifierUtility.asExpressionIdentifier(ctx._columnB!.getText());
                if (a === null)
                    throw new UserException("Invalid column id: \"" + ctx._columnA!.getText() + "\"");
                if (b === null)
                    throw new UserException("Invalid column id: \"" + ctx._columnB!.getText() + "\"");
                columns.push(new Pair(new ColumnId(a), new ColumnId(b)));
            }
            return new Join(mgr, initialLoadDetails, javaListGet(source, 0), javaListGet(source, 1), whole.joinTypeLine().leftJoinKW() !== null, [...columns]);
        }

        public override make(mgr: TableManager, destination: CellPosition, _askForSingleSrcTable: FXPlatformSupplier<Table | null>): SimulationSupplier<Transformation> | null
        {
            return () => new Join(mgr, new Table.InitialLoadDetails(null, null, destination, null), new TableId(""), new TableId(""), false, []);
        }
    }
}
