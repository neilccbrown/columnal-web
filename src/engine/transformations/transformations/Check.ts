// Port of xyz.columnal.transformations.Check (transformations module).
import type { CellPosition } from "../../data/data/CellPosition.js";
import type { Column } from "../../data/data/Column.js";
import { ColumnUtility } from "../../data/data/ColumnUtility.js";
import { KnownLengthRecordSet } from "../../data/data/KnownLengthRecordSet.js";
import type { RecordSet } from "../../data/data/RecordSet.js";
import type { SingleSourceTransformation } from "../../data/data/SingleSourceTransformation.js";
import { Table } from "../../data/data/Table.js";
import type { TableManager } from "../../data/data/TableManager.js";
import type { Transformation } from "../../data/data/Transformation.js";
import { BracketedStatus } from "../../expressions/transformations/expression/BracketedStatus.js";
import { ErrorAndTypeRecorderStorer } from "../../expressions/transformations/expression/ErrorAndTypeRecorderStorer.js";
import { EvaluateState } from "../../expressions/transformations/expression/EvaluateState.js";
import { EvaluationException } from "../../expressions/transformations/expression/EvaluationException.js";
import { BooleanLiteral, Expression, IdentExpression } from "../../expressions/transformations/expression/Expressions.js";
import { ExpressionUtil } from "../../expressions/transformations/expression/ExpressionUtil.js";
import type { Explanation } from "../../expressions/transformations/expression/explanation/Explanation.js";
import { TypeState } from "../../expressions/transformations/expression/TypeState.js";
import { FunctionList } from "../../functions/transformations/function/FunctionList.js";
import { ColumnId } from "../../identifiers/id/ColumnId.js";
import type { TableAndColumnRenames } from "../../identifiers/id/TableAndColumnRenames.js";
import { TableId } from "../../identifiers/id/TableId.js";
import type { JavaFile } from "../../java/JavaFile.js";
import { TransformationLexer } from "../../parsers/generated/TransformationLexer.js";
import { TransformationParser } from "../../parsers/generated/TransformationParser.js";
import type { ExpressionVersion } from "../../parsers/grammar/Versions.js";
import { DataType } from "../../types/data/datatype/DataType.js";
import type { TypeManager } from "../../types/data/datatype/TypeManager.js";
import { Pair } from "../../utility-adt/utility/adt/Pair.js";
import { InternalException } from "../../utility-error/error/InternalException.js";
import { UserException } from "../../utility-error/error/UserException.js";
import { StyledString } from "../../utility-error/styled/StyledString.js";
import type { SimulationFunction } from "../../utility-functional/utility/function/simulation/SimulationFunction.js";
import { Log } from "../../utility/log/Log.js";
import { IdentifierUtility } from "../../utility/utility/IdentifierUtility.js";
import { TranslationUtility } from "../../utility/utility/TranslationUtility.js";
import { Utility } from "../../utility/utility/Utility.js";
import { ExpressionErrorException } from "../error/expressions/ExpressionErrorException.js";
import { Filter } from "./Filter.js";
import { FoundTableActual } from "./FoundTableActual.js";
import { SingleSourceTransformationInfo } from "./SingleSourceTransformationInfo.js";
import type { TransformationVisitor } from "./TransformationVisitor.js";
import { VisitableTransformation } from "./VisitableTransformation.js";

const PREFIX = "CHECK";

export class Check extends VisitableTransformation implements SingleSourceTransformation
{
    public static readonly NAME = "check";

    private readonly srcTableId: TableId;
    private readonly recordSet: RecordSet | null;
    private readonly error: string;
    private readonly checkType: Check.CheckType;
    private readonly checkExpression: Expression;
    private type: DataType | null = null;
    private explanation: Explanation | null = null;

    public constructor(mgr: TableManager, initialLoadDetails: Table.InitialLoadDetails, srcTableId: TableId, checkType: Check.CheckType, checkExpression: Expression)
    {
        super(mgr, initialLoadDetails);
        this.srcTableId = srcTableId;
        this.checkType = checkType;
        this.checkExpression = checkExpression;
        let theRecordSet: RecordSet | null = null;
        let theError = "Unknown error";
        try
        {
            const result = new ColumnId("result");
            theRecordSet = new KnownLengthRecordSet(
                    [(rs => ColumnUtility.makeCalculatedColumn(DataType.BOOLEAN, rs, result, _n => Utility.later(this).getResult(), t => this.addManualEditSet(result, t))) as SimulationFunction<RecordSet, Column>]
                    , 1
            );
        }
        catch (e)
        {
            if (!(e instanceof UserException))
                throw e;
            theError = e.getLocalizedMessage();
        }
        this.recordSet = theRecordSet;
        this.error = theError;
    }

    public getResult(): boolean
    {
        if (this.type === null)
        {
            const errors = new ErrorAndTypeRecorderStorer();
            const lookup = this.getColumnLookup();
            const checked = this.checkExpression.checkExpression(lookup, Check.makeTypeState(this.getManager().getTypeManager(), this.checkType), errors);
            let typeFinal: DataType | null = null;
            if (checked !== null)
                typeFinal = errors.recordLeftError(this.getManager().getTypeManager(), FunctionList.getFunctionLookup(this.getManager().getUnitManager()), this.checkExpression, checked.toConcreteType(this.getManager().getTypeManager()));

            if (typeFinal === null)
            {
                // eslint-disable-next-line @typescript-eslint/no-this-alias -- the inner class's outer instance
                const self = this;
                throw new ExpressionErrorException(errors.getAllErrors()[0] ?? StyledString.s("Unknown type error"), new class extends ExpressionErrorException.EditableExpression
                {
                    public replaceExpression(changed: Expression): Table
                    {
                        return new Check(self.getManager(), self.getDetailsForCopy(self.getId()), self.srcTableId, self.checkType, changed);
                    }
                }(this.checkExpression, null, lookup, () => Check.makeTypeState(this.getManager().getTypeManager(), this.checkType), DataType.BOOLEAN));
            }

            this.type = typeFinal;
        }

        this.ensureBoolean(this.type);

        try
        {
            if (this.checkType === Check.CheckType.STANDALONE)
            {
                const r = this.checkExpression.calculateValue(new EvaluateState(this.getManager().getTypeManager(), null, true));
                this.explanation = r.makeExplanation(null);
                return Utility.cast(r.value, Boolean);
            }
            else
            {
                const srcTable = this.getManager().getSingleTableOrNull(this.srcTableId);
                if (srcTable !== null)
                {
                    const length = srcTable.getData().getLength();
                    for (let row = 0; row < length; row++)
                    {
                        const r = this.checkExpression.calculateValue(new EvaluateState(this.getManager().getTypeManager(), row, true));
                        const thisRow = Utility.cast(r.value, Boolean);
                        if (thisRow && this.checkType === Check.CheckType.NO_ROWS)
                        {
                            this.explanation = r.makeExplanation(null);
                            return false;
                        }
                        else if (!thisRow && this.checkType === Check.CheckType.ALL_ROWS)
                        {
                            this.explanation = r.makeExplanation(null);
                            return false;
                        }
                        else if (thisRow && this.checkType === Check.CheckType.ANY_ROW)
                        {
                            this.explanation = r.makeExplanation(null);
                            return true;
                        }
                    }
                    if (this.checkType === Check.CheckType.ANY_ROW)
                        return false;
                    else
                        return true;
                }

                throw new UserException("Cannot find table: " + this.srcTableId.toString());
            }
        }
        catch (e)
        {
            if (e instanceof EvaluationException)
                this.explanation = e.makeExplanation();
            throw e;
        }
    }

    // Java: getColumnLookup() and static getColumnLookup(TableManager, TableId, @Nullable TableId, CheckType)
    public getColumnLookup(): Expression.ColumnLookup
    {
        return Check.getColumnLookup(this.getManager(), this.srcTableId, this.getId(), this.checkType);
    }

    public static getColumnLookup(tableManager: TableManager, srcTableId: TableId, us: TableId | null, checkType: Check.CheckType): Expression.ColumnLookup
    {
        const lookup: Expression.ColumnLookup = {
            getColumn(_expression: Expression, tableId: TableId | null, columnId: ColumnId): Expression.ColumnLookup.FoundColumn | null
            {
                try
                {
                    let column: Pair<TableId, Column> | null = null;
                    const srcTable = tableManager.getSingleTableOrNull(srcTableId);
                    if (tableId === null)
                    {
                        if (srcTable !== null)
                        {
                            const col = srcTable.getData().getColumnOrNull(columnId);
                            column = col === null ? null : new Pair(srcTable.getId(), col);
                        }
                    }
                    else
                    {
                        const table = tableManager.getSingleTableOrNull(tableId);
                        if (table !== null)
                        {
                            const col = table.getData().getColumnOrNull(columnId);
                            column = col === null ? null : new Pair(table.getId(), col);
                        }
                    }
                    if (column === null)
                    {
                        return null;
                    }
                    else
                    {

                        if (checkType === Check.CheckType.STANDALONE)
                            return null;
                        else
                            return new Expression.ColumnLookup.FoundColumn(column.getFirst(), srcTableId.equals(tableId), column.getSecond().getType(), null);
                    }
                }
                catch (e)
                {
                    if (!(e instanceof InternalException || e instanceof UserException))
                        throw e;
                    Log.log(e);
                }
                return null;
            },

            getAvailableColumnReferences(): Pair<TableId | null, ColumnId>[]
            {
                return tableManager.getAllTables().flatMap((t: Table): Pair<TableId | null, ColumnId>[] =>
                {
                    try
                    {
                        const columns: Pair<TableId | null, ColumnId>[] = [];
                        if (t.getId().equals(srcTableId))
                        {
                            for (const column of t.getData().getColumns())
                            {
                                if (checkType !== Check.CheckType.STANDALONE)
                                    columns.push(new Pair<TableId | null, ColumnId>(null, column.getName()));
                            }
                        }
                        return columns;
                    }
                    catch (e)
                    {
                        if (!(e instanceof InternalException || e instanceof UserException))
                            throw e;
                        Log.log(e);
                        return [];
                    }
                });
            },

            getPossibleColumnReferences(tableId: TableId, columnId: ColumnId): Expression.ColumnLookup.ClickedReference[]
            {
                return lookup.getAvailableColumnReferences().filter(c => tableId.equals(c.getFirst()) && columnId.equals(c.getSecond())).map(c => new class extends Expression.ColumnLookup.ClickedReference
                {
                    public getExpression(): Expression
                    {
                        return IdentExpression.column(c.getFirst(), c.getSecond());
                    }
                }(tableId, columnId));
            },

            getAvailableTableReferences(): TableId[]
            {
                return tableManager.getAllTablesAvailableTo(us, false).map(t => t.getId());
            },

            getTable(tableName: TableId | null): Expression.ColumnLookup.FoundTable | null
            {
                let t: Table | null;
                if (tableName === null)
                {
                    if (us === null)
                        t = null;
                    else
                        t = tableManager.getSingleTableOrNull(us);
                }
                else
                    t = tableManager.getSingleTableOrNull(tableName);
                return Utility.onNullable(t, t => new FoundTableActual(t));
            },
        };
        return lookup;
    }

    public override getData(): RecordSet
    {
        if (this.recordSet === null)
            throw new UserException(this.error);
        return this.recordSet;
    }

    protected override getPrimarySources(): readonly TableId[]
    {
        return [this.srcTableId];
    }

    public override getSourcesFromExpressions(): readonly TableId[]
    {
        return ExpressionUtil.tablesFromExpression(this.checkExpression);
    }

    public getSrcTableId(): TableId
    {
        return this.srcTableId;
    }

    public withNewSource(newSrcTableId: TableId): Transformation
    {
        return new Check(this.getManager(), this.getDetailsForCopy(this.getId()), newSrcTableId, this.checkType, this.checkExpression);
    }

    public getCheckExpression(): Expression
    {
        return this.checkExpression;
    }

    protected override getTransformationName(): string
    {
        return "check";
    }

    protected override saveDetail(_destination: JavaFile | null, renames: TableAndColumnRenames): readonly string[]
    {
        let checkTypeStr: string;
        switch (this.checkType)
        {
            case Check.CheckType.ALL_ROWS:
                checkTypeStr = "ALLROWS";
                break;
            case Check.CheckType.ANY_ROW:
                checkTypeStr = "ANYROWS";
                break;
            case Check.CheckType.NO_ROWS:
                checkTypeStr = "NOROWS";
                break;
            case Check.CheckType.STANDALONE:
            default: // To satisfy compiler
                checkTypeStr = "STANDALONE";
                break;
        }
        return [PREFIX + " " + checkTypeStr + " @EXPRESSION " + this.checkExpression.save(Expression.SaveDestination.TO_FILE, BracketedStatus.DONT_NEED_BRACKETS, renames.withDefaultTableId(this.srcTableId))];
    }

    public getCheckType(): Check.CheckType
    {
        return this.checkType;
    }

    // Only valid after fetching the result.
    public getExplanation(): Explanation | null
    {
        return this.explanation;
    }

    protected override transformationHashCode(): number
    {
        return this.checkExpression.hashCode();
    }

    // PORT-NOTE: as in Java, only the expression is compared (not the check type).
    protected override transformationEquals(obj: Transformation): boolean
    {
        if (obj instanceof Check)
            return this.checkExpression.equals(obj.checkExpression);
        return false;
    }

    public static makeTypeState(typeManager: TypeManager, selectedItem: Check.CheckType | null): TypeState
    {
        return selectedItem === Check.CheckType.STANDALONE ? new TypeState(typeManager, FunctionList.getFunctionLookup(typeManager.getUnitManager())) : TypeState.withRowNumber(typeManager, FunctionList.getFunctionLookup(typeManager.getUnitManager()));
    }

    public override visit<T>(visitor: TransformationVisitor<T>): T
    {
        return visitor.check(this);
    }

    public override getSuggestedName(): TableId
    {
        return Check.suggestedName(this.checkExpression);
    }

    public static suggestedName(checkExpression: Expression): TableId
    {
        return new TableId(IdentifierUtility.spaceSeparated("Chk", Filter.guessFirstColumnReference(checkExpression) ?? "custom"));
    }

}

export namespace Check
{
    // Java: an enum which overrides toString
    export class CheckType
    {
        private constructor(private readonly javaName: string, public readonly ordinal: number)
        {
        }

        public static readonly ALL_ROWS = new CheckType("ALL_ROWS", 0);
        public static readonly ANY_ROW = new CheckType("ANY_ROW", 1);
        public static readonly NO_ROWS = new CheckType("NO_ROWS", 2);
        public static readonly STANDALONE = new CheckType("STANDALONE", 3);

        public static values(): CheckType[]
        {
            return [CheckType.ALL_ROWS, CheckType.ANY_ROW, CheckType.NO_ROWS, CheckType.STANDALONE];
        }

        public name(): string
        {
            return this.javaName;
        }

        // For display:
        public toString(): string
        {
            switch (this)
            {
                case CheckType.STANDALONE:
                    return TranslationUtility.getString("edit.check.standalone");
                case CheckType.ALL_ROWS:
                    return TranslationUtility.getString("edit.check.allrows");
                case CheckType.ANY_ROW:
                    return TranslationUtility.getString("edit.check.anyrow");
                case CheckType.NO_ROWS:
                    return TranslationUtility.getString("edit.check.norows");
            }
            return "";
        }

        public hashCode(): number
        {
            return this.ordinal;
        }
    }

    export class Info extends SingleSourceTransformationInfo
    {
        public constructor()
        {
            super(Check.NAME, "transform.check", "preview-check.png", "check.explanation.short", ["remove", "delete"]);
        }

        protected override loadSingle(mgr: TableManager, initialLoadDetails: Table.InitialLoadDetails, srcTableId: TableId, detail: string, expressionVersion: ExpressionVersion): Transformation
        {
            const loaded = Utility.parseAsOne(detail, s => new TransformationLexer(s), t => new TransformationParser(t), p => p.check());

            const checkTypeContext = loaded.checkType();
            let checkType: CheckType;
            if (checkTypeContext.checkAllRows() !== null)
                checkType = CheckType.ALL_ROWS;
            else if (checkTypeContext.checkAnyRows() !== null)
                checkType = CheckType.ANY_ROW;
            else if (checkTypeContext.checkNoRows() !== null)
                checkType = CheckType.NO_ROWS;
            else
                checkType = CheckType.STANDALONE;

            return new Check(mgr, initialLoadDetails, srcTableId, checkType, ExpressionUtil.parse(null, loaded.expression().EXPRESSION().getText(), expressionVersion, mgr.getTypeManager(), FunctionList.getFunctionLookup(mgr.getUnitManager())));
        }

        public override makeWithSource(mgr: TableManager, destination: CellPosition, srcTable: Table): Transformation
        {
            return new Check(mgr, new Table.InitialLoadDetails(null, null, destination, null), srcTable.getId(), CheckType.STANDALONE, new BooleanLiteral(true));
        }
    }
}
