// Port of test.gen.backwards.BackwardsFromText (tests-functions testFixtures).
import { CallExpression, TypeLiteralExpression } from "../../../../../../src/engine/expressions/transformations/expression/Expressions.js";
import { TypeExpression } from "../../../../../../src/engine/expressions/transformations/expression/type/TypeExpressions.js";
import { FunctionList } from "../../../../../../src/engine/functions/transformations/function/FunctionList.js";
import { DataType } from "../../../../../../src/engine/types/data/datatype/DataType.js";
import { DataTypeUtility } from "../../../../../../src/engine/types/data/datatype/DataTypeUtility.js";
import type { Value } from "../../../../../../src/engine/utility/utility/Value.js";
import { TFunctionUtil } from "../../functions/TFunctionUtil.js";
import { BackwardsProvider } from "./BackwardsProvider.js";
import type { ExpressionMaker } from "./ExpressionMaker.js";

export class BackwardsFromText extends BackwardsProvider
{
    public override terminals(targetType: DataType, targetValue: Value): ExpressionMaker[]
    {
        const val = DataTypeUtility.valueToString(targetValue);
        return [
            () => new CallExpression(FunctionList.getFunctionLookup(this.parent.getTypeManager().getUnitManager()), "from text to",
                new TypeLiteralExpression(TypeExpression.fromDataType(targetType)),
                TFunctionUtil.makeStringLiteral(val, this.r)
            ),
        ];
    }

    public override deep(maxLevels: number, targetType: DataType, targetValue: Value): ExpressionMaker[]
    {
        const val = DataTypeUtility.valueToString(targetValue);
        return [
                () => new CallExpression(FunctionList.getFunctionLookup(this.parent.getTypeManager().getUnitManager()), "from text to",
                        new TypeLiteralExpression(TypeExpression.fromDataType(targetType)),
                        this.parent.make(DataType.TEXT, val, maxLevels - 1)
                ),
        ];
    }
}
