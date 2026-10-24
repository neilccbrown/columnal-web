// Port of xyz.columnal.transformations.ManualEdit (transformations module).
import type { ExpressionIdentifier, TableDataRowIndex } from "../../anns/Annotations.js";
import type { CellPosition } from "../../data/data/CellPosition.js";
import { Column } from "../../data/data/Column.js";
import { RecordSet } from "../../data/data/RecordSet.js";
import type { SingleSourceTransformation } from "../../data/data/SingleSourceTransformation.js";
import { Table } from "../../data/data/Table.js";
import type { TableManager } from "../../data/data/TableManager.js";
import type { Transformation } from "../../data/data/Transformation.js";
import { ColumnId } from "../../identifiers/id/ColumnId.js";
import type { TableAndColumnRenames } from "../../identifiers/id/TableAndColumnRenames.js";
import { TableId } from "../../identifiers/id/TableId.js";
import { HashMap } from "../../java/HashMap.js";
import { Decimal } from "../../java/JavaBigDecimal.js";
import type { JavaFile } from "../../java/JavaFile.js";
import { javaEquals, javaObjectsHash } from "../../java/JavaObject.js";
import { javaTrim } from "../../java/JavaString.js";
import { TreeMap, TreeSet } from "../../java/TreeMap.js";
import { DataLexer2 } from "../../parsers/generated/DataLexer2.js";
import { DataParser2 } from "../../parsers/generated/DataParser2.js";
import { TransformationLexer } from "../../parsers/generated/TransformationLexer.js";
import { TransformationParser } from "../../parsers/generated/TransformationParser.js";
import type { ExpressionVersion } from "../../parsers/grammar/Versions.js";
import { vocabularyOf } from "../../parsers/grammar/Vocabularies.js";
import { DataType } from "../../types/data/datatype/DataType.js";
import { DataTypeUtility } from "../../types/data/datatype/DataTypeUtility.js";
import { GetValue, type DataTypeValue } from "../../types/data/datatype/DataTypeValue.js";
import { OutputBuilder } from "../../types/loadsave/OutputBuilder.js";
import { ComparableEither } from "../../utility-adt/utility/adt/ComparableEither.js";
import { Either } from "../../utility-adt/utility/adt/Either.js";
import { Pair } from "../../utility-adt/utility/adt/Pair.js";
import { InternalException } from "../../utility-error/error/InternalException.js";
import { InvalidImmediateValueException } from "../../utility-error/error/InvalidImmediateValueException.js";
import { UserException } from "../../utility-error/error/UserException.js";
import { StyledString } from "../../utility-error/styled/StyledString.js";
import type { SimulationFunction } from "../../utility-functional/utility/function/simulation/SimulationFunction.js";
import type { SimulationFunctionInt } from "../../utility-functional/utility/function/simulation/SimulationFunctionInt.js";
import type { SimulationRunnableNoError } from "../../utility-functional/utility/function/simulation/SimulationRunnableNoError.js";
import { ErrorHandler } from "../../utility/log/ErrorHandler.js";
import { Log } from "../../utility/log/Log.js";
import { IdentifierUtility } from "../../utility/utility/IdentifierUtility.js";
import { TranslationUtility } from "../../utility/utility/TranslationUtility.js";
import { Utility } from "../../utility/utility/Utility.js";
import type { Value } from "../../utility/utility/Value.js";
import { SingleSourceTransformationInfo } from "./SingleSourceTransformationInfo.js";
import type { TransformationVisitor } from "./TransformationVisitor.js";
import { VisitableTransformation } from "./VisitableTransformation.js";

import ComparableValue = DataTypeUtility.ComparableValue;

export class ManualEdit extends VisitableTransformation implements SingleSourceTransformation
{
    public static readonly NAME = "correct";

    private readonly srcTableId: TableId;
    private readonly src: Table | null;
    // Kept for saving, in case issue with loading column for keyColumn
    private readonly originalKeyColumn: Pair<ColumnId, DataType> | null;
    // If null, we use the row number as the replacement key.
    // We cache the type to avoid checked exceptions fetching it from the column
    private readonly keyColumn: Pair<Column, DataType> | null;
    private readonly recordSet: Either<StyledString, RecordSet>;
    // PORT-NOTE: a Java HashMap, whose order decides the order of the columns in the saved file.
    private readonly replacements: HashMap<ColumnId, ManualEdit.ColumnReplacementValues>;
    private readonly modificationListeners: SimulationRunnableNoError[] = [];

    public constructor(mgr: TableManager, initialLoadDetails: Table.InitialLoadDetails, srcTableId: TableId, replacementKey: Pair<ColumnId, DataType> | null, replacements: Iterable<readonly [ColumnId, ManualEdit.ColumnReplacementValues]>)
    {
        super(mgr, initialLoadDetails);
        this.srcTableId = srcTableId;
        this.originalKeyColumn = replacementKey;
        this.replacements = HashMap.javaOrder({}, replacements);

        let srcTable: Table | null = null;
        let data: Either<StyledString, RecordSet>;
        let keyColumn: Pair<Column, DataType> | null = null;
        try
        {
            srcTable = mgr.getSingleTableOrThrow(srcTableId);
            const srcData = srcTable.getData();
            if (replacementKey !== null)
            {
                // Check key exists and has same type and unique values for replacement keys:
                const keyCol = srcData.getColumnOrNull(replacementKey.getFirst());
                if (keyCol === null)
                {
                    throw new UserException("Could not find identifier column " + replacementKey.getFirst().getRaw());
                }
                keyColumn = new Pair(keyCol, keyCol.getType().getType());
                if (!keyColumn.getSecond().equals(replacementKey.getSecond()))
                {
                    throw new UserException("Last recorded type of identifier column " + replacementKey.getFirst().getRaw() + " does not match actual column type.");
                }
                const keyValues = new TreeSet<ComparableValue>();
                const srcDataLength: TableDataRowIndex = srcData.getLength();
                const keyColType = keyCol.getType();
                for (let i = 0; i < srcDataLength; i++)
                {
                    try
                    {
                        const value = keyColType.getCollapsed(i);
                        if (!keyValues.add(new ComparableValue(value)))
                        {
                            throw new UserException("Duplicate keys: " + DataTypeUtility.valueToString(value));
                        }
                    }
                    catch (e)
                    {
                        if (!(e instanceof UserException))
                            throw e;
                        // We don't actually mind errors in the key column...
                    }
                }
            }

            const columns: SimulationFunction<RecordSet, Column>[] = Utility.mapList(srcData.getColumns(), c => (rs: RecordSet) => new ManualEdit.ReplacedColumn(this, rs, c));
            data = Either.right(new class extends RecordSet
            {
                public indexValid(index: number): boolean
                {
                    return srcData.indexValid(index);
                }

                public override getLength(): TableDataRowIndex
                {
                    return srcData.getLength();
                }
            }(columns));
        }
        catch (e)
        {
            if (!(e instanceof UserException))
                throw e;
            data = Either.left(e.getStyledMessage());
        }

        this.src = srcTable;
        this.recordSet = data;
        this.keyColumn = keyColumn;
    }

    protected override getSourcesFromExpressions(): readonly TableId[]
    {
        return [this.srcTableId];
    }

    protected override getPrimarySources(): readonly TableId[]
    {
        return [this.srcTableId];
    }

    protected override getTransformationName(): string
    {
        return ManualEdit.NAME;
    }

    protected override saveDetail(_destination: JavaFile | null, renames: TableAndColumnRenames): readonly string[]
    {
        /*
        editKW : {_input.LT(1).getText().equals("EDIT")}? ATOM;
editHeader : editKW (key=item type | NEWLINE);
editColumnKW : {_input.LT(1).getText().equals("EDITCOLUMN")}? ATOM;
editColumnHeader : editColumnKW column=item type;
editColumnDataKW : {_input.LT(1).getText().equals("REPLACEMEMT")}? ATOM;
editColumnData : editColumnDataKW value value;
editColumn : editColumnHeader editColumnData+;
edit : editHeader editColumn*;
         */
        renames.useColumnsFromTo(this.srcTableId, this.getId());
        const r = new OutputBuilder();
        r.raw("EDIT");
        let keyType: DataType;
        if (this.originalKeyColumn !== null)
        {
            r.quote(this.originalKeyColumn.getFirst());
            r.t(TransformationLexer.TYPE_BEGIN, vocabularyOf(TransformationLexer));
            try
            {
                keyType = this.originalKeyColumn.getSecond();
                keyType.save(r);
            }
            catch (e)
            {
                if (!(e instanceof InternalException))
                    throw e;
                Log.log(e);
                // Bail out completely:
                return [];
            }
        }
        else
        {
            keyType = DataType.NUMBER;
        }
        r.nl();
        this.replacements.forEach((crv, c) => {
            try
            {
                r.raw("EDITCOLUMN");
                r.quote(c);
                r.t(TransformationLexer.TYPE_BEGIN, vocabularyOf(TransformationLexer));
                crv.dataType.save(r);
                r.nl();
            }
            catch (e)
            {
                if (!(e instanceof InternalException))
                    throw e;
                Log.log(e);
                r.undoCurLine();
            }
            crv.replacementValues.forEach((v, k) => {
                try
                {
                    r.raw("REPLACEMENT @VALUE ");
                    r.data(keyType.fromCollapsed(GetValue.of((_i, _prog) => k.getValue())), 0);
                    r.raw("@ENDVALUE ");
                    v.eitherEx_(err => {
                        r.raw("@INVALIDVALUE ");
                        r.s(err);
                    }, val => {
                        r.raw("@VALUE ");
                        r.data(crv.dataType.fromCollapsed(GetValue.of((_i, _prog) => val.getValue())), 0);
                    });
                    r.raw(" @ENDVALUE");
                    r.nl();
                }
                catch (e)
                {
                    if (!(e instanceof InternalException || e instanceof UserException))
                        throw e;
                    Log.log(e);
                    r.undoCurLine();
                }
            });
        });

        return r.toLines();
    }

    protected override transformationHashCode(): number
    {
        return javaObjectsHash(this.srcTableId, this.keyColumn, this.replacements);
    }

    protected override transformationEquals(obj: Transformation): boolean
    {
        if (!(obj instanceof ManualEdit))
            return false;
        const m = obj;
        return javaEquals(this.srcTableId, m.srcTableId)
                && javaEquals(this.keyColumn, m.keyColumn)
                && javaEquals(this.replacements, m.replacements);
    }

    public override getData(): RecordSet
    {
        return this.recordSet.eitherEx(e => { throw new UserException(e); }, rs => rs);
    }

    /**
     * Empty (null) means identified by row number
     */
    public getReplacementIdentifier(): ColumnId | null
    {
        return this.keyColumn === null ? null : this.keyColumn.getFirst().getName();
    }

    public swapReplacementsTo(newReplacements: Iterable<readonly [ColumnId, ManualEdit.ColumnReplacementValues]>): SimulationFunctionInt<TableId, ManualEdit>
    {
        return id => new ManualEdit(this.getManager(), this.getDetailsForCopy(id), this.getSrcTableId(), this.keyColumn === null ? null : this.keyColumn.mapFirst(c => c.getName()), newReplacements);
    }

    /**
     * This method gives back a TableMaker which is only permitted to throw an InternalException, so most of the work is done in this method which may throw a UserException, and only the actual creation is inside the returned TableMaker.
     *
     * This method looks up values for the existing replacement key for each edit, and maps them to a corresponding value of the new replacement key.  Duplicates will not cause an exception to be thrown.
     *
     * @param newReplacementKey The new column to replace by (or null for row number).  If not found a UserException will be thrown.
     * @return
     * @throws InternalException
     * @throws UserException
     */
    public swapReplacementIdentifierTo(newReplacementKey: ColumnId | null): SimulationFunctionInt<TableId, ManualEdit>
    {
        const src = this.src;
        if (src === null)
            throw new UserException("Cannot modify manual edit when original table is missing.");

        const srcRecordSet = src.getData();
        const length = srcRecordSet.getLength();
        const newKeyColumn = newReplacementKey === null ? null : srcRecordSet.getColumn(newReplacementKey);

        // Need to go through existing replacements and find the value in the new column:

        // Java: a Guava TreeMultimap, with the keys in natural order and the values ordered by Pair.comparator()
        // Each item is (value in identifier column, (target column, value to change to))
        const toFind = new TreeMap<ComparableValue, TreeSet<Pair<ColumnId, ComparableEither<string, ComparableValue>>>>();
        for (const [column, crv] of this.replacements.entries())
        {
            for (const [key, value] of crv.replacementValues.entries())
            {
                let values = toFind.get(key);
                if (values === undefined)
                {
                    values = new TreeSet<Pair<ColumnId, ComparableEither<string, ComparableValue>>>(undefined, Pair.comparator<ColumnId, ComparableEither<string, ComparableValue>>());
                    toFind.set(key, values);
                }
                values.add(new Pair(column, value));
            }
        }

        const newReplacements = HashMap.javaOrder<ColumnId, ManualEdit.ColumnReplacementValues>();

        for (let row = 0; row < length; row++)
        {
            if (toFind.size === 0)
                break;

            const existingKeyValue = this.keyColumn === null ? new ComparableValue(new Decimal(row)) : new ComparableValue(this.keyColumn.getFirst().getType().getCollapsed(row));
            const matchingValues = toFind.get(existingKeyValue);

            if (matchingValues !== undefined && matchingValues.size !== 0)
            {
                for (const matchingValue of matchingValues)
                {
                    const column = src.getData().getColumn(matchingValue.getFirst());
                    const columnType = column.getType().getType();
                    const newKeyValue = newKeyColumn === null ? new ComparableValue(new Decimal(row)) : new ComparableValue(newKeyColumn.getType().getCollapsed(row));
                    newReplacements.computeIfAbsent(matchingValue.getFirst(), _k => new ManualEdit.ColumnReplacementValues(columnType, [])).replacementValues.set(newKeyValue, matchingValue.getSecond());
                }
                // Java: matchingValues.clear(), which removes the key from the multimap
                toFind.delete(existingKeyValue);
            }
        }

        const replacementKeyPair = newKeyColumn === null ? null : new Pair(newKeyColumn.getName(), newKeyColumn.getType().getType());

        return id => new ManualEdit(this.getManager(), this.getDetailsForCopy(id), this.srcTableId, replacementKeyPair, [...newReplacements.entries()]);
    }

    public getSrcTable(): Table | null
    {
        return this.src;
    }

    public getSrcTableId(): TableId
    {
        return this.srcTableId;
    }

    public _test_getReplacements(): HashMap<ColumnId, TreeMap<ComparableValue, ComparableEither<string, ComparableValue>>>
    {
        const r = HashMap.javaOrder<ColumnId, TreeMap<ComparableValue, ComparableEither<string, ComparableValue>>>();
        this.replacements.forEach((crv, c) => r.set(c, crv.replacementValues));
        return r;
    }

    public getReplacementCount(): number
    {
        let sum = 0;
        for (const crv of this.replacements.values())
            sum += crv.replacementValues.size;
        return sum;
    }

    /**
     * Note -- this is an expensive operation, so call sparingly.
     */
    public getReplacements(): HashMap<ColumnId, ManualEdit.ColumnReplacementValues>
    {
        const r = new HashMap<ColumnId, ManualEdit.ColumnReplacementValues>();

        this.replacements.forEach((crv, c) => {
            const crvCopy = crv.makeCopy();
            r.set(c, crvCopy);
        });

        return r;
    }

    public addModificationListener(listener: SimulationRunnableNoError): void
    {
        this.modificationListeners.push(listener);
    }

    private getReplacementKeyForRow(index: number): ComparableValue
    {
        if (this.keyColumn === null)
            return new ComparableValue(new Decimal(index));
        return new ComparableValue(this.keyColumn.getFirst().getType().getCollapsed(index));
    }

    public withNewSource(newSrcTableId: TableId): Transformation
    {
        return new ManualEdit(this.getManager(), this.getDetailsForCopy(this.getId()), newSrcTableId, this.keyColumn === null ? null : this.keyColumn.mapFirst(c => c.getName()), [...this.replacements.entries()]);
    }

    public override visit<T>(visitor: TransformationVisitor<T>): T
    {
        return visitor.manualEdit(this);
    }

    public override getSuggestedName(): TableId
    {
        return ManualEdit.suggestedName(this.originalKeyColumn === null ? null : this.originalKeyColumn.getFirst(), this.replacements);
    }

    public static suggestedName(keyColumn: ColumnId | null, _repls: unknown): TableId
    {
        const parts: ExpressionIdentifier[] = [];
        parts.push("Edit by");
        parts.push(keyColumn === null ? "row" : IdentifierUtility.shorten(keyColumn.getRaw()));
        return new TableId(IdentifierUtility.spaceSeparated(parts));
    }

    // Java: the private inner class ReplacedColumn
    private static readonly ReplacedColumn = class extends Column
    {
        private readonly outer: ManualEdit;
        private readonly original: Column;
        private dataType: DataTypeValue | null = null;

        public constructor(outer: ManualEdit, recordSet: RecordSet, original: Column)
        {
            super(recordSet, original.getName());
            this.outer = outer;
            this.original = original;
        }

        public override getEditableStatus(): Column.EditableStatus
        {
            return new Column.EditableStatus(true, rowIndex => {
                const keyColumn = this.outer.keyColumn;
                // Check if that row has valid identifier for replacement.
                if (keyColumn === null)
                    return true; // Row number is always valid
                try
                {
                    // If there's an error, an exception will be thrown:
                    keyColumn.getFirst().getType().getCollapsed(rowIndex);
                    return true;
                }
                catch (e)
                {
                    if (!(e instanceof UserException))
                        throw e;
                    return false;
                }
            });
        }

        public getType(): DataTypeValue
        {
            if (this.dataType === null)
            {
                const replacements = this.outer.replacements;
                const keyColumn = this.outer.keyColumn;
                const originalType = this.original.getType();
                const getType = originalType.getType().fromCollapsed(GetValue.of((i, _prog) => {
                    const columnReplacements = replacements.get(this.getName()) ?? null;
                    let replaced: ComparableEither<string, ComparableValue> | null = null;
                    try
                    {
                        const replaceKey: Value = keyColumn === null ? new Decimal(i) : keyColumn.getFirst().getType().getCollapsed(i);
                        replaced = columnReplacements === null ? null : (columnReplacements.replacementValues.get(new ComparableValue(replaceKey)) ?? null);
                    }
                    catch (e)
                    {
                        if (!(e instanceof UserException))
                            throw e;
                        // If error in fetching key, don't replace.
                    }
                    if (replaced !== null)
                        return replaced.eitherEx<Value>(err => { throw new InvalidImmediateValueException(StyledString.s(err), err); }, v => v.getValue());
                    else
                        return originalType.getCollapsed(i);
                }));

                this.dataType = getType.withSet((index, value) => {
                    const columnReplacements = replacements.computeIfAbsent(this.getName(), _k => new ManualEdit.ColumnReplacementValues(getType.getType(), []));
                    ErrorHandler.getErrorHandler().alertOnError_(TranslationUtility.getString("error.lookup.identifier"), () =>
                    {
                        columnReplacements.replacementValues.set(
                            this.outer.getReplacementKeyForRow(index),
                            value.either<ComparableEither<string, ComparableValue>>(err => ComparableEither.left<string, ComparableValue>(err), v => ComparableEither.right<string, ComparableValue>(new ComparableValue(v)))
                        );
                    });
                    // Notify dependents:
                    this.recordSet.modified(this.getName(), index);
                    this.outer.modificationListeners.forEach(l => l());
                });
            }
            return this.dataType;
        }

        public getAlteredState(): Column.AlteredState
        {
            return this.outer.replacements.has(this.getName()) ? Column.AlteredState.OVERWRITTEN : Column.AlteredState.UNALTERED;
        }
    };
}

export namespace ManualEdit
{
    export class ColumnReplacementValues
    {
        // Must be exactly equal to the source column's type
        // (Java: private, but accessed by ManualEdit)
        public readonly dataType: DataType;

        // The key is either a value in ManualEdit.this.replacementKey column
        // or if that is null, it's a row number.
        // Keys must be comparable for TreeMap, values are comparable to
        // help with equals definition.
        public readonly replacementValues: TreeMap<ComparableValue, ComparableEither<string, ComparableValue>>;

        public constructor(dataType: DataType, replacementValues: readonly Pair<Value, Either<string, Value>>[])
        {
            this.dataType = dataType;
            this.replacementValues = new TreeMap();
            for (const replacementValue of replacementValues)
            {
                this.replacementValues.set(new ComparableValue(replacementValue.getFirst()), replacementValue.getSecond().either<ComparableEither<string, ComparableValue>>(l => ComparableEither.left<string, ComparableValue>(l), r => ComparableEither.right<string, ComparableValue>(new ComparableValue(r))));
            }
        }

        public hashCode(): number
        {
            // We don't hash the map because that is unreliable,
            // so we restrict ourselves and accept hash collisions:
            return javaObjectsHash(this.dataType);
        }

        public equals(obj: unknown): boolean
        {
            if (!(obj instanceof ColumnReplacementValues))
                return false;
            const crv = obj;
            return javaEquals(this.dataType, crv.dataType) && javaEquals(this.replacementValues, crv.replacementValues);
        }

        public makeCopy(): ColumnReplacementValues
        {
            return new ColumnReplacementValues(this.dataType, [...this.replacementValues.entries()].map(([k, v]) => new Pair<Value, Either<string, Value>>(k.getValue(), v.map(v => v.getValue()))));
        }

        public streamAll(): Pair<ComparableValue, ComparableEither<string, ComparableValue>>[]
        {
            return [...this.replacementValues.entries()].map(([k, v]) => new Pair(k, v));
        }
    }

    export class Info extends SingleSourceTransformationInfo
    {
        public constructor()
        {
            super(ManualEdit.NAME, "transform.edit", "preview-edit.png", "edit.explanation.short", []);
        }

        public override loadSingle(mgr: TableManager, initialLoadDetails: Table.InitialLoadDetails, srcTableId: TableId, detail: string, _expressionVersion: ExpressionVersion): Transformation
        {
            const editContext = Utility.parseAsOne(detail, s => new TransformationLexer(s), t => new TransformationParser(t), p => p.edit());
            let replacementKey: Pair<ColumnId, DataType> | null;
            if (editContext.editHeader()._key !== null && editContext.editHeader()._key !== undefined)
            {
                const columnId = new ColumnId(editContext.editHeader()._key!.getText() as ExpressionIdentifier);
                replacementKey = new Pair(columnId, mgr.getTypeManager().loadTypeUse(editContext.editHeader().type()!.TYPE().getText()));
            }
            else
            {
                replacementKey = null;
            }

            // PORT-NOTE: a Java HashMap (copied to an ImmutableMap), whose order is observable.
            const replacements = HashMap.javaOrder<ColumnId, ColumnReplacementValues>();
            for (const editColumnContext of editContext.editColumn())
            {
                const columnId = new ColumnId(editColumnContext.editColumnHeader()._column!.getText() as ExpressionIdentifier);
                const dataType = mgr.getTypeManager().loadTypeUse(editColumnContext.editColumnHeader().type().TYPE().getText());
                const replacementValues: Pair<Value, Either<string, Value>>[] = [];
                for (const editColumnDatum of editColumnContext.editColumnData())
                {
                    const key = Utility.parseAsOne(javaTrim(editColumnDatum.value(0)!.VALUE().getText()), s => new DataLexer2(s), t => new DataParser2(t), p => DataType.loadSingleItem(replacementKey === null ? DataType.NUMBER : replacementKey.getSecond(), p, false)).eitherEx<Value>(s => { throw new UserException(s); }, x => x);
                    const dataValue = editColumnDatum.value(1)!;
                    const value = Utility.parseAsOne(javaTrim(dataValue.VALUE().getText()), s => new DataLexer2(s), t => new DataParser2(t), p => dataValue.INVALID_VALUE_BEGIN() !== null ? Either.left<string, Value>(p.string_().STRING().getText()) : DataType.loadSingleItem(dataType, p, false));
                    replacementValues.push(new Pair(key, value));
                }

                replacements.set(columnId, new ColumnReplacementValues(dataType, replacementValues));
            }

            return new ManualEdit(mgr, initialLoadDetails, srcTableId, replacementKey, [...replacements.entries()]);
        }

        protected override makeWithSource(mgr: TableManager, destination: CellPosition, srcTable: Table): Transformation
        {
            return new ManualEdit(mgr, new Table.InitialLoadDetails(null, null, destination, null), srcTable.getId(), null, []);
        }
    }
}
