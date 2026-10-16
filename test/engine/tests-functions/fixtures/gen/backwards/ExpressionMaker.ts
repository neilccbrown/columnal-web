// Port of test.gen.backwards.ExpressionMaker (tests-functions testFixtures).
// Java: a functional interface with default getBias() (1) and withBias(bias) methods; here
// a function with an optional bias property.
import type { Expression } from "../../../../../../src/engine/expressions/transformations/expression/Expressions.js";

export interface ExpressionMaker
{
    (): Expression;
    bias?: number;
}

export namespace ExpressionMaker
{
    export function getBias(maker: ExpressionMaker): number
    {
        return maker.bias ?? 1;
    }

    export function withBias(maker: ExpressionMaker, bias: number): ExpressionMaker
    {
        const m: ExpressionMaker = () => maker();
        m.bias = bias;
        return m;
    }
}
