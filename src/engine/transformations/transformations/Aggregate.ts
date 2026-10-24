// Port of xyz.columnal.transformations.Aggregate (transformations module).
import type { ExpressionIdentifier, TableDataRowIndex } from "../../anns/Annotations.js";
import type { CellPosition } from "../../data/data/CellPosition.js";
import { Column } from "../../data/data/Column.js";
import { ColumnUtility } from "../../data/data/ColumnUtility.js";
import { ErrorColumn } from "../../data/data/ErrorColumn.js";
import type { RecordSet } from "../../data/data/RecordSet.js";
import type { SingleSourceTransformation } from "../../data/data/SingleSourceTransformation.js";
import { Table } from "../../data/data/Table.js";
import type { TableManager } from "../../data/data/TableManager.js";
import { TransformationRecordSet } from "../../data/data/TransformationRecordSet.js";
import type { Transformation } from "../../data/data/Transformation.js";
import { BracketedStatus } from "../../expressions/transformations/expression/BracketedStatus.js";
import { ErrorAndTypeRecorderStorer } from "../../expressions/transformations/expression/ErrorAndTypeRecorderStorer.js";
import { EvaluateState } from "../../expressions/transformations/expression/EvaluateState.js";
import { Expression, IdentExpression } from "../../expressions/transformations/expression/Expressions.js";
import { ExpressionUtil } from "../../expressions/transformations/expression/ExpressionUtil.js";
import { TypeState } from "../../expressions/transformations/expression/TypeState.js";
import { FunctionList } from "../../functions/transformations/function/FunctionList.js";
import { ColumnId } from "../../identifiers/id/ColumnId.js";
import type { TableAndColumnRenames } from "../../identifiers/id/TableAndColumnRenames.js";
import { TableId } from "../../identifiers/id/TableId.js";
import { BitSet } from "../../java/BitSet.js";
import { javaListGet } from "../../java/JavaCollections.js";
import { HashSet } from "../../java/HashMap.js";
import { Decimal } from "../../java/JavaBigDecimal.js";
import type { JavaFile } from "../../java/JavaFile.js";
import { javaEquals, javaHashCode } from "../../java/JavaObject.js";
import { TreeMap } from "../../java/TreeMap.js";
import { TransformationLexer } from "../../parsers/generated/TransformationLexer.js";
import { TransformationParser } from "../../parsers/generated/TransformationParser.js";
import type { ExpressionVersion } from "../../parsers/grammar/Versions.js";
import { vocabularyOf } from "../../parsers/grammar/Vocabularies.js";
import type { DataType } from "../../types/data/datatype/DataType.js";
import { DataTypeUtility } from "../../types/data/datatype/DataTypeUtility.js";
import { DataTypeValue, GetValue } from "../../types/data/datatype/DataTypeValue.js";
import { ListExDTV } from "../../types/data/datatype/ListExDTV.js";
import type { ProgressListener } from "../../types/data/datatype/ProgressListener.js";
import type { TypeManager } from "../../types/data/datatype/TypeManager.js";
import { OutputBuilder } from "../../types/loadsave/OutputBuilder.js";
import { TypeExp } from "../../types/typeExp/TypeExps.js";
import { Pair } from "../../utility-adt/utility/adt/Pair.js";
import { InternalException } from "../../utility-error/error/InternalException.js";
import { UserException } from "../../utility-error/error/UserException.js";
import { StyledString } from "../../utility-error/styled/StyledString.js";
import type { SimulationFunctionInt } from "../../utility-functional/utility/function/simulation/SimulationFunctionInt.js";
import { Log } from "../../utility/log/Log.js";
import { IdentifierUtility } from "../../utility/utility/IdentifierUtility.js";
import { Utility } from "../../utility/utility/Utility.js";
import type { Value } from "../../utility/utility/Value.js";
import { FoundTableActual } from "./FoundTableActual.js";
import { SingleSourceTransformationInfo } from "./SingleSourceTransformationInfo.js";
import type { TransformationVisitor } from "./TransformationVisitor.js";
import { VisitableTransformation } from "./VisitableTransformation.js";

import ComparableValue = DataTypeUtility.ComparableValue;

// A BitSet, with a cached array of int indexes indicating the set bits
class Occurrences
{
    public readonly bitSet: BitSet;
    private indexes: number[] | null = null; // The indexes of the set bits

    public constructor(bitSet: BitSet)
    {
        this.bitSet = bitSet;
    }

    public getIndexes(): number[]
    {
        if (this.indexes === null)
        {
            const indexes: number[] = [];
            for (let i = this.bitSet.nextSetBit(0); i >= 0; i = this.bitSet.nextSetBit(i + 1))
            {
                indexes.push(i);
            }
            this.indexes = indexes;
        }
        return this.indexes;
    }
}

class JoinedSplit
{
    public readonly columns: readonly Column[];
    // This list is in sorted order of the value list,
    // because of the way it is constructed
    public readonly valuesAndOccurrences: readonly Pair<readonly Value[], Occurrences>[];

    // Java has three constructors:
    //  - JoinedSplit(int length): creates an empty split, which has one occurrence at all indexes
    //  - JoinedSplit(Column column, TreeMap<ComparableValue, BitSet> valuesAndOccurrences)
    //  - JoinedSplit(ImmutableList<Column> columns, ImmutableList<Pair<List<@Value Object>, Occurrences>> valuesAndOccurrences)
    public constructor(length: number);
    public constructor(column: Column, valuesAndOccurrences: TreeMap<ComparableValue, BitSet>);
    public constructor(columns: readonly Column[], valuesAndOccurrences: readonly Pair<readonly Value[], Occurrences>[]);
    public constructor(a: number | Column | readonly Column[], b?: TreeMap<ComparableValue, BitSet> | readonly Pair<readonly Value[], Occurrences>[])
    {
        if (typeof a === "number")
        {
            this.columns = [];
            const bitSet = new BitSet();
            bitSet.set(0, a);
            this.valuesAndOccurrences = [new Pair<readonly Value[], Occurrences>([], new Occurrences(bitSet))];
        }
        else if (a instanceof Column)
        {
            this.columns = [a];
            const valOccBuilder: Pair<readonly Value[], Occurrences>[] = [];
            (b as TreeMap<ComparableValue, BitSet>).forEach((v: BitSet, k: ComparableValue) =>
            {
                valOccBuilder.push(new Pair<readonly Value[], Occurrences>([k.getValue()], new Occurrences(v)));
            });
            this.valuesAndOccurrences = valOccBuilder;
        }
        else
        {
            this.columns = a;
            this.valuesAndOccurrences = b as readonly Pair<readonly Value[], Occurrences>[];
        }
    }
}

class SingleSplit
{
    public readonly column: Column;
    public readonly valuesAndOccurrences: TreeMap<ComparableValue, BitSet>;

    public constructor(column: Column, valuesAndOccurrences: TreeMap<ComparableValue, BitSet>)
    {
        this.column = column;
        this.valuesAndOccurrences = valuesAndOccurrences;
    }
}

/**
 * Created by neil on 21/10/2016.
 */
export class Aggregate extends VisitableTransformation implements SingleSourceTransformation
{
    public static readonly NAME = "aggregate";
    private readonly src: Table | null;
    private readonly srcTableId: TableId;
    // ColumnId here is the destination column, not source column:
    private readonly summaries: readonly Pair<ColumnId, Expression>[];

    // Columns to split by:
    private readonly splitBy: readonly ColumnId[];
    private readonly error: string;
    private readonly result: TransformationRecordSet | null;
    private readonly splits: JoinedSplit;

    public constructor(mgr: TableManager, initialLoadDetails: Table.InitialLoadDetails, srcTableId: TableId, summaries: readonly Pair<ColumnId, Expression>[], splitBy: readonly ColumnId[])
    {
        super(mgr, initialLoadDetails);
        this.srcTableId = srcTableId;
        this.src = mgr.getSingleTableOrNull(srcTableId);
        this.summaries = summaries;
        this.splitBy = splitBy;
        let src: RecordSet | null = null;
        let srcLength = 0;
        let theError = "Could not find source table: \"" + srcTableId.toString() + "\"";
        try
        {
            src = this.src !== null ? this.src.getData() : null;
            srcLength = src === null ? 0 : src.getLength();
        }
        catch (e)
        {
            if (!(e instanceof UserException))
                throw e;
            theError = "Error with source table: \"" + srcTableId.toString() + "\"";
        }
        if (this.src === null || src === null)
        {
            this.error = theError;
            this.splits = new JoinedSplit(srcLength);
            this.result = null;
            return;
        }

        theError = "Unknown error with table \"" + this.getId().toString() + "\"";

        let theSplits: JoinedSplit;
        try
        {
            theSplits = Aggregate.calcSplits(src, srcLength, splitBy);
        }
        catch (e)
        {
            if (!(e instanceof UserException))
                throw e;
            this.error = e.getLocalizedMessage();
            this.splits = new JoinedSplit(srcLength);
            this.result = null;
            return;
        }

        this.splits = theSplits;
        const splits = theSplits;
        let theResult: TransformationRecordSet | null = new class extends TransformationRecordSet
        {
            public indexValid(index: number): boolean
            {
                return index < this.getLength();
            }

            public override getLength(): TableDataRowIndex
            {
                return summaries.length === 0 && splitBy.length === 0 ? 0 : splits.valuesAndOccurrences.length;
            }
        }();

        try
        {
            // eslint-disable-next-line @typescript-eslint/no-this-alias -- the inner class's outer instance
            const self = this;
            if (splitBy.length !== 0)
            {
                for (let i = 0; i < splitBy.length; i++)
                {
                    const orig = theSplits.columns[i]!;
                    const splitColumnIndex = i;
                    theResult.buildColumn(rs => new class extends Column
                    {
                        private getWithProgress(index: number, _progressListener: ProgressListener | null): Value
                        {
                            return Utility.getI(Utility.getI(splits.valuesAndOccurrences, index).getFirst(), splitColumnIndex);
                        }

                        public getType(): DataTypeValue
                        {
                            return self.addManualEditSet(this.getName(), orig.getType().getType().fromCollapsed(GetValue.of((index, prog) => this.getWithProgress(index, prog))));
                        }

                        public getAlteredState(): Column.AlteredState
                        {
                            return Column.AlteredState.OVERWRITTEN;
                        }
                    }(rs, orig.getName()));
                }
            }



            // It's important that our splits and record set are initialised
            // before trying to calculate these expressions:
            const columnLookup = this.getColumnLookupFor(theResult);
            for (const e of summaries)
            {
                const expression = e.getSecond();
                const errors = new ErrorAndTypeRecorderStorer();
                let column: SimulationFunctionInt<RecordSet, Column>;
                try
                {
                    const type = expression.checkExpression(columnLookup, Aggregate.makeTypeState(mgr), errors);
                    const concrete: DataType | null = type === null ? null : errors.recordLeftError(mgr.getTypeManager(), FunctionList.getFunctionLookup(mgr.getUnitManager()), expression, type.toConcreteType(mgr.getTypeManager()));
                    if (type === null || concrete === null)
                        throw new UserException(errors.getAllErrors()[0] ?? StyledString.s("Unknown type error"));
                    const typeFinal: DataType = concrete;
                    column = rs => ColumnUtility.makeCalculatedColumn(typeFinal, rs, e.getFirst(), i => expression.calculateValue(Aggregate.makeEvaluateState(splits, mgr.getTypeManager(), i, false)).value, t => this.addManualEditSet(e.getFirst(), t));

                }
                catch (ex)
                {
                    if (!(ex instanceof UserException))
                        throw ex;
                    column = rs => new ErrorColumn(rs, this.getManager().getTypeManager(), e.getFirst(), ex.getStyledMessage());
                }
                theResult.buildColumn(column);
            }
        }
        catch (e)
        {
            if (!(e instanceof UserException))
                throw e;
            theError = e.getLocalizedMessage();
            theResult = null;
        }
        this.error = theError;
        this.result = theResult;
    }

    private static makeEvaluateState(splits: JoinedSplit, mgr: TypeManager, rowIndex: number, recordExplanation: boolean): EvaluateState
    {
        let evaluateState = new EvaluateState(mgr, rowIndex, recordExplanation);
        evaluateState = evaluateState.add(TypeState.GROUP_COUNT, new Decimal(javaListGetSplit(splits, rowIndex).getSecond().bitSet.cardinality()));
        return evaluateState;
    }

    // For re-running expressions for explanations:
    public recreateEvaluateState(typeManager: TypeManager, rowIndex: TableDataRowIndex, recordExplanation: boolean): EvaluateState
    {
        return Aggregate.makeEvaluateState(this.splits, typeManager, rowIndex, recordExplanation);
    }

    public static makeTypeState(mgr: TableManager): TypeState
    {
        let typeState: TypeState | null = new TypeState(mgr.getTypeManager(), FunctionList.getFunctionLookup(mgr.getUnitManager()));
        typeState = typeState.add(TypeState.GROUP_COUNT, TypeExp.plainNumber(null), _ss => {});
        if (typeState !== null)
            return typeState;
        else
            throw new InternalException("group count variable was already added");
    }

    private static calcSplits(src: RecordSet, srcLength: number, splitBy: readonly ColumnId[]): JoinedSplit
    {
        // Each item in outer is a column in the set of columns which we are splitting by.
        // Each item in inner.values is a possible value of that column;
        const splits: SingleSplit[] = [];
        for (const colName of splitBy)
        {
            const c = src.getColumn(colName);
            // A bit is set if the value occurred at a particular index:
            const r = new TreeMap<ComparableValue, BitSet>();
            try
            {
                for (let i = 0; c.indexValid(i); i++)
                {
                    const iFinal = i;
                    r.compute(new ComparableValue(c.getType().getCollapsed(i)), (_k, bs) => {
                        if (bs === null)
                            bs = new BitSet();
                        bs.set(iFinal);
                        return bs;
                    });
                }
                splits.push(new SingleSplit(c, r));
            }
            // Unwrap exceptions that occur in the comparator:
            catch (e)
            {
                // PORT-NOTE: Java catches RuntimeExceptions (unwrapping a User/InternalException
                // cause); here a UserException or InternalException is never wrapped.
                if (e instanceof UserException || e instanceof InternalException)
                    throw e;
                throw new InternalException("Unexpected Runtime exception", e);
            }

        }
        // Now form cross-product:
        return Aggregate.crossProduct(splits, srcLength);
    }

    /**
     * Given a list of columns and their values and index occurrences, calculates the
     * set of all combinations that occur at least once.
     *
     * @param allDistincts The list of per-single-column values and occurrences (one entry per column)
     * @return The list of all joined value combinations of the split columns that actually occur at least once.
     */
    private static crossProduct(allDistincts: readonly SingleSplit[], srcLength: number): JoinedSplit
    {
        if (allDistincts.length === 0)
        {
            return new JoinedSplit(srcLength);
        }
        else if (allDistincts.length === 1)
        {
            // Turn single split into a joined split:
            const single = allDistincts[0]!;
            return new JoinedSplit(single.column, single.valuesAndOccurrences);
        }
        // Take next list:
        const first = allDistincts[0]!;
        // Recurse to get cross product of the rest:
        const rest = Aggregate.crossProduct(allDistincts.slice(1), srcLength);
        // Don't know size in advance because not all combinations will occur:
        const valuesAndOccurrences: Pair<readonly Value[], Occurrences>[] = [];
        // Important that the first list is outermost, so that
        // we add all the items with earliest value of first, thus
        // keeping the result in order of first column foremost,
        // then going by order of rest.
        first.valuesAndOccurrences.forEach((firstOcc, firstVal) =>
        {
            for (const restPair of rest.valuesAndOccurrences)
            {
                // BitSet is mutable, so important to clone:
                const jointOccurrence = firstOcc.clone();
                jointOccurrence.and(restPair.getSecond().bitSet);
                if (!jointOccurrence.isEmpty())
                {
                    valuesAndOccurrences.push(new Pair<readonly Value[], Occurrences>(Utility.prependToList(firstVal.getValue(), restPair.getFirst()), new Occurrences(jointOccurrence)));
                }
            }
        });
        return new JoinedSplit(Utility.prependToList(first.column, rest.columns), valuesAndOccurrences);
    }

    public override getData(): RecordSet
    {
        if (this.result === null)
            throw new UserException(this.error);
        return this.result;
    }

    protected override getTransformationName(): string
    {
        return Aggregate.NAME;
    }

    protected override saveDetail(_destination: JavaFile | null, renames: TableAndColumnRenames): readonly string[]
    {
        const b = new OutputBuilder();
        for (const entry of this.summaries)
        {
            b.kw("SUMMARY");
            b.id(renames.columnId(this.getId(), entry.getFirst(), null).getSecond());
            b.t(TransformationLexer.EXPRESSION_BEGIN, vocabularyOf(TransformationLexer));
            b.raw(entry.getSecond().save(Expression.SaveDestination.TO_FILE, BracketedStatus.DONT_NEED_BRACKETS, renames.withDefaultTableId(this.srcTableId)));
            b.nl();
        }
        for (const c of this.splitBy)
        {
            b.kw("SPLIT").id(renames.columnId(this.srcTableId, c, null).getSecond()).nl();
        }
        return b.toLines();
    }

    public getSrcTableId(): TableId
    {
        return this.srcTableId;
    }

    public withNewSource(newSrcTableId: TableId): Transformation
    {
        return new Aggregate(this.getManager(), this.getDetailsForCopy(this.getId()), newSrcTableId, this.summaries, this.splitBy);
    }

    public override getPrimarySources(): readonly TableId[]
    {
        return [this.srcTableId];
    }

    public override getSourcesFromExpressions(): readonly TableId[]
    {
        return ExpressionUtil.tablesFromExpressions(this.summaries.map(p => p.getSecond()));
    }

    public getColumnExpressions(): readonly Pair<ColumnId, Expression>[]
    {
        return this.summaries;
    }

    public getSplitBy(): readonly ColumnId[]
    {
        return this.splitBy;
    }

    public override transformationEquals(o: Transformation): boolean
    {
        const that = o as Aggregate;

        if (!this.srcTableId.equals(that.srcTableId)) return false;
        if (!javaEquals(this.summaries, that.summaries)) return false;
        return javaEquals(this.splitBy, that.splitBy);
    }

    public override transformationHashCode(): number
    {
        let result = this.srcTableId.hashCode();
        result = (Math.imul(31, result) + javaHashCode(this.summaries)) | 0;
        result = (Math.imul(31, result) + javaHashCode(this.splitBy)) | 0;
        return result;
    }

    // Java: public getColumnLookup() and private getColumnLookup(RecordSet thisRecordSet)
    public getColumnLookup(): Expression.ColumnLookup
    {
        if (this.result !== null)
            return this.getColumnLookupFor(this.result);
        else
            return {
                getColumn(_expression: Expression, _tableId: TableId | null, _columnId: ColumnId): Expression.ColumnLookup.FoundColumn | null
                {
                    return null;
                },

                getAvailableColumnReferences(): Pair<TableId | null, ColumnId>[]
                {
                    return [];
                },

                getPossibleColumnReferences(_tableId: TableId, _columnId: ColumnId): Expression.ColumnLookup.ClickedReference[]
                {
                    return [];
                },

                getTable(_tableName: TableId | null): Expression.ColumnLookup.FoundTable | null
                {
                    return null;
                },

                getAvailableTableReferences(): TableId[]
                {
                    return [];
                },
            };
    }

    private getColumnLookupFor(thisRecordSet: RecordSet): Expression.ColumnLookup
    {
        const tableManager = this.getManager();
        const getId = (): TableId => this.getId();
        const srcTableId = this.srcTableId;
        const splitBy = this.splitBy;
        const getSplits = (): JoinedSplit => this.splits;

        const getAvailableColumnReferences = (nullIds: boolean): Pair<TableId | null, ColumnId>[] =>
        {
            const all = tableManager.getAllTablesAvailableTo(getId(), false).flatMap((t: Table): Pair<TableId | null, ColumnId>[] =>
            {
                try
                {
                    const tableId: TableId | null = (t.getId().equals(getId()) || t.getId().equals(srcTableId)) && nullIds ? null : t.getId();
                    return t.getData().getColumns().map(c => new Pair<TableId | null, ColumnId>(tableId, c.getName()));
                }
                catch (e)
                {
                    if (e instanceof UserException)
                    {
                        // Just return empty stream
                    }
                    else if (e instanceof InternalException)
                    {
                        Log.log(e);
                    }
                    else
                        throw e;
                }
                return [];
            });
            // Stream.distinct():
            return [...new HashSet(all)];
        };

        return {
            getColumn(_expression: Expression, tableId: TableId | null, columnId: ColumnId): Expression.ColumnLookup.FoundColumn | null
            {
                let grouped = false;
                if (tableId === null || tableId.equals(getId()) || tableId.equals(srcTableId))
                {
                    // It's us -- may be a grouped or split column
                    grouped = !splitBy.some(s => s.equals(columnId));
                }

                try
                {
                    let table: Pair<TableId, RecordSet>;
                    if (!grouped && (tableId === null || tableId.equals(getId())))
                        table = new Pair<TableId, RecordSet>(getId(), thisRecordSet);
                    else
                    {
                        const found = tableManager.getSingleTableOrNull(tableId === null ? srcTableId : tableId);
                        if (found !== null)
                            table = new Pair<TableId, RecordSet>(found.getId(), found.getData());
                        else
                            return null;
                    }
                    let column = table.getSecond().getColumnOrNull(columnId);
                    if (column === null && tableId === null)
                    {
                        // Could be in our source table but not copied forwards to us:
                        const srcTable = tableManager.getSingleTableOrNull(srcTableId);
                        if (srcTable !== null)
                        {
                            column = srcTable.getData().getColumnOrNull(columnId);
                            table = new Pair<TableId, RecordSet>(srcTable.getId(), srcTable.getData());
                        }
                    }

                    if (column === null)
                        throw new UserException("Could not find column: " + columnId.getRaw());

                    const columnFinal: Column = column;
                    if (grouped)
                    {
                        return new Expression.ColumnLookup.FoundColumn(table.getFirst(), srcTableId.equals(tableId), DataTypeValue.array(column.getType().getType(), GetValue.of((i, _prog) => {
                            const splitInfo = javaListGetSplit(getSplits(), i);
                            return new ListExDTV(splitInfo.getSecond().getIndexes().length, columnFinal.getType().getType().fromCollapsed(GetValue.of((j, _prog2) => columnFinal.getType().getCollapsed(splitInfo.getSecond().getIndexes()[j]!))));
                        })), null);
                    }
                    else
                    {
                        // If not grouped, must be in split by
                        return new Expression.ColumnLookup.FoundColumn(table.getFirst(), srcTableId.equals(tableId), columnFinal.getType(), null);
                    }
                }
                catch (e)
                {
                    if (e instanceof InternalException)
                    {
                        Log.log(e);
                    }
                    else if (e instanceof UserException)
                    {
                        // Just give back null:
                    }
                    else
                        throw e;
                }
                return null;
            },

            getAvailableColumnReferences(): Pair<TableId | null, ColumnId>[]
            {
                return getAvailableColumnReferences(true);
            },

            getPossibleColumnReferences(tableId: TableId, columnId: ColumnId): Expression.ColumnLookup.ClickedReference[]
            {
                return getAvailableColumnReferences(false).filter(c => tableId.equals(c.getFirst()) && columnId.equals(c.getSecond())).map(c => new class extends Expression.ColumnLookup.ClickedReference
                {
                    public getExpression(): Expression
                    {
                        return IdentExpression.column(c.getFirst(), c.getSecond());
                    }
                }(tableId, columnId));
            },

            getTable(tableName: TableId | null): Expression.ColumnLookup.FoundTable | null
            {
                return Utility.onNullable(tableManager.getSingleTableOrNull(tableName === null ? getId() : tableName), t => new FoundTableActual(t));
            },

            getAvailableTableReferences(): TableId[]
            {
                return tableManager.getAllTablesAvailableTo(getId(), false).map(t => t.getId());
            },
        };
    }

    public override visit<T>(visitor: TransformationVisitor<T>): T
    {
        return visitor.aggregate(this);
    }

    public static suggestedName(splitBy: readonly ColumnId[], summaries: readonly Pair<ColumnId, Expression>[]): TableId
    {
        const parts: ExpressionIdentifier[] = [];
        parts.push("Agg");
        if (summaries.length === 0)
            parts.push("none");
        else
            parts.push(IdentifierUtility.shorten(summaries[0]!.getFirst().getRaw()));

        if (splitBy.length !== 0)
            parts.push("by", IdentifierUtility.shorten(splitBy[0]!.getRaw()));

        return new TableId(IdentifierUtility.spaceSeparated(parts));
    }

    public override getSuggestedName(): TableId
    {
        return Aggregate.suggestedName(this.splitBy, this.summaries);
    }
}

// Java's splits.valuesAndOccurrences.get(i), which throws IndexOutOfBoundsException for a bad index:
function javaListGetSplit(splits: JoinedSplit, index: number): Pair<readonly Value[], Occurrences>
{
    return javaListGet(splits.valuesAndOccurrences, index);
}

export namespace Aggregate
{
    export class Info extends SingleSourceTransformationInfo
    {
        public constructor()
        {
            super(Aggregate.NAME, "transform.aggregate", "preview-aggregate.png", "aggregate.explanation.short", ["min", "max"]);
        }

        public override makeWithSource(mgr: TableManager, destination: CellPosition, srcTable: Table): Transformation
        {
            return new Aggregate(mgr, new Table.InitialLoadDetails(null, null, destination, null), srcTable.getId(), [], []);
        }

        public override loadSingle(mgr: TableManager, initialLoadDetails: Table.InitialLoadDetails, srcTableId: TableId, detail: string, expressionVersion: ExpressionVersion): Transformation
        {
            const loaded = Utility.parseAsOne(detail, s => new TransformationLexer(s), t => new TransformationParser(t), p => p.summary());

            const summaryTypes: Pair<ColumnId, Expression>[] = [];
            for (const sumType of loaded.summaryCol())
            {
                const columnId = new ColumnId(sumType._column!.getText() as ExpressionIdentifier);
                summaryTypes.push(new Pair(columnId, ExpressionUtil.parse(null, sumType.expression().EXPRESSION().getText(), expressionVersion, mgr.getTypeManager(), FunctionList.getFunctionLookup(mgr.getUnitManager()))));
            }
            const splits = loaded.splitBy().map(s => new ColumnId(s._column!.getText() as ExpressionIdentifier));
            return new Aggregate(mgr, initialLoadDetails, srcTableId, summaryTypes, splits);
        }
    }
}
