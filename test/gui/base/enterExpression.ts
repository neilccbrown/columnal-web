// Port of test.gui.trait.EnterExpressionTrait (tests-gui-base): typing an expression into the focused
// expression editor.  The editor adds the closing bracket or quote after an opening one, which is
// deleted (and typed later).
// (The visitor is synchronous, and typing isn't: each visit gives the typing to do, as a function.)
import type { ExpressionIdentifier } from "../../../src/engine/anns/Annotations.js";
import type { BinaryOpExpression } from "../../../src/engine/expressions/transformations/expression/BinaryOpExpression.js";
import { Expression, type AddSubtractExpression, type AndExpression, type ArrayExpression, type BooleanLiteral, type CallExpression, type ComparisonExpression, type DefineExpression, type DivideExpression, type EqualExpression, type FieldAccessExpression, type HasTypeExpression, type IdentExpression, type IfThenElseExpression, type ImplicitLambdaArg, type InvalidIdentExpression, type InvalidOperatorExpression, type LambdaExpression, type MatchAnythingExpression, type MatchExpression, type NotEqualExpression, type NumericLiteral, type OrExpression, type PlusMinusPatternExpression, type RaiseExpression, type RecordExpression, type StringConcatExpression, type StringLiteral, type TemporalLiteral, type TimesExpression, type TypeLiteralExpression, type UnitLiteralExpression } from "../../../src/engine/expressions/transformations/expression/Expressions.js";
import type { NaryOpExpression } from "../../../src/engine/expressions/transformations/expression/NaryOpExpression.js";
import type { UnitExpression } from "../../../src/engine/expressions/transformations/expression/UnitExpressions.js";
import { ExpressionVisitorFlat } from "../../../src/engine/expressions/transformations/expression/visitor/ExpressionVisitorFlat.js";
import type { JavaRandom } from "../../../src/engine/java/JavaRandom.js";
import type { TypeManager } from "../../../src/engine/types/data/datatype/TypeManager.js";
import type { Pair } from "../../../src/engine/utility-adt/utility/adt/Pair.js";
import { enterType, enterUnit } from "./enterType.js";
import { push, write } from "./keyboard.js";

export enum EntryBracketStatus
{
    // e.g. when a function call argument
    DIRECTLY_ROUND_BRACKETED,
    // e.g. the top-level condition in @if ... @then
    SURROUNDED_BY_KEYWORDS,
    // e.g. an argument of plus
    SUB_EXPRESSION,
}

type Typing = () => Promise<void>;

export function enterExpression(typeManager: TypeManager, expression: Expression, bracketedStatus: EntryBracketStatus, r: JavaRandom, ...qualifiedIdentsToEnterInFull: string[]): Promise<void>
{
    const enter = (e: Expression, status: EntryBracketStatus): Promise<void> => enterExpression(typeManager, e, status, r, ...qualifiedIdentsToEnterInFull);
    const typing = expression.visit(new class extends ExpressionVisitorFlat<Typing>
    {
        protected override makeDef(e: Expression): Typing
        {
            throw new Error("Unsupported expression: " + e.constructor.name);
        }

        public override record(_self: RecordExpression, members: readonly Pair<ExpressionIdentifier, Expression>[]): Typing
        {
            return async () =>
            {
                if (bracketedStatus !== EntryBracketStatus.DIRECTLY_ROUND_BRACKETED)
                {
                    await write("(");
                    await push("Delete");
                }
                for (let i = 0; i < members.length; i++)
                {
                    if (i > 0)
                        await write(",");
                    await write(members[i]!.getFirst() + ": ");
                    await enter(members[i]!.getSecond(), EntryBracketStatus.SUB_EXPRESSION);
                }
                if (bracketedStatus !== EntryBracketStatus.DIRECTLY_ROUND_BRACKETED)
                    await write(")");
            };
        }

        public override list(_self: ArrayExpression, members: readonly Expression[]): Typing
        {
            return async () =>
            {
                await write("[");
                await push("Delete");
                for (let i = 0; i < members.length; i++)
                {
                    if (i > 0)
                        await write(",");
                    await enter(members[i]!, EntryBracketStatus.SUB_EXPRESSION);
                }
                await write("]");
            };
        }

        public override litText(self: StringLiteral, _value: string): Typing
        {
            return async () =>
            {
                await write("\"");
                await push("Delete");
                await write(self.editString().replaceAll("\"", "^q"));
                await write("\"");
            };
        }

        public override litNumber(self: NumericLiteral, _value: unknown, unit: UnitExpression | null): Typing
        {
            return async () =>
            {
                await write(self.editString());
                if (unit !== null)
                {
                    await write("{");
                    await push("Delete");
                    await enterUnit(unit, r);
                    await write("}");
                }
            };
        }

        public override litTemporal(self: TemporalLiteral): Typing
        {
            return async () =>
            {
                await write(self.toString());
                // Delete trailing curly and other:
                const opened = [...expression.toString()].filter(ch => ch === "{" || ch === "[" || ch === "(").length;
                for (let i = 0; i < opened; i++)
                    await push("Delete");
            };
        }

        public override litBoolean(self: BooleanLiteral): Typing
        {
            return () => write(self.toString());
        }

        public override litType(self: TypeLiteralExpression): Typing
        {
            return async () =>
            {
                await write("type{");
                await push("Delete");
                await enterType(self.getType(), r);
                await write("}");
            };
        }

        public override litUnit(self: UnitLiteralExpression): Typing
        {
            return async () =>
            {
                await write("unit{");
                await push("Delete");
                await write(self.getUnit().save(Expression.SaveDestination.toUnitEditor(typeManager.getUnitManager()), true));
                await write("}");
            };
        }

        public override call(_self: CallExpression, callTarget: Expression, args: readonly Expression[]): Typing
        {
            return async () =>
            {
                await enter(callTarget, EntryBracketStatus.SUB_EXPRESSION);
                await write("(");
                // Delete closing bracket:
                await push("Delete");
                for (let i = 0; i < args.length; i++)
                {
                    if (i > 0)
                        await write(",");
                    await enter(args[i]!, EntryBracketStatus.DIRECTLY_ROUND_BRACKETED);
                }
                await write(")");
            };
        }

        public override match(_self: MatchExpression, e: Expression, clauses: readonly MatchExpression.MatchClause[]): Typing
        {
            return async () =>
            {
                await write("@match");
                await enter(e, EntryBracketStatus.SURROUNDED_BY_KEYWORDS);
                for (const matchClause of clauses)
                {
                    await write("@case");
                    const patterns = matchClause.getPatterns();
                    for (let i = 0; i < patterns.length; i++)
                    {
                        if (i > 0)
                            await write("@orcase");
                        const pattern = patterns[i]!;
                        await enter(pattern.getPattern(), EntryBracketStatus.SURROUNDED_BY_KEYWORDS);
                        const guard = pattern.getGuard();
                        if (guard !== null)
                        {
                            await write("@given");
                            await enter(guard, EntryBracketStatus.SURROUNDED_BY_KEYWORDS);
                        }
                    }
                    await write("@then");
                    await enter(matchClause.getOutcome(), EntryBracketStatus.SURROUNDED_BY_KEYWORDS);
                }
                // To finish whole match expression:
                await write("@endmatch");
            };
        }

        public override ifThenElse(_self: IfThenElseExpression, condition: Expression, thenExpression: Expression, elseExpression: Expression): Typing
        {
            return async () =>
            {
                await write("@if");
                await enter(condition, EntryBracketStatus.SURROUNDED_BY_KEYWORDS);
                await write("@then");
                await enter(thenExpression, EntryBracketStatus.SURROUNDED_BY_KEYWORDS);
                await write("@else");
                await enter(elseExpression, EntryBracketStatus.SURROUNDED_BY_KEYWORDS);
                await write("@endif");
            };
        }

        public override matchAnything(_self: MatchAnythingExpression): Typing
        {
            return () => write("_");
        }

        public override implicitLambdaArg(_self: ImplicitLambdaArg): Typing
        {
            return () => write("?");
        }

        public override ident(_self: IdentExpression, namespace: ExpressionIdentifier | null, idents: readonly ExpressionIdentifier[]): Typing
        {
            return async () =>
            {
                const full = (namespace === null ? "" : namespace + "\\\\") + idents.join("\\");
                if (qualifiedIdentsToEnterInFull.includes(full))
                {
                    await write(full);
                }
                else
                {
                    // Check for duplicate tags, and scope with type name if not recognised as single tag:
                    if (namespace === "tag")
                    {
                        if (typeManager.lookupTag(null, idents[idents.length - 1]!).isLeft())
                            await write(idents[idents.length - 2]! + "\\");
                    }
                    await write(idents[idents.length - 1]!);
                }
            };
        }

        public override invalidIdent(_self: InvalidIdentExpression, text: string): Typing
        {
            return () => write(text);
        }

        public override invalidOps(_self: InvalidOperatorExpression, items: readonly Expression[]): Typing
        {
            return async () =>
            {
                for (const e of items)
                    await enter(e, EntryBracketStatus.SUB_EXPRESSION);
            };
        }

        public override define(_self: DefineExpression, defines: readonly DefineExpression.DefineItem[], body: Expression): Typing
        {
            return async () =>
            {
                await write("@define");
                let first = true;
                for (const define of defines)
                {
                    if (!first)
                        await write(",");
                    first = false;
                    await define.typeOrDefinition.either<Promise<void>>(x => enter(x, EntryBracketStatus.SURROUNDED_BY_KEYWORDS), async x =>
                    {
                        await enter(x.lhsPattern, EntryBracketStatus.SUB_EXPRESSION);
                        await write("=");
                        await enter(x.rhsValue, EntryBracketStatus.SUB_EXPRESSION);
                    });
                }
                await write("@then");
                await enter(body, EntryBracketStatus.SURROUNDED_BY_KEYWORDS);
                await write("@enddefine");
            };
        }

        private enterNary(n: NaryOpExpression): Typing
        {
            return async () =>
            {
                if (bracketedStatus === EntryBracketStatus.SUB_EXPRESSION)
                {
                    await write("(");
                    await push("Delete");
                }
                for (let i = 0; i < n.getChildren().length; i++)
                {
                    await enter(n.getChildren()[i]!, EntryBracketStatus.SUB_EXPRESSION);
                    if (i < n.getChildren().length - 1)
                    {
                        await write(n._test_getOperatorEntry(i));
                        if (n._test_getOperatorEntry(i) === "-" || n._test_getOperatorEntry(i) === "+" || r.nextBoolean())
                            await write(" ");
                    }
                }
                if (bracketedStatus === EntryBracketStatus.SUB_EXPRESSION)
                    await write(")");
            };
        }

        public override addSubtract(self: AddSubtractExpression): Typing
        {
            return this.enterNary(self);
        }

        public override and(self: AndExpression): Typing
        {
            return this.enterNary(self);
        }

        public override or(self: OrExpression): Typing
        {
            return this.enterNary(self);
        }

        public override comparison(self: ComparisonExpression): Typing
        {
            return this.enterNary(self);
        }

        public override concatText(self: StringConcatExpression): Typing
        {
            return this.enterNary(self);
        }

        public override multiply(self: TimesExpression): Typing
        {
            return this.enterNary(self);
        }

        private enterBinary(b: BinaryOpExpression): Typing
        {
            return async () =>
            {
                if (bracketedStatus === EntryBracketStatus.SUB_EXPRESSION)
                {
                    await write("(");
                    await push("Delete");
                }
                await enter(b.getLHS(), EntryBracketStatus.SUB_EXPRESSION);
                await write(b._test_getOperatorEntry());
                if (b._test_getOperatorEntry() === "-" || b._test_getOperatorEntry() === "+" || r.nextBoolean())
                    await write(" ");
                await enter(b.getRHS(), EntryBracketStatus.SUB_EXPRESSION);
                if (bracketedStatus === EntryBracketStatus.SUB_EXPRESSION)
                    await write(")");
            };
        }

        public override notEqual(self: NotEqualExpression): Typing
        {
            return this.enterBinary(self);
        }

        public override divide(self: DivideExpression): Typing
        {
            return this.enterBinary(self);
        }

        public override plusMinus(self: PlusMinusPatternExpression): Typing
        {
            return this.enterBinary(self);
        }

        public override raise(self: RaiseExpression): Typing
        {
            return this.enterBinary(self);
        }

        public override hasType(_self: HasTypeExpression, lhsVar: ExpressionIdentifier, rhsType: Expression): Typing
        {
            return async () =>
            {
                await write(lhsVar);
                await write("::");
                await enter(rhsType, EntryBracketStatus.SUB_EXPRESSION);
            };
        }

        public override field(_self: FieldAccessExpression, lhsRecord: Expression, fieldName: string): Typing
        {
            return async () =>
            {
                if (bracketedStatus === EntryBracketStatus.SUB_EXPRESSION)
                {
                    await write("(");
                    await push("Delete");
                }
                await enter(lhsRecord, EntryBracketStatus.SUB_EXPRESSION);
                await write("#");
                await write(fieldName);
                if (bracketedStatus === EntryBracketStatus.SUB_EXPRESSION)
                    await write(")");
            };
        }

        public override equal(self: EqualExpression): Typing
        {
            return this.enterNary(self);
        }

        public override lambda(_self: LambdaExpression, parameters: readonly Expression[], body: Expression): Typing
        {
            return async () =>
            {
                await write("@function");
                for (let i = 0; i < parameters.length; i++)
                {
                    if (i > 0)
                        await write(", ");
                    await enter(parameters[i]!, EntryBracketStatus.SUB_EXPRESSION);
                }
                await write(" @then ");
                await enter(body, EntryBracketStatus.SURROUNDED_BY_KEYWORDS);
                await write("@endfunction");
            };
        }
    }());
    return typing();
}
