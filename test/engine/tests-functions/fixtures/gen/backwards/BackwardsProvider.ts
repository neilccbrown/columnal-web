// Port of test.gen.backwards.BackwardsProvider (tests-functions testFixtures).
import { CallExpression, type Expression } from "../../../../../../src/engine/expressions/transformations/expression/Expressions.js";
import { FunctionList } from "../../../../../../src/engine/functions/transformations/function/FunctionList.js";
import type { DataType } from "../../../../../../src/engine/types/data/datatype/DataType.js";
import type { Unit } from "../../../../../../src/engine/types/data/unit/Unit.js";
import type { Value } from "../../../../../../src/engine/utility/utility/Value.js";
import type { SourceOfRandomness } from "../../../../../support/quickcheck.js";
import type { ExpressionMaker } from "./ExpressionMaker.js";
import type { RequestBackwardsExpression } from "./RequestBackwardsExpression.js";

export abstract class BackwardsProvider
{
    protected readonly r: SourceOfRandomness;
    protected readonly parent: RequestBackwardsExpression;

    public constructor(r: SourceOfRandomness, parent: RequestBackwardsExpression)
    {
        this.r = r;
        this.parent = parent;
    }

    public abstract terminals(targetType: DataType, targetValue: Value): ExpressionMaker[];

    public abstract deep(maxLevels: number, targetType: DataType, targetValue: Value): ExpressionMaker[];

    protected call(name: string, ...args: Expression[]): CallExpression
    {
        return new CallExpression(FunctionList.getFunctionLookup(this.parent.getTypeManager().getUnitManager()), name, ...args);
    }

    protected getUnit(name: string): Unit
    {
        const m = this.parent.getTypeManager().getUnitManager();
        return m.loadUse(name);
    }
}
