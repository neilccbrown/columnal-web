// Port of xyz.columnal.transformations.Sort (transformations module).
import type { ExpressionIdentifier, TableDataRowIndex } from "../../anns/Annotations.js";
import type { CellPosition } from "../../data/data/CellPosition.js";
import { Column } from "../../data/data/Column.js";
import { NumericColumnStorage } from "../../data/data/NumericColumnStorage.js";
import { RecordSet } from "../../data/data/RecordSet.js";
import type { SingleSourceTransformation } from "../../data/data/SingleSourceTransformation.js";
import { Table } from "../../data/data/Table.js";
import type { TableManager } from "../../data/data/TableManager.js";
import type { Transformation } from "../../data/data/Transformation.js";
import { ColumnId } from "../../identifiers/id/ColumnId.js";
import type { TableAndColumnRenames } from "../../identifiers/id/TableAndColumnRenames.js";
import { TableId } from "../../identifiers/id/TableId.js";
import { Decimal } from "../../java/JavaBigDecimal.js";
import type { JavaFile } from "../../java/JavaFile.js";
import { javaEquals, javaHashCode, javaStringCompare } from "../../java/JavaObject.js";
import { TransformationLexer } from "../../parsers/generated/TransformationLexer.js";
import { TransformationParser } from "../../parsers/generated/TransformationParser.js";
import type { ExpressionVersion } from "../../parsers/grammar/Versions.js";
import type { DataTypeValue } from "../../types/data/datatype/DataTypeValue.js";
import { NumberInfo } from "../../types/data/datatype/NumberInfo.js";
import { OutputBuilder } from "../../types/loadsave/OutputBuilder.js";
import { Either } from "../../utility-adt/utility/adt/Either.js";
import { Pair } from "../../utility-adt/utility/adt/Pair.js";
import { InternalException } from "../../utility-error/error/InternalException.js";
import { InvalidImmediateValueException } from "../../utility-error/error/InvalidImmediateValueException.js";
import { UserException } from "../../utility-error/error/UserException.js";
import type { StyledShowable } from "../../utility-error/styled/StyledShowable.js";
import { StyledString } from "../../utility-error/styled/StyledString.js";
import type { SimulationFunction } from "../../utility-functional/utility/function/simulation/SimulationFunction.js";
import { Log } from "../../utility/log/Log.js";
import { IdentifierUtility } from "../../utility/utility/IdentifierUtility.js";
import { Utility } from "../../utility/utility/Utility.js";
import type { Value } from "../../utility/utility/Value.js";
import { SingleSourceTransformationInfo } from "./SingleSourceTransformationInfo.js";
import type { TransformationVisitor } from "./TransformationVisitor.js";
import { VisitableTransformation } from "./VisitableTransformation.js";

/**
 * A transformation which preserves all data from the original table
 * but sorts it.
 *
 * Error behaviour:
 *   - Errors in every place if the sort-by columns can't be found.
 */
export class Sort extends VisitableTransformation implements SingleSourceTransformation
{
    public static readonly NAME = "sort";

    private sortByError: string;
    private readonly srcTableId: TableId;
    private readonly src: Table | null;
    private readonly result: RecordSet | null;
    // Not actually a column by itself, but holds a list of integers so reasonable to re-use:
    private readonly sortMap: NumericColumnStorage | null;

    // This works like a linked list, but flattened into an integer array.
    // The first item is the head, then others point onwards.  (Irritatingly, stillToOrder[n]
    // corresponds to originalIndex=n-1, due to having the head.
    // To begin with, each item points to the next:
    // 0 : 1 [HEAD: originalIndex = 0]
    // 1 : 2 [next item after originalIndex=0 is originalIndex=1]
    // 2 : 3 [next item after originalIndex=1 is originalIndex=2]
    // 3 : 4, etc
    // Then, when we use an item from the list, e.g. item 2 from original list, we update pointers:
    // 0 : 1
    // 1 : 2
    // 2 : 4 [next item after originalIndex=1 is originalIndex=3]
    // 3 : 4 [now stillToOrder], etc
    // Then if we use item 1, we update again:
    // 0 : 1
    // 1 : 4 [next item after originalIndex=0 is originalIndex=3]
    // 2 : 4
    // 3 : 4 [now stillToOrder], etc
    private stillToOrder: Int32Array | null = null;

    private readonly originalSortBy: readonly Pair<ColumnId, Sort.Direction>[];
    private readonly sortBy: readonly Pair<Column, Sort.Direction>[] | null;

    public constructor(mgr: TableManager, initialLoadDetails: Table.InitialLoadDetails, srcTableId: TableId, sortBy: readonly Pair<ColumnId, Sort.Direction>[])
    {
        super(mgr, initialLoadDetails);
        this.srcTableId = srcTableId;
        this.src = mgr.getSingleTableOrNull(srcTableId);
        this.originalSortBy = sortBy;
        this.sortByError = "Unknown error with table \"" + this.getId().toString() + "\"";
        if (this.src === null)
        {
            this.result = null;
            this.sortBy = null;
            this.sortMap = null;
            this.sortByError = "Could not find source table: \"" + srcTableId.toString() + "\"";
            return;
        }
        let theResult: RecordSet | null = null;
        let theSortBy: Pair<Column, Sort.Direction>[] | null = null;

        try
        {
            let srcData: RecordSet;
            let srcDataLength: number;
            try
            {
                srcData = this.src.getData();
                srcDataLength = srcData.getLength();
            }
            catch (e)
            {
                if (!(e instanceof UserException))
                    throw e;
                throw new UserException("Error in source table: " + this.src.getId().toString() + " error: " + e.getLocalizedMessage());
            }

            let sortByColumns: Pair<Column, Sort.Direction>[] | null = [];
            for (const c of this.originalSortBy)
            {

                const column = srcData.getColumnOrNull(c.getFirst());
                if (column === null)
                {
                    sortByColumns = null;
                    this.sortByError = "Could not find source column to sort by: \"" + c.toString() + "\"";
                    break;
                }
                sortByColumns.push(new Pair(column, c.getSecond()));
            }
            theSortBy = sortByColumns;

            const columns: SimulationFunction<RecordSet, Column>[] = [];

            this.stillToOrder = new Int32Array(srcDataLength + 1);
            for (let i = 0; i < this.stillToOrder.length - 1; i++)
                this.stillToOrder[i] = i + 1;
            this.stillToOrder[this.stillToOrder.length - 1] = -1;
            // eslint-disable-next-line @typescript-eslint/no-this-alias -- the inner class's outer instance
            const self = this;
            for (const c of srcData.getColumns())
            {
                columns.push(rs => new class extends Column
                {
                    public getType(): DataTypeValue
                    {
                        return self.addManualEditSet(this.getName(), c.getType().copyReorder(i =>
                        {
                            self.fillSortMapTo(i);
                            return self.sortMap!.getInt(i);
                        }));
                    }

                    public getAlteredState(): Column.AlteredState
                    {
                        return Column.AlteredState.FILTERED_OR_REORDERED;
                    }
                }(rs, c.getName()));
            }

            const srcDataFinal = srcData;
            theResult = new class extends RecordSet
            {
                public indexValid(index: number): boolean
                {
                    return srcDataFinal.indexValid(index);
                }

                public override getLength(): TableDataRowIndex
                {
                    return srcDataFinal.getLength();
                }
            }(columns);
        }
        catch (e)
        {
            if (!(e instanceof UserException))
                throw e;
            const msg = e.getLocalizedMessage();
            if (msg !== null)
                this.sortByError = msg;
        }
        this.result = theResult;
        this.sortMap = new NumericColumnStorage(NumberInfo.DEFAULT, false);
        this.sortBy = theSortBy !== null ? [...theSortBy] : null;
    }

    private fillSortMapTo(target: number): void
    {
        if (this.sortMap === null)
            throw new InternalException("Trying to fill null sort map; error in initialisation carried forward.");
        const destStart = this.sortMap.filled();
        const justDirections = this.originalSortBy.map(p => p.getSecond());
        for (let dest = destStart; dest <= target; dest++)
        {
            let lowestIndex = 0;
            let lowest: Either<string, Value>[] | null = null;
            let pointerToLowestIndex = -1;
            let prevSrc = 0;
            if (this.stillToOrder === null)
                throw new InternalException("Trying to re-sort an already sorted list");
            // stillToOrder shouldn't possibly become null during this loop, but need to satisfy checker:
            for (let src = this.stillToOrder[prevSrc]!; src !== -1; src = this.stillToOrder === null ? -1 : this.stillToOrder[src]!)
            {
                // src is in stillToOrder terms, which is one more than original indexes
                const cur = this.getItem(src - 1);
                if (lowest === null || Sort.compareFixedSet(cur, lowest, justDirections) < 0)
                {
                    lowest = cur;
                    lowestIndex = src;
                    pointerToLowestIndex = prevSrc;
                }
                prevSrc = src;
            }
            if (lowest !== null && this.stillToOrder !== null)
            {
                // Make the pointer behind lowest point to entry after lowest:
                this.stillToOrder[pointerToLowestIndex] = this.stillToOrder[lowestIndex]!;
                // Still to order is empty, so null it to garbage collect the memory:
                if (this.stillToOrder[0] === -1)
                    this.stillToOrder = null;
                // lowestIndex is in stillToOrder terms, which is one more than original indexes
                this.sortMap.add(new Decimal(lowestIndex - 1));
            }
            else
            {
                throw new InternalException("Not enough items available to fill source list");
            }
        }
    }

    // All arrays must be same length.
    // Returns -1 if a is before b, given the directions.
    // e.g. compareFixedSet({0}, {1}, DESCENDING) will return positive number, because 0 is after 1 when descending
    private static compareFixedSet(a: readonly Either<string, Value>[], b: readonly Either<string, Value>[], justDirections: readonly Sort.Direction[]): number
    {
        for (let i = 0; i < a.length; i++)
        {
            const ax = a[i]!;
            const bx = b[i]!;
            // Errors are always first, whether descending or ascending:
            if (ax.isLeft())
            {
                if (bx.isLeft())
                    return javaStringCompare(ax.getLeft("Impossible ax"), bx.getLeft("Impossible bx"));
                else
                    return -1;
            }
            else if (bx.isLeft())
            {
                return 1;
            }
            let cmp = Utility.compareValues(ax.getRight("Impossible ax"), bx.getRight("Impossible bx"));
            if (justDirections[i] === Sort.Direction.DESCENDING)
                cmp = -cmp;
            if (cmp !== 0)
                return cmp;
        }
        return 0;
    }

    private getItem(srcIndex: number): Either<string, Value>[]
    {
        if (this.sortBy === null)
            throw new UserException(this.sortByError);
        const r: Either<string, Value>[] = [];
        for (let i = 0; i < this.sortBy.length; i++)
        {
            const c = this.sortBy[i]!;
            let val: Either<string, Value>;
            try
            {
                val = Either.right(c.getFirst().getType().getCollapsed(srcIndex));
            }
            catch (e)
            {
                if (e instanceof InvalidImmediateValueException)
                    val = Either.left(e.getInvalid());
                else if (e instanceof InternalException || e instanceof UserException)
                {
                    if (e instanceof InternalException)
                        Log.log(e);
                    val = Either.left(e.getLocalizedMessage());
                }
                else
                    throw e;
            }
            r.push(val);
        }
        return r;
    }

    public override getData(): RecordSet
    {
        if (this.result === null)
            throw new UserException(this.sortByError);
        return this.result;
    }

    protected override getTransformationName(): string
    {
        return Sort.NAME;
    }

    public getSrcTableId(): TableId
    {
        return this.srcTableId;
    }

    public withNewSource(newSrcTableId: TableId): Transformation
    {
        return new Sort(this.getManager(), this.getDetailsForCopy(this.getId()), newSrcTableId, this.originalSortBy);
    }

    public override getPrimarySources(): readonly TableId[]
    {
        return [this.srcTableId];
    }

    protected override getSourcesFromExpressions(): readonly TableId[]
    {
        return [];
    }

    protected override saveDetail(_destination: JavaFile | null, renames: TableAndColumnRenames): readonly string[]
    {
        renames.useColumnsFromTo(this.srcTableId, this.getId());
        const b = new OutputBuilder();
        for (const c of this.originalSortBy)
            b.kw(c.getSecond().toString()).id(renames.columnId(this.getId(), c.getFirst(), this.srcTableId).getSecond()).nl();
        return b.toLines();
    }

    public getSortBy(): readonly Pair<ColumnId, Sort.Direction>[]
    {
        return this.originalSortBy;
    }

    public override transformationEquals(o: Transformation): boolean
    {
        const sort = o as Sort;

        if (!this.srcTableId.equals(sort.srcTableId)) return false;
        return javaEquals(this.originalSortBy, sort.originalSortBy);

    }

    public override transformationHashCode(): number
    {
        let result = this.srcTableId.hashCode();
        result = (Math.imul(31, result) + javaHashCode(this.originalSortBy)) | 0;
        return result;
    }

    public override visit<T>(visitor: TransformationVisitor<T>): T
    {
        return visitor.sort(this);
    }

    public override getSuggestedName(): TableId
    {
        return Sort.suggestedName(this.originalSortBy);
    }

    public static suggestedName<T>(sortBy: readonly Pair<ColumnId, T>[]): TableId
    {
        return new TableId(IdentifierUtility.spaceSeparated("Sort by", sortBy.map(p => IdentifierUtility.shorten(p.getFirst().getRaw()))[0] ?? "none"));
    }
}

export namespace Sort
{
    // Java: an enum which implements StyledShowable
    export class Direction implements StyledShowable
    {
        private constructor(private readonly javaName: string, public readonly ordinal: number)
        {
        }

        public static readonly ASCENDING = new Direction("ASCENDING", 0);
        public static readonly DESCENDING = new Direction("DESCENDING", 1);

        public static values(): Direction[]
        {
            return [Direction.ASCENDING, Direction.DESCENDING];
        }

        // This is for preview in description, so we just give an arrow:
        public toStyledString(): StyledString
        {
            return StyledString.s(this === Direction.ASCENDING ? "↑" : "↓");
        }

        public name(): string
        {
            return this.javaName;
        }

        public toString(): string
        {
            return this.javaName;
        }

        public hashCode(): number
        {
            return this.ordinal;
        }

        public compareTo(other: Direction): number
        {
            return this.ordinal - other.ordinal;
        }
    }

    export class Info extends SingleSourceTransformationInfo
    {
        public constructor()
        {
            super(Sort.NAME, "transform.sort", "preview-sort.png", "sort.explanation.short", []);
        }

        public override loadSingle(mgr: TableManager, initialLoadDetails: Table.InitialLoadDetails, srcTableId: TableId, detail: string, _expressionVersion: ExpressionVersion): Transformation
        {
            const loaded = Utility.parseAsOne(detail, s => new TransformationLexer(s), t => new TransformationParser(t), p => p.sort());

            return new Sort(mgr, initialLoadDetails, srcTableId, Utility.mapListI(loaded.orderBy(), o => new Pair(new ColumnId(o._column!.getText() as ExpressionIdentifier), o.orderKW().getText() === "DESCENDING" ? Sort.Direction.DESCENDING : Sort.Direction.ASCENDING)));
        }

        public override makeWithSource(mgr: TableManager, destination: CellPosition, srcTable: Table): Transformation
        {
            return new Sort(mgr, new Table.InitialLoadDetails(null, null, destination, new Pair<Table.Display, readonly ColumnId[]>(Table.Display.ALL, [])), srcTable.getId(), []);
        }
    }
}
