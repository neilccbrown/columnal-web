// Port of xyz.columnal.transformations.Calculate (transformations module).
import type { ExpressionIdentifier, TableDataRowIndex } from "../../anns/Annotations.js";
import type { CellPosition } from "../../data/data/CellPosition.js";
import { Column } from "../../data/data/Column.js";
import { ColumnUtility } from "../../data/data/ColumnUtility.js";
import { ErrorColumn } from "../../data/data/ErrorColumn.js";
import { RecordSet } from "../../data/data/RecordSet.js";
import { RenameOnEdit } from "../../data/data/RenameOnEdit.js";
import type { SingleSourceTransformation } from "../../data/data/SingleSourceTransformation.js";
import { Table } from "../../data/data/Table.js";
import type { TableManager } from "../../data/data/TableManager.js";
import { TableOperations } from "../../data/data/TableOperations.js";
import type { Transformation } from "../../data/data/Transformation.js";
import { BracketedStatus } from "../../expressions/transformations/expression/BracketedStatus.js";
import { ErrorAndTypeRecorderStorer } from "../../expressions/transformations/expression/ErrorAndTypeRecorderStorer.js";
import { EvaluateState } from "../../expressions/transformations/expression/EvaluateState.js";
import { Expression } from "../../expressions/transformations/expression/Expressions.js";
import { ExpressionUtil } from "../../expressions/transformations/expression/ExpressionUtil.js";
import { TypeState } from "../../expressions/transformations/expression/TypeState.js";
import { FunctionList } from "../../functions/transformations/function/FunctionList.js";
import { ColumnId } from "../../identifiers/id/ColumnId.js";
import type { TableAndColumnRenames } from "../../identifiers/id/TableAndColumnRenames.js";
import { TableId } from "../../identifiers/id/TableId.js";
import { HashMap } from "../../java/HashMap.js";
import { immutableMapBuilderPut } from "../../java/JavaCollections.js";
import type { JavaFile } from "../../java/JavaFile.js";
import { javaCompare } from "../../java/JavaObject.js";
import { TransformationLexer } from "../../parsers/generated/TransformationLexer.js";
import { TransformationParser } from "../../parsers/generated/TransformationParser.js";
import type { ExpressionVersion } from "../../parsers/grammar/Versions.js";
import type { DataType } from "../../types/data/datatype/DataType.js";
import type { DataTypeValue } from "../../types/data/datatype/DataTypeValue.js";
import { OutputBuilder } from "../../types/loadsave/OutputBuilder.js";
import type { Pair } from "../../utility-adt/utility/adt/Pair.js";
import { UserException } from "../../utility-error/error/UserException.js";
import { ErrorHandler } from "../../utility/log/ErrorHandler.js";
import { StyledString } from "../../utility-error/styled/StyledString.js";
import type { SimulationConsumer } from "../../utility-functional/utility/function/simulation/SimulationConsumer.js";
import type { SimulationFunction } from "../../utility-functional/utility/function/simulation/SimulationFunction.js";
import { IdentifierUtility } from "../../utility/utility/IdentifierUtility.js";
import { TranslationUtility } from "../../utility/utility/TranslationUtility.js";
import { Utility } from "../../utility/utility/Utility.js";
import { MultipleTableLookup } from "./MultipleTableLookup.js";
import { SingleSourceTransformationInfo } from "./SingleSourceTransformationInfo.js";
import type { TransformationVisitor } from "./TransformationVisitor.js";
import { VisitableTransformation } from "./VisitableTransformation.js";

/**
 * A transformation on a single table which calculates a new set of columns
 * (adding to/replacing the existing columns depending on name)
 * by evaluating an expression for each.
 */
export class Calculate extends VisitableTransformation implements SingleSourceTransformation
{
    // If any columns overlap the source table's columns, they are shown in that position.
    // If they are new, they are shown at the end, in the order provided by this list
    // (Note that Guava's ImmutableMap respects insertion order for iteration, which
    // we rely on here).
    private readonly newColumns: HashMap<ColumnId, Expression>;
    private readonly srcTableId: TableId;
    private readonly src: Table | null;
    private readonly recordSet: RecordSet | null;
    private error: StyledString = StyledString.s("");

    public constructor(mgr: TableManager, initialLoadDetails: Table.InitialLoadDetails, srcTableId: TableId, toCalculate: HashMap<ColumnId, Expression>)
    {
        super(mgr, initialLoadDetails);
        this.srcTableId = srcTableId;
        this.src = mgr.getSingleTableOrNull(srcTableId);
        this.error = StyledString.s("Unknown error with table \"" + this.getId().toString() + "\"");
        this.newColumns = toCalculate;
        if (this.src === null)
        {
            this.recordSet = null;
            this.error = StyledString.s("Could not find source table: \"" + srcTableId.toString() + "\"");
            return;
        }


        let theResult: RecordSet | null = null;
        try
        {
            const srcRecordSet = this.src.getData();
            const columnLookup = (ed: ColumnId): Expression.ColumnLookup => new MultipleTableLookup(this.getId(), mgr, srcTableId, this.makeEditor(ed));
            const columns: SimulationFunction<RecordSet, Column>[] = [];
            // PORT-NOTE: a Java HashMap, whose order decides the order of the new columns.
            const stillToAdd = HashMap.javaOrder<ColumnId, Expression>({}, this.newColumns);
            for (const c of srcRecordSet.getColumns())
            {
                // If the old column is not overwritten by one of the same name, include it:
                const overwrite = stillToAdd.get(c.getName()) ?? null;
                stillToAdd.delete(c.getName());

                if (overwrite === null)
                {
                    // eslint-disable-next-line @typescript-eslint/no-this-alias -- the inner class's outer instance
                    const self = this;
                    columns.push(rs => new class extends Column
                    {
                        public getType(): DataTypeValue
                        {
                            return self.addManualEditSet(this.getName(), c.getType());
                        }

                        public getAlteredState(): Column.AlteredState
                        {
                            return Column.AlteredState.UNALTERED;
                        }
                    }(rs, c.getName()));
                }
                else
                {
                    columns.push(this.makeCalcColumn(mgr, columnLookup(c.getName()), c.getName(), overwrite));
                }
            }

            for (const [key, value] of stillToAdd.entries())
            {
                columns.push(this.makeCalcColumn(mgr, columnLookup(key), key, value));
            }

            theResult = new class extends RecordSet
            {
                public indexValid(index: number): boolean
                {
                    return srcRecordSet.indexValid(index);
                }

                public override getLength(): TableDataRowIndex
                {
                    return srcRecordSet.getLength();
                }
            }(columns);
        }
        catch (e)
        {
            if (!(e instanceof UserException))
                throw e;
            this.error = e.getStyledMessage();
        }

        this.recordSet = theResult;
    }

    public makeEditor(columnId: ColumnId): MultipleTableLookup.CalculationEditor
    {
        return {
            getCurrentlyEditingColumn: (): ColumnId =>
            {
                return columnId;
            },

            moveExpressionToNewCalculation: (): SimulationConsumer<Pair<ColumnId | null, Expression>> =>
            {
                const targetPos = this.getManager().getNextInsertPosition(this.getId());
                return details => {
                    const mgr = this.getManager();
                    const calcColumns = new HashMap<ColumnId, Expression>();
                    for (const [key, value] of this.newColumns.entries())
                    {
                        if (!columnId.equals(key))
                            calcColumns.set(key, value);
                    }
                    const remainingColumns = calcColumns;
                    mgr.edit(Utility.later(this), id => new Calculate(mgr, this.getDetailsForCopy(id), this.srcTableId, remainingColumns), RenameOnEdit.ifOldAuto(Calculate.suggestedName(remainingColumns)));
                    const movedCol = new HashMap<ColumnId, Expression>([[details.getFirst() === null ? columnId : details.getFirst()!, details.getSecond()]]);
                    mgr.record(new Calculate(mgr, new Table.InitialLoadDetails(Calculate.suggestedName(movedCol), null, targetPos, null), this.getId(), movedCol));
                };
            },
        };
    }

    private makeCalcColumn(mgr: TableManager, columnLookup: Expression.ColumnLookup, columnId: ColumnId, expression: Expression): SimulationFunction<RecordSet, Column>
    {
        try
        {
            const errorAndTypeRecorder = new ErrorAndTypeRecorderStorer();
            const type = expression.checkExpression(columnLookup, Calculate.makeTypeState(mgr), errorAndTypeRecorder);

            const concrete: DataType | null = type === null ? null : errorAndTypeRecorder.recordLeftError(mgr.getTypeManager(), FunctionList.getFunctionLookup(mgr.getUnitManager()), expression, type.toConcreteType(mgr.getTypeManager()));
            if (type === null || concrete === null)
            {
                const checkErrors = StyledString.joining(errorAndTypeRecorder.getAllErrors(), ", ");
                throw new UserException(StyledString.concat(StyledString.s("Error in " + columnId.getRaw() + " expression: "), checkErrors.toPlain().length === 0 ? StyledString.s("Invalid expression") : checkErrors)); // A bit redundant to throw and catch again below, but control flow will pan out right
            }
            const typeFinal: DataType = concrete;
            return rs => ColumnUtility.makeCalculatedColumn(typeFinal, rs, columnId, index => expression.calculateValue(new EvaluateState(mgr.getTypeManager(), index)).value, t => this.addManualEditSet(columnId, t));
        }
        catch (e)
        {
            if (!(e instanceof UserException))
                throw e;
            return rs => new ErrorColumn(rs, mgr.getTypeManager(), columnId, e.getStyledMessage());
        }
    }

    public static makeTypeState(mgr: TableManager): TypeState
    {
        return TypeState.withRowNumber(mgr.getTypeManager(), FunctionList.getFunctionLookup(mgr.getUnitManager()));
    }

    public override getPrimarySources(): readonly TableId[]
    {
        return [this.srcTableId];
    }

    public override getSourcesFromExpressions(): readonly TableId[]
    {
        return ExpressionUtil.tablesFromExpressions([...this.newColumns.values()]);
    }

    protected override getTransformationName(): string
    {
        return "calculate";
    }

    protected override saveDetail(_destination: JavaFile | null, renames: TableAndColumnRenames): readonly string[]
    {
        renames.useColumnsFromTo(this.srcTableId, this.getId());
        return [...this.newColumns.entries()].map(([key, value]) => {
            const b = new OutputBuilder();
            const renamed = renames.columnId(this.getId(), key, this.srcTableId);
            b.kw("CALCULATE").id(renamed.getSecond());
            b.kw("@EXPRESSION");
            b.raw(value.save(Expression.SaveDestination.TO_FILE, BracketedStatus.DONT_NEED_BRACKETS, renames.withDefaultTableId(this.srcTableId)));
            return b.toString();
        });
    }

    public override getData(): RecordSet
    {
        if (this.recordSet === null)
            throw new UserException(this.error === null ? StyledString.s("Unknown error") : this.error);
        return this.recordSet;
    }

    public override getOperations(): TableOperations
    {
        // Renames and deletes are valid, if they refer to
        // columns derived from us.
        // TODO allow renames backwards through dependencies
        return new TableOperations(this.getManager().getRenameTableOperation(this), deleteId => this.newColumns.has(deleteId) ? (c => this.deleteColumn(c)) : null, null, null, null);
    }

    public getSrcTableId(): TableId
    {
        return this.srcTableId;
    }

    public withNewSource(newSrcTableId: TableId): Transformation
    {
        return new Calculate(this.getManager(), this.getDetailsForCopy(this.getId()), newSrcTableId, this.newColumns);
    }

    private deleteColumn(columnId: ColumnId): void
    {
        if (this.newColumns.has(columnId))
        {
            ErrorHandler.getErrorHandler().alertOnError_(TranslationUtility.getString("error.deleting.column"), () => {
                const filtered = new HashMap<ColumnId, Expression>();
                this.newColumns.forEach((e, c) => {
                    if (!c.equals(columnId))
                        filtered.set(c, e);
                });
                const filteredCols = filtered;
                this.getManager().edit(this, id => {
                    return new Calculate(this.getManager(), this.getDetailsForCopy(id), this.srcTableId, filteredCols);
                }, RenameOnEdit.ifOldAuto(Calculate.suggestedName(filteredCols)));
            });
        }
    }

    public override transformationEquals(o: Transformation): boolean
    {
        const calculate = o as Calculate;

        if (!this.newColumns.equals(calculate.newColumns)) return false;
        return this.srcTableId.equals(calculate.srcTableId);
    }

    public override transformationHashCode(): number
    {
        let result = this.newColumns.hashCode();
        result = (Math.imul(31, result) + this.srcTableId.hashCode()) | 0;
        return result;
    }

    public getCalculatedColumns(): HashMap<ColumnId, Expression>
    {
        return this.newColumns;
    }

    public override visit<T>(visitor: TransformationVisitor<T>): T
    {
        return visitor.calculate(this);
    }

    public override getSuggestedName(): TableId
    {
        return Calculate.suggestedName(this.newColumns);
    }

    public static suggestedName(calcColumns: HashMap<ColumnId, Expression>): TableId
    {
        const parts: ExpressionIdentifier[] = [];
        parts.push("Calc");
        parts.push(IdentifierUtility.shorten([...calcColumns.keys()].sort((a, b) => javaCompare(a, b)).map(k => k.getRaw())[0] ?? "none"));
        return new TableId(IdentifierUtility.spaceSeparated(parts));
    }
}

export namespace Calculate
{
    export class Info extends SingleSourceTransformationInfo
    {
        public constructor()
        {
            super("calculate", "transform.calculate", "preview-calculate.png", "calculate.explanation.short", ["transform"]);
        }

        public override loadSingle(mgr: TableManager, initialLoadDetails: Table.InitialLoadDetails, srcTableId: TableId, detail: string, expressionVersion: ExpressionVersion): Transformation
        {
            const columns = new HashMap<ColumnId, Expression>();

            const transform = Utility.parseAsOne(detail, s => new TransformationLexer(s), t => new TransformationParser(t), p => p.transform());
            for (const transformItemContext of transform.transformItem())
            {
                const columnId = new ColumnId(transformItemContext._column!.getText() as ExpressionIdentifier);
                immutableMapBuilderPut(columns, columnId, ExpressionUtil.parse(null, transformItemContext.expression().EXPRESSION().getText(), expressionVersion, mgr.getTypeManager(), FunctionList.getFunctionLookup(mgr.getUnitManager())));
            }

            return new Calculate(mgr, initialLoadDetails, srcTableId, columns);
        }

        protected override makeWithSource(mgr: TableManager, destination: CellPosition, srcTable: Table): Transformation
        {
            return new Calculate(mgr, new Table.InitialLoadDetails(null, null, destination, null), srcTable.getId(), new HashMap());
        }
    }
}
