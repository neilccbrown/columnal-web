// Port of test.gen.backwards.RequestBackwardsExpression (tests-functions testFixtures).
import type { Decimal } from "../../../../../../src/engine/java/JavaBigDecimal.js";
import type { Expression } from "../../../../../../src/engine/expressions/transformations/expression/Expressions.js";
import type { UnitExpression } from "../../../../../../src/engine/expressions/transformations/expression/UnitExpressions.js";
import type { DataType } from "../../../../../../src/engine/types/data/datatype/DataType.js";
import type { TypeManager } from "../../../../../../src/engine/types/data/datatype/TypeManager.js";
import type { Unit } from "../../../../../../src/engine/types/data/unit/Unit.js";
import type { Value } from "../../../../../../src/engine/utility/utility/Value.js";

export interface RequestBackwardsExpression
{
    make(type: DataType, targetValue: Value, maxLevels: number): Expression;

    makeValue(t: DataType): Value;

    makeType(): DataType;

    getTypeManager(): TypeManager;

    makeUnitExpression(unit: Unit): UnitExpression;

    // Java returns a @Value long
    genInt(): Decimal;
}
