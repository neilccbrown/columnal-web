// Port of xyz.columnal.transformations.Filter (transformations module).
import type { ExpressionIdentifier, TableDataRowIndex } from "../../anns/Annotations.js";
import type { CellPosition } from "../../data/data/CellPosition.js";
import { Column } from "../../data/data/Column.js";
import { NumericColumnStorage } from "../../data/data/NumericColumnStorage.js";
import { RecordSet } from "../../data/data/RecordSet.js";
import type { SingleSourceTransformation } from "../../data/data/SingleSourceTransformation.js";
import { Table } from "../../data/data/Table.js";
import type { TableManager } from "../../data/data/TableManager.js";
import type { Transformation } from "../../data/data/Transformation.js";
import { BracketedStatus } from "../../expressions/transformations/expression/BracketedStatus.js";
import { ErrorAndTypeRecorderStorer } from "../../expressions/transformations/expression/ErrorAndTypeRecorderStorer.js";
import { EvaluateState } from "../../expressions/transformations/expression/EvaluateState.js";
import { BooleanLiteral, Expression, IdentExpression } from "../../expressions/transformations/expression/Expressions.js";
import { ExpressionUtil } from "../../expressions/transformations/expression/ExpressionUtil.js";
import { TypeState } from "../../expressions/transformations/expression/TypeState.js";
import { ExpressionVisitorStream } from "../../expressions/transformations/expression/visitor/ExpressionVisitorStream.js";
import { FunctionList } from "../../functions/transformations/function/FunctionList.js";
import type { ColumnId } from "../../identifiers/id/ColumnId.js";
import type { TableAndColumnRenames } from "../../identifiers/id/TableAndColumnRenames.js";
import { TableId } from "../../identifiers/id/TableId.js";
import { Decimal } from "../../java/JavaBigDecimal.js";
import type { JavaFile } from "../../java/JavaFile.js";
import type { ExpressionVersion } from "../../parsers/grammar/Versions.js";
import { DataType } from "../../types/data/datatype/DataType.js";
import type { DataTypeValue } from "../../types/data/datatype/DataTypeValue.js";
import type { TypeManager } from "../../types/data/datatype/TypeManager.js";
import { Pair } from "../../utility-adt/utility/adt/Pair.js";
import { UserException } from "../../utility-error/error/UserException.js";
import { StyledString } from "../../utility-error/styled/StyledString.js";
import type { SimulationFunction } from "../../utility-functional/utility/function/simulation/SimulationFunction.js";
import { IdentifierUtility } from "../../utility/utility/IdentifierUtility.js";
import { Utility } from "../../utility/utility/Utility.js";
import { ExpressionErrorException } from "../error/expressions/ExpressionErrorException.js";
import { MultipleTableLookup } from "./MultipleTableLookup.js";
import { SingleSourceTransformationInfo } from "./SingleSourceTransformationInfo.js";
import type { TransformationVisitor } from "./TransformationVisitor.js";
import { VisitableTransformation } from "./VisitableTransformation.js";

const PREFIX = "KEEPIF";

/**
 * Created by neil on 23/11/2016.
 */
export class Filter extends VisitableTransformation implements SingleSourceTransformation
{
    public static readonly NAME = "filter";
    private readonly srcTableId: TableId;
    private readonly src: Table | null;
    // Not actually a column by itself, but holds a list of integers so reasonable to re-use:
    // Each item is a source index in the original list
    private readonly indexMap: NumericColumnStorage;
    // Maps original row indexes to errors:
    private readonly errorsDuringFilter = new Map<number, string>();
    private readonly recordSet: RecordSet | null;
    private error: string;
    private nextIndexToExamine = 0;
    private readonly filterExpression: Expression;
    private type: DataType | null = null;
    private typeChecked = false;

    public constructor(mgr: TableManager, initialLoadDetails: Table.InitialLoadDetails, srcTableId: TableId, filterExpression: Expression)
    {
        super(mgr, initialLoadDetails);
        this.srcTableId = srcTableId;
        this.src = mgr.getSingleTableOrNull(srcTableId);
        this.indexMap = new NumericColumnStorage(false);
        this.filterExpression = filterExpression;
        this.error = "Unknown error";

        let theRecordSet: RecordSet | null = null;
        try
        {
            if (this.src !== null)
            {
                const columns: SimulationFunction<RecordSet, Column>[] = [];
                const data = this.src.getData();
                const columnLookup = new MultipleTableLookup(this.getId(), mgr, this.src.getId(), null);
                // eslint-disable-next-line @typescript-eslint/no-this-alias -- the inner class's outer instance
                const self = this;
                for (const c of data.getColumns())
                {
                    columns.push(rs => new class extends Column
                    {
                        public getType(): DataTypeValue
                        {
                            return self.addManualEditSet(this.getName(), c.getType().copyReorder(i =>
                            {
                                self.fillIndexMapTo(i, columnLookup, data);
                                const error = self.errorsDuringFilter.get(i) ?? null;
                                if (error !== null)
                                    throw new UserException(error);
                                return self.indexMap.getInt(i);
                            }));
                        }

                        public getAlteredState(): Column.AlteredState
                        {
                            return Column.AlteredState.FILTERED_OR_REORDERED;
                        }
                    }(rs, c.getName()));
                }

                theRecordSet = new class extends RecordSet
                {
                    public indexValid(index: number): boolean
                    {
                        if (index < self.indexMap.filled())
                            return true;

                        Utility.later(self).fillIndexMapTo(index, columnLookup, data);
                        return index < self.indexMap.filled();
                    }
                }(columns);
            }
        }
        catch (e)
        {
            if (!(e instanceof UserException))
                throw e;
            const msg = e.getLocalizedMessage();
            if (msg !== null)
                this.error = msg;
        }
        this.recordSet = theRecordSet;
    }

    private fillIndexMapTo(index: number, data: Expression.ColumnLookup, recordSet: RecordSet): void
    {
        if (this.type === null)
        {
            if (!this.typeChecked)
            {
                const typeRecorder = new ErrorAndTypeRecorderStorer();
                // Must set it before, in case it throws:
                this.typeChecked = true;
                const checked = this.filterExpression.checkExpression(data, Filter.makeTypeState(this.getManager().getTypeManager()), typeRecorder);
                let typeFinal: DataType | null = null;
                if (checked !== null)
                    typeFinal = typeRecorder.recordLeftError(this.getManager().getTypeManager(), FunctionList.getFunctionLookup(this.getManager().getUnitManager()), this.filterExpression, checked.toConcreteType(this.getManager().getTypeManager()));

                if (typeFinal === null)
                {
                    // eslint-disable-next-line @typescript-eslint/no-this-alias -- the inner class's outer instance
                    const self = this;
                    throw new ExpressionErrorException(typeRecorder.getAllErrors()[0] ?? StyledString.s("Unknown type error"), new class extends ExpressionErrorException.EditableExpression
                    {
                        public replaceExpression(changed: Expression): Table
                        {
                            return new Filter(self.getManager(), self.getDetailsForCopy(self.getId()), self.srcTableId, changed);
                        }
                    }(this.filterExpression, this.srcTableId, data, () => Filter.makeTypeState(this.getManager().getTypeManager()), DataType.BOOLEAN));
                }

                this.type = typeFinal;
            }
            if (this.type === null)
                return;
        }
        this.ensureBoolean(this.type);

        while (this.indexMap.filled() <= index && recordSet.indexValid(this.nextIndexToExamine))
        {
            let keep: boolean;
            try
            {
                keep = Utility.cast(this.filterExpression.calculateValue(new EvaluateState(this.getManager().getTypeManager(), this.nextIndexToExamine)).value, Boolean);
            }
            catch (e)
            {
                if (!(e instanceof UserException))
                    throw e;
                // The row has an error, keep it but also record error:
                this.errorsDuringFilter.set(this.nextIndexToExamine, e.getLocalizedMessage());
                keep = true;
            }
            if (keep)
                this.indexMap.add(new Decimal(this.nextIndexToExamine));
            this.nextIndexToExamine += 1;
        }
    }

    // Given a row in this table, gets the index of the row in the source table that it came from.  Null if invalid or not yet available
    public getSourceRowFor(rowInThisTable: TableDataRowIndex): TableDataRowIndex | null
    {
        if (rowInThisTable >= 0 && rowInThisTable < this.indexMap.filled())
        {
            return this.indexMap.getInt(rowInThisTable);
        }
        return null;
    }

    public static makeTypeState(typeManager: TypeManager): TypeState
    {
        return TypeState.withRowNumber(typeManager, FunctionList.getFunctionLookup(typeManager.getUnitManager()));
    }

    public override getPrimarySources(): readonly TableId[]
    {
        return [this.srcTableId];
    }

    public override getSourcesFromExpressions(): readonly TableId[]
    {
        return ExpressionUtil.tablesFromExpression(this.filterExpression);
    }

    protected override getTransformationName(): string
    {
        return Filter.NAME;
    }

    protected override saveDetail(_destination: JavaFile | null, renames: TableAndColumnRenames): readonly string[]
    {
        renames.useColumnsFromTo(this.srcTableId, this.getId());

        return [PREFIX + " " + this.filterExpression.save(Expression.SaveDestination.TO_FILE, BracketedStatus.DONT_NEED_BRACKETS, renames.withDefaultTableId(this.srcTableId))];
    }

    public override getData(): RecordSet
    {
        if (this.recordSet === null)
            throw new UserException(this.error);
        return this.recordSet;
    }

    public getFilterExpression(): Expression
    {
        return this.filterExpression;
    }

    public getSrcTableId(): TableId
    {
        return this.srcTableId;
    }

    public withNewSource(newSrcTableId: TableId): Transformation
    {
        return new Filter(this.getManager(), this.getDetailsForCopy(this.getId()), newSrcTableId, this.filterExpression);
    }

    public override transformationEquals(o: Transformation): boolean
    {
        const filter = o as Filter;

        if (!this.srcTableId.equals(filter.srcTableId)) return false;
        return this.filterExpression.equals(filter.filterExpression);
    }

    public override transformationHashCode(): number
    {
        let result = this.srcTableId.hashCode();
        result = (Math.imul(31, result) + this.filterExpression.hashCode()) | 0;
        return result;
    }

    public override visit<T>(visitor: TransformationVisitor<T>): T
    {
        return visitor.filter(this);
    }

    public override getSuggestedName(): TableId
    {
        return Filter.suggestedName(this.filterExpression);
    }

    public static suggestedName(filterExpression: Expression): TableId
    {
        return new TableId(IdentifierUtility.spaceSeparated("Filt", Filter.guessFirstColumnReference(filterExpression) ?? "custom"));
    }

    public static guessFirstColumnReference(expression: Expression): ExpressionIdentifier | null
    {
        return expression.visit(new class extends ExpressionVisitorStream<ExpressionIdentifier>
        {
            public override ident(self: IdentExpression, namespace: ExpressionIdentifier | null, idents: readonly ExpressionIdentifier[], isVariable: boolean): ExpressionIdentifier[]
            {
                // Bit of a hacky guess, but we'll assume any non-variable single ident is a column:
                if (idents.length === 1 && !isVariable && (namespace === null || namespace === IdentExpression.NAMESPACE_COLUMN))
                    return [idents[0]!];
                return super.ident(self, namespace, idents, isVariable);
            }
        }())[0] ?? null;
    }
}

export namespace Filter
{
    export class Info extends SingleSourceTransformationInfo
    {
        public constructor()
        {
            super(Filter.NAME, "transform.filter", "preview-filter.png", "filter.explanation.short", ["remove", "delete"]);
        }

        public override loadSingle(mgr: TableManager, initialLoadDetails: Table.InitialLoadDetails, srcTableId: TableId, detail: string, expressionVersion: ExpressionVersion): Transformation
        {
            return new Filter(mgr, initialLoadDetails, srcTableId, ExpressionUtil.parse(PREFIX, detail, expressionVersion, mgr.getTypeManager(), FunctionList.getFunctionLookup(mgr.getUnitManager())));
        }

        public override makeWithSource(mgr: TableManager, destination: CellPosition, srcTable: Table): Transformation
        {
            return new Filter(mgr, new Table.InitialLoadDetails(null, null, destination, new Pair<Table.Display, readonly ColumnId[]>(Table.Display.ALL, [])), srcTable.getId(), new BooleanLiteral(true));
        }
    }
}
