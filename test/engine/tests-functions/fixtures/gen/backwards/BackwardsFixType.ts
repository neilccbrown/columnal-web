// Port of test.gen.backwards.BackwardsFixType (tests-functions testFixtures).
import { TypeLiteralExpression } from "../../../../../../src/engine/expressions/transformations/expression/Expressions.js";
import { FunctionList } from "../../../../../../src/engine/functions/transformations/function/FunctionList.js";
import type { DataType } from "../../../../../../src/engine/types/data/datatype/DataType.js";
import { JellyType } from "../../../../../../src/engine/types/jellytype/JellyTypes.js";
import type { Value } from "../../../../../../src/engine/utility/utility/Value.js";
import { BackwardsProvider } from "./BackwardsProvider.js";
import type { ExpressionMaker } from "./ExpressionMaker.js";

export class BackwardsFixType extends BackwardsProvider
{
    public override terminals(_targetType: DataType, _targetValue: Value): ExpressionMaker[]
    {
        return [];
    }

    public override deep(maxLevels: number, targetType: DataType, targetValue: Value): ExpressionMaker[]
    {
        return [() => {
            const m = this.parent.getTypeManager();
            return TypeLiteralExpression.fixType(m, FunctionList.getFunctionLookup(m.getUnitManager()), JellyType.fromConcrete(targetType), this.parent.make(targetType, targetValue, maxLevels - 1));
        }];
    }
}
