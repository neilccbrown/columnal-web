// Port of test.gen.backwards.BackwardsFunction (tests-functions testFixtures).
import type { ExpressionIdentifier } from "../../../../../../src/engine/anns/Annotations.js";
import { AddSubtractExpression, BooleanLiteral, CallExpression, ComparisonExpression, DefineExpression, DivideExpression, HasTypeExpression, IdentExpression, IfThenElseExpression, ImplicitLambdaArg, LambdaExpression, NotEqualExpression, OrExpression, TimesExpression, TypeLiteralExpression, type Expression } from "../../../../../../src/engine/expressions/transformations/expression/Expressions.js";
import { TypeExpression } from "../../../../../../src/engine/expressions/transformations/expression/type/TypeExpressions.js";
import { ExpressionVisitorFlat } from "../../../../../../src/engine/expressions/transformations/expression/visitor/ExpressionVisitorFlat.js";
import { javaShuffle } from "../../../../../../src/engine/java/JavaCollections.js";
import { JavaRandom } from "../../../../../../src/engine/java/JavaRandom.js";
import { DataType } from "../../../../../../src/engine/types/data/datatype/DataType.js";
import { Either } from "../../../../../../src/engine/utility-adt/utility/adt/Either.js";
import { Utility } from "../../../../../../src/engine/utility/utility/Utility.js";
import type { Value } from "../../../../../../src/engine/utility/utility/Value.js";
import type { SourceOfRandomness } from "../../../../../support/quickcheck.js";
import { BackwardsProvider } from "./BackwardsProvider.js";
import type { ExpressionMaker } from "./ExpressionMaker.js";

export class BackwardsFunction extends BackwardsProvider
{
    public override terminals(_targetType: DataType, _targetValue: Value): ExpressionMaker[]
    {
        return [];
    }

    public override deep(maxLevels: number, targetType: DataType, targetValue: Value): ExpressionMaker[]
    {
        return [() => {
            const expression = this.parent.make(targetType, targetValue, maxLevels - 1);
            const paramsAndBody = expression.visit(new BackwardsFunction.Functioniser(this.r, new JavaRandom(this.r.nextLong()), targetType));

            const funcName = ("func " + this.r.nextInt(1000000)) as ExpressionIdentifier;
            let func: Expression;
            if (this.r.nextBoolean())
                func = paramsAndBody.turnFormalNamesIntoBody(Utility.replicateM(paramsAndBody.callActualParameters.length, () => new ImplicitLambdaArg()));
            else
            {
                const paramNames: ExpressionIdentifier[] = Array.from({ length: paramsAndBody.callActualParameters.length }, (_, n) => (funcName + " param " + n) as ExpressionIdentifier);
                func = new LambdaExpression(Utility.mapListI(paramNames, name => IdentExpression.load(name)), paramsAndBody.turnFormalNamesIntoBody(Utility.mapListI(paramNames, name => IdentExpression.load(name))));
            }

            const definition = Either.right<HasTypeExpression, DefineExpression.Definition>(new DefineExpression.Definition(IdentExpression.load(funcName), func));
            return DefineExpression.unrecorded(paramsAndBody.actualParameterTypes === null ? [definition]
                : [Either.left<HasTypeExpression, DefineExpression.Definition>(new HasTypeExpression(funcName, new TypeLiteralExpression(TypeExpression.fromDataType(DataType.function(paramsAndBody.actualParameterTypes, targetType))))), definition]
                , new CallExpression(IdentExpression.load(funcName), paramsAndBody.callActualParameters));
        }];
    }
}

export namespace BackwardsFunction
{
    export class Functioned
    {
        public readonly callActualParameters: readonly Expression[];
        public readonly actualParameterTypes: readonly DataType[] | null;
        public readonly turnFormalNamesIntoBody: (formalNames: readonly Expression[]) => Expression;

        public constructor(callActualParameters: readonly Expression[], actualParameterTypes: readonly DataType[] | null, turnFormalNamesIntoBody: (formalNames: readonly Expression[]) => Expression)
        {
            this.callActualParameters = callActualParameters;
            this.actualParameterTypes = actualParameterTypes;
            this.turnFormalNamesIntoBody = turnFormalNamesIntoBody;
        }
    }

    // Gives back list of expressions, and a function that takes replacements for those expressions and reassembles the original.
    // The idea being that you swap the originals for function parameters.
    // Java: an inner class, using the outer instance's SourceOfRandomness (r)
    export class Functioniser extends ExpressionVisitorFlat<Functioned>
    {
        private readonly r: SourceOfRandomness;
        private readonly random: JavaRandom;
        private readonly targetType: DataType;

        public constructor(r: SourceOfRandomness, random: JavaRandom, targetType: DataType)
        {
            super();
            this.r = r;
            this.random = random;
            this.targetType = targetType;
        }

        // Given a list of expressions, picks N of them (1 <= N <= list size) and returns those expressions, plus a function that given replacements for those expressions,
        // calls make with the right ones in the list replaced.
        private pick(expressions: readonly Expression[], paramTypes: readonly DataType[] | null, make: (es: readonly Expression[]) => Expression): Functioned
        {
            const numPicked = 1 + this.r.nextInt(expressions.length - 1);

            const picked: boolean[] = [...Utility.concatI(Utility.replicate(numPicked, true), Utility.replicate(expressions.length - numPicked, false))];
            javaShuffle(picked, this.random);

            const substitutions: Expression[] = [];
            const substitutedTypes: DataType[] = [];
            for (let i = 0; i < picked.length; i++)
            {
                if (picked[i])
                {
                    substitutions.push(expressions[i]!);
                    if (paramTypes !== null)
                        substitutedTypes.push(paramTypes[i]!);
                }
            }

            return new Functioned(substitutions, paramTypes === null ? null : substitutedTypes, subs => {
                const substituted: Expression[] = [];
                let nextParam = 0;
                for (let i = 0; i < picked.length; i++)
                {
                    if (picked[i])
                        substituted.push(subs[nextParam++]!);
                    else
                        substituted.push(expressions[i]!);
                }
                return make(substituted);
            });
        }

        protected override makeDef(expression: Expression): Functioned
        {
            return new Functioned([new BooleanLiteral(true)], [DataType.BOOLEAN], ps => IfThenElseExpression.unrecorded(ps[0]!, expression, expression));
        }

        // Note: can't do if-then-else because its condition may define variables that are used in the body.

        public override addSubtract(_self: AddSubtractExpression, expressions: readonly Expression[], ops: readonly AddSubtractExpression.AddSubtractOp[]): Functioned
        {
            return this.pick(expressions, Utility.replicate(expressions.length, this.targetType), es => new AddSubtractExpression(es, ops));
        }

        public override notEqual(_self: NotEqualExpression, lhs: Expression, rhs: Expression): Functioned
        {
            return this.pick([lhs, rhs], null, es => new NotEqualExpression(es[0]!, es[1]!));
        }

        public override divide(_self: DivideExpression, lhs: Expression, rhs: Expression): Functioned
        {
            return this.pick([lhs, rhs], null, es => new DivideExpression(es[0]!, es[1]!));
        }

        public override or(_self: OrExpression, expressions: readonly Expression[]): Functioned
        {
            return this.pick(expressions, Utility.replicate(expressions.length, DataType.BOOLEAN), es => new OrExpression(es));
        }

        public override comparison(_self: ComparisonExpression, expressions: readonly Expression[], operators: readonly ComparisonExpression.ComparisonOperator[]): Functioned
        {
            return this.pick(expressions, null, es => new ComparisonExpression(es, operators));
        }

        public override multiply(_self: TimesExpression, expressions: readonly Expression[]): Functioned
        {
            return this.pick(expressions, null, es => new TimesExpression(es));
        }

        // TODO lots more, call pick
    }
}
