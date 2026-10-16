// Port of test.gen.ExpressionValue (tests-functions testFixtures).
import type { RecordSet } from "../../../../../src/engine/data/data/RecordSet.js";
import type { Expression } from "../../../../../src/engine/expressions/transformations/expression/Expressions.js";
import type { TableId } from "../../../../../src/engine/identifiers/id/TableId.js";
import type { DataType } from "../../../../../src/engine/types/data/datatype/DataType.js";
import type { TypeManager } from "../../../../../src/engine/types/data/datatype/TypeManager.js";
import type { Value } from "../../../../../src/engine/utility/utility/Value.js";
import { SingleTableLookup } from "../SingleTableLookup.js";
import type { GenExpressionValueBase } from "./GenExpressionValueBase.js";

/**
 * A tuple of: original data, new-expression, new-type and expected-new-value for a record set + calculate-new-column
 */
export class ExpressionValue extends SingleTableLookup
{
    public readonly type: DataType;
    // Number of values  in list will equal number of rows
    // in recordSet.  Will be 1 for GenBackwards and N for GenForwards.
    public readonly value: readonly Value[];
    public override readonly tableId: TableId;
    public readonly recordSet: RecordSet;
    public readonly expression: Expression;
    public readonly typeManager: TypeManager;
    public readonly generator: GenExpressionValueBase | null;

    public constructor(type: DataType, value: readonly Value[], typeManager: TypeManager, tableId: TableId, recordSet: RecordSet, expression: Expression, generator: GenExpressionValueBase | null)
    {
        super(tableId, recordSet);
        this.tableId = tableId;
        this.type = type;
        this.value = value;
        this.typeManager = typeManager;
        this.recordSet = recordSet;
        this.expression = expression;
        this.generator = generator;
    }

    public override toString(): string
    {
        return "Type: " + this.type.toString() + " Expression: " + this.expression.toString();
    }

    public withExpression(replacement: Expression): ExpressionValue
    {
        return new ExpressionValue(this.type, this.value, this.typeManager, this.tableId, this.recordSet, replacement, this.generator);
    }

    public getExpressionLength(): number
    {
        return this.expression.toString().length;
    }
}
