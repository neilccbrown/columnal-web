// Port of xyz.columnal.gui.lexeditor.SaverBase (lex-editor module).
//
// PORT-NOTE: Java's inner classes, which use the saver's type parameters and methods, are classes in
// the SaverBase namespace here, given the saver where they need it; the saver's members that they
// use are public (marked @internal).  OperatorExpressionInfo's three constructors, which Java tells
// apart by their argument types, are the static methods nary, narySimple and binary.
import type { CanonicalLocation, DisplayLocation } from "../../../../engine/anns/Annotations.js";
import { CanonicalSpan } from "../../../../engine/expressions/transformations/expression/CanonicalSpan.js";
import { QuickFix } from "../../../../engine/expressions/transformations/expression/QuickFix.js";
import type { TypeManager } from "../../../../engine/types/data/datatype/TypeManager.js";
import { Either } from "../../../../engine/utility-adt/utility/adt/Either.js";
import { Pair } from "../../../../engine/utility-adt/utility/adt/Pair.js";
import type { StyledShowable } from "../../../../engine/utility-error/styled/StyledShowable.js";
import { StyledString } from "../../../../engine/utility-error/styled/StyledString.js";
import { Utility } from "../../../../engine/utility/utility/Utility.js";
import { javaEquals } from "../../../../engine/java/JavaObject.js";
import type { InsertListener } from "../../../lex-editor-completion/gui/lexeditor/completion/InsertListener.js";
import { EditorLocationAndErrorRecorder } from "./EditorLocationAndErrorRecorder.js";
import type { ExpressionToken } from "./ExpressionToken.js";
import { TextQuickFix } from "./TextQuickFix.js";

/**
 *
 * @param <EXPRESSION> The actual expression items in the tree
 * @param <SAVER> A saver (the subclass of this class) for the expressions
 * @param <OP> Operators that go between operands in an expression
 * @param <KEYWORD> Keywords that can alter scope levels, either beginning or ending scopes
 * @param <BRACKET_CONTENT> The content of brackets.  For units this is EXPRESSION, for others it is list of expression and operators (which will be commas)
 */
export abstract class SaverBase<EXPRESSION extends StyledShowable, SAVER, OP extends ExpressionToken, KEYWORD extends ExpressionToken, BRACKET_CONTENT>
{
    /**
     * Gets all special keywords available in child operators,
     * e.g. "then", paired with their description.
     */
    //default ImmutableList<Pair<String, @Localized String>> operatorKeywords()
    //{
    //    return ImmutableList.of();
    //}

    protected interleave<O>(expressions: readonly EXPRESSION[], ops: readonly O[]): Either<O, EXPRESSION>[]
    {
        const r: Either<O, EXPRESSION>[] = [];

        for (let i = 0; i < expressions.length; i++)
        {
            r.push(Either.right(expressions[i]!));
            if (i < ops.length)
                r.push(Either.left(ops[i]!));
        }

        return r;
    }

    public hasUnmatchedBrackets(): boolean
    {
        return this.hasUnmatchedBracketsField;
    }

    public addNestedErrors(nestedErrors: readonly EditorLocationAndErrorRecorder.ErrorDetails[], caretPosOffset: CanonicalLocation, displayCaretPosOffset: DisplayLocation): void
    {
        for (const nestedError of nestedErrors)
        {
            this.locationRecorder.addNestedError(nestedError, caretPosOffset, displayCaretPosOffset);
        }

    }

    public addNestedLocations(locationRecorder: EditorLocationAndErrorRecorder, caretPosOffset: CanonicalLocation): void
    {
        this.locationRecorder.addNestedLocations(locationRecorder, caretPosOffset);
    }

    /**
     * Can this direct child node declare a variable?  i.e. is it part of a pattern?
     */
    //boolean canDeclareVariable(EEDisplayNode chid);

    /** @internal Java: expectSingle(locationRecorder, location), protected */
    public abstract expectSingle(locationRecorder: EditorLocationAndErrorRecorder, location: CanonicalSpan): SaverBase.BracketAndNodes<EXPRESSION, SAVER, BRACKET_CONTENT, EXPRESSION>;

    public miscBrackets(location: CanonicalSpan): SaverBase.BracketAndNodes<EXPRESSION, SAVER, BRACKET_CONTENT, EXPRESSION>
    {
        return this.expectSingle(this.locationRecorder, location);
    }

    public miscBracketsFrom(start: CanonicalSpan): (end: CanonicalSpan) => SaverBase.BracketAndNodes<EXPRESSION, SAVER, BRACKET_CONTENT, EXPRESSION>
    {
        return end => this.miscBrackets(CanonicalSpan.fromTo(start, end));
    }

    /** @internal Java: protected */
    public readonly currentScopes: SaverBase.Scope<EXPRESSION, OP, KEYWORD, BRACKET_CONTENT>[] = [];
    /** @internal Java: protected */
    public readonly locationRecorder: EditorLocationAndErrorRecorder;
    // Java: the field hasUnmatchedBrackets
    protected hasUnmatchedBracketsField = false;

    protected constructor(typeManager: TypeManager, insertListener: InsertListener)
    {
        this.locationRecorder = new EditorLocationAndErrorRecorder(typeManager, insertListener);
        this.addTopLevelScope();
    }

    public saveOperator(operator: OP, errorDisplayer: CanonicalSpan): void
    {
        this.peekScope().items.push(Either.right(new SaverBase.OpAndNode(operator, errorDisplayer)));
    }

    /** @internal Java: currentScopes.peek() */
    public peekScope(): SaverBase.Scope<EXPRESSION, OP, KEYWORD, BRACKET_CONTENT>
    {
        return this.currentScopes[this.currentScopes.length - 1]!;
    }

    /** @internal Java: protected */
    public abstract makeInvalidOp(location: CanonicalSpan, items: readonly Either<SaverBase.OpAndNode<OP>, EXPRESSION>[]): EXPRESSION;

    public addTopLevelScope(): void
    {
        // eslint-disable-next-line @typescript-eslint/no-this-alias
        const thisSaver = this;
        const currentScopesFinal = this.currentScopes;
        currentScopesFinal.push(new SaverBase.Scope<EXPRESSION, OP, KEYWORD, BRACKET_CONTENT>(CanonicalSpan.START, new class extends SaverBase.Terminator<EXPRESSION, SAVER, KEYWORD, BRACKET_CONTENT>
        {
            public override terminate(makeContent: SaverBase.FetchContent<EXPRESSION, SAVER, BRACKET_CONTENT>, terminator: KEYWORD | null, keywordErrorDisplayer: CanonicalSpan): boolean
            {
                const start = CanonicalSpan.START;
                const end = keywordErrorDisplayer;
                thisSaver.locationRecorder.addErrorAndFixes(end, StyledString.concat(StyledString.s("Unexpected "), terminator === null ? StyledString.s("item") : terminator.toStyledString()), []);
                currentScopesFinal[currentScopesFinal.length - 1]!.items.push(Either.left<EXPRESSION, SaverBase.OpAndNode<OP>>(makeContent<EXPRESSION>(thisSaver.expectSingle(thisSaver.locationRecorder, CanonicalSpan.fromTo(start, end)))));
                if (terminator !== null)
                    currentScopesFinal[currentScopesFinal.length - 1]!.items.push(Either.left<EXPRESSION, SaverBase.OpAndNode<OP>>(thisSaver.record(keywordErrorDisplayer, thisSaver.keywordToInvalid(terminator))));
                return true;
            }
        }("end")));
    }

    /** @internal Java: protected final */
    public record<R>(location: CanonicalSpan, expression: R): R
    {
        return this.locationRecorder.record(location, expression);
    }

    /** @internal Java: protected */
    public abstract recorderFor(expression: EXPRESSION): CanonicalSpan;

    /** @internal Java: protected */
    public abstract keywordToInvalid(keyword: KEYWORD): EXPRESSION;

    /** @internal Java: protected */
    public abstract opToInvalid(op: OP): EXPRESSION;

    protected getLocationForEither(item: Either<EXPRESSION, SaverBase.OpAndNode<OP>>): CanonicalSpan
    {
        return item.either(e => this.recorderFor(e), op => op.sourceNode);
    }

    //innerContentLocation is after opening bracket, used for
    //errors about empty content items
    /** @internal Java: protected */
    public abstract makeExpression<R extends StyledShowable>(content: readonly Either<EXPRESSION, SaverBase.OpAndNode<OP>>[], brackets: SaverBase.BracketAndNodes<EXPRESSION, SAVER, BRACKET_CONTENT, R>, innerContentLocation: CanonicalLocation, terminatorDescription: string | null): R;

    public finish(errorDisplayer: CanonicalSpan): EXPRESSION
    {
        while (this.currentScopes.length > 1)
        {
            // The error should be given by terminate when terminator is null
            const closed = this.currentScopes.pop()!;
            closed.terminator.terminate(<R extends StyledShowable>(brackets: SaverBase.BracketAndNodes<EXPRESSION, SAVER, BRACKET_CONTENT, R>): R =>
            {
                return this.makeExpression(closed.items, brackets, errorDisplayer.start, null);
            }, null, errorDisplayer);
        }

        const closed = this.currentScopes.pop()!;
        const brackets = this.expectSingle(this.locationRecorder, CanonicalSpan.fromTo(closed.openingNode, errorDisplayer));
        return this.makeExpression(closed.items, brackets, errorDisplayer.start, closed.terminator.terminatorDescription);
    }

    // Note: if we are copying to clipboard, callback will not be called
    public saveOperand(singleItem: EXPRESSION, location: CanonicalSpan): void
    {
        this.peekScope().items.push(Either.left<EXPRESSION, SaverBase.OpAndNode<OP>>(this.record(location, singleItem)));
    }

    protected processItems(content: readonly Either<EXPRESSION, SaverBase.OpAndNode<OP>>[]): SaverBase.CollectedItems<EXPRESSION, SAVER, OP, KEYWORD, BRACKET_CONTENT>
    {
        return new SaverBase.CollectedItems(this, content);
    }

    // For overriding in child classes
    /** @internal Java: protected */
    public fixesForAdjacentOperands(_first: EXPRESSION, _second: EXPRESSION): TextQuickFix[]
    {
        return [];
    }

    /**
     * If the operator followed by the operand can act as a unary operator,
     * return a supplier to make the combined item.  If not, return null.
     */
    /** @internal Java: protected */
    public abstract canBeUnary(operator: SaverBase.OpAndNode<OP>, followingOperand: EXPRESSION): (() => EXPRESSION) | null;

    /**
     * If all operators are from the same {@link records.gui.expressioneditor.OperandOps.OperatorExpressionInfo}, returns a normal expression with those operators.
     * Otherwise, it returns an invalid operator expression (as specified by the lambda), AND if feasible, suggests
     * likely quick fixes based on the suggested priority ordering given by the list parameter's ordering.
     *
     * @param candidates The ordering of the outer list indicates likely bracketing priority, with items earlier
     *                   in the list more likely to be bracketed (thus earlier means binds tighter).  So for example,
     *                   plus will come earlier in the list than equals, because given "a + b = c", we're more likely
     *                   to want to bracket "(a + b) = c" than "a + (b = c)".
     */
    public makeExpressionWithOperators<R extends StyledShowable>(
        candidates: readonly (readonly SaverBase.OperatorExpressionInfo<EXPRESSION, SAVER, OP, BRACKET_CONTENT>[])[], locationRecorder: EditorLocationAndErrorRecorder,
        makeInvalidOpExpression: (items: readonly Either<SaverBase.OpAndNode<OP>, EXPRESSION>[]) => R,
        expressionExps: readonly EXPRESSION[], ops: readonly SaverBase.OpAndNode<OP>[], brackets: SaverBase.BracketAndNodes<EXPRESSION, SAVER, BRACKET_CONTENT, R>): R | null
    {
        if (ops.length !== expressionExps.length - 1)
        {
            // Other issues: we're missing an argument!
            return null;
        }

        if (ops.length === 0)
        {
            // Given above, expressionExps must be size 1, so just use that list:
            return brackets.applyBrackets.applySingle(expressionExps[0]!);
        }

        // First, split it into sections based on cohesive parts that have the same operators:
        const operatorSections: SaverBase.OperatorSection<EXPRESSION, SAVER, OP, BRACKET_CONTENT>[] = [];
        nextOp: for (let i = 0; i < ops.length; i++)
        {
            if (operatorSections.length === 0 || !operatorSections[operatorSections.length - 1]!.addOperator(ops[i]!, i))
            {
                // Make new section:
                for (let candidateIndex = 0; candidateIndex < candidates.length; candidateIndex++)
                {
                    for (const operatorExpressionInfo of candidates[candidateIndex]!)
                    {
                        if (operatorExpressionInfo.includes(ops[i]!.op))
                        {
                            operatorSections.push(operatorExpressionInfo.makeOperatorSection(locationRecorder, candidateIndex, ops[i]!, i));
                            continue nextOp;
                        }
                    }
                }
                // If we get here, it's an unrecognised operator, so return an invalid expression:
                return null;
            }
        }

        if (operatorSections.length === 1)
        {
            // All operators are coherent with each other, can just return single expression:
            const single = operatorSections[0]!.makeExpression(expressionExps, brackets);
            if (single !== null)
                return single;

            // Maybe with the possibility of different brackets?
            const possibles: R[] = [];
            for (const alternateBracket of brackets.alternateBrackets())
            {
                const possible = operatorSections[0]!.makeExpression(expressionExps, alternateBracket);
                if (possible !== null)
                    possibles.push(possible);
            }
            if (possibles.length !== 0)
            {
                const invalidOpExpression = makeInvalidOpExpression(this.interleave(expressionExps, ops));
                locationRecorder.getRecorder().recordError(invalidOpExpression, StyledString.s("Surrounding brackets required"));
                locationRecorder.getRecorder().recordQuickFixes<R>(invalidOpExpression, Utility.mapList(possibles, fixed => new QuickFix<R>("fix.bracketAs", invalidOpExpression, () => fixed)));
                return invalidOpExpression;
            }
        }

        const invalidOpExpression = makeInvalidOpExpression(this.interleave(expressionExps, ops));
        locationRecorder.getRecorder().recordError(invalidOpExpression, StyledString.s("Mixed operators: brackets required"));

        if (operatorSections.length === 3
            && javaEquals(operatorSections[0]!.possibleOperators, operatorSections[2]!.possibleOperators)
            && operatorSections[0] instanceof SaverBase.NaryOperatorSection
            && operatorSections[2] instanceof SaverBase.NaryOperatorSection
            && operatorSections[1]!.operatorSetPrecedence <= operatorSections[0].operatorSetPrecedence
            )
        {
            // The sections either side match up, and the middle is same or lower precedence, so we can bracket
            // the middle and put it into one valid expression.  Hurrah!
            const middleStart = this.recorderFor(expressionExps[operatorSections[1]!.getFirstOperandIndex()]!);
            const middleEnd = this.recorderFor(expressionExps[operatorSections[1]!.getLastOperandIndex()]!);
            const middle: EXPRESSION | null = operatorSections[1]!.makeExpression(expressionExps, this.expectSingle(locationRecorder, CanonicalSpan.fromTo(middleStart, middleEnd)));
            if (middle !== null)
            {
                const replacement = (operatorSections[0] as SaverBase.NaryOperatorSection<EXPRESSION, SAVER, OP, BRACKET_CONTENT>).makeExpressionMiddleMerge(
                    middle,
                    operatorSections[2] as SaverBase.NaryOperatorSection<EXPRESSION, SAVER, OP, BRACKET_CONTENT>,
                    expressionExps, brackets
                );

                if (replacement !== null)
                {
                    const replacementFinal = replacement;
                    locationRecorder.getRecorder().recordQuickFixes<R>(invalidOpExpression, [
                        new QuickFix<R>("fix.bracketAs", invalidOpExpression, () => replacementFinal),
                    ]);
                }
            }
        }
        else
        {
            // We may be able to suggest some brackets
            // (Java's sort is stable)
            operatorSections.sort((a, b) => a.operatorSetPrecedence - b.operatorSetPrecedence);
            const precedence = operatorSections[0]!.operatorSetPrecedence;

            for (let i = 0; i < operatorSections.length; i++)
            {
                const operatorSection = operatorSections[i]!;
                if (operatorSection.operatorSetPrecedence !== precedence)
                    break;

                // We try all the bracketing states, preferring un-bracketed, for valid replacements:
                const secStart = this.recorderFor(expressionExps[operatorSection.getFirstOperandIndex()]!);
                const secEnd = this.recorderFor(expressionExps[operatorSection.getLastOperandIndex()]!);
                const sectionExpression: EXPRESSION | null = operatorSection.makeExpression(expressionExps, this.expectSingle(locationRecorder, CanonicalSpan.fromTo(secStart, secEnd)));
                if (sectionExpression === null)
                    continue;

                // The replacement if we just bracketed this section:
                let replacement: R | null;
                // There's three possibilities.  One is that if there is one other section, or two that match each other,
                // we could make a valid expression.  Otherwise we're going to be invalid even with a bracket.
                if (operatorSections.length === 2)
                {
                    // We need our new expression, plus the bits we're not including
                    if (operatorSection.getFirstOperandIndex() === 0)
                    {
                        replacement = operatorSections[1 - i]!.makeExpressionReplaceLHS(
                            sectionExpression,
                            expressionExps,
                            brackets
                        );
                    }
                    else
                    {
                        replacement = operatorSections[1 - i]!.makeExpressionReplaceRHS(
                            sectionExpression,
                            expressionExps,
                            brackets
                        );
                    }
                }
                //else if (operatorSections.size() == 3 && ...) -- Handled above
                else
                {
                    // Just have to make an invalid op expression, then:
                    const newExps: EXPRESSION[] = [...expressionExps];
                    const newOps: SaverBase.OpAndNode<OP>[] = [...ops];

                    newExps.splice(operatorSection.getFirstOperandIndex(), operatorSection.getLastOperandIndex() + 1 - operatorSection.getFirstOperandIndex());
                    newExps.splice(operatorSection.getFirstOperandIndex(), 0, sectionExpression);
                    newOps.splice(operatorSection.getFirstOperandIndex(), operatorSection.getLastOperandIndex() - operatorSection.getFirstOperandIndex());

                    replacement = makeInvalidOpExpression(this.interleave(newExps, newOps));
                }

                if (replacement !== null)
                {
                    const replacementFinal = replacement;
                    locationRecorder.getRecorder().recordQuickFixes<R>(invalidOpExpression, [
                        new QuickFix<R>("fix.bracketAs", invalidOpExpression, () => replacementFinal),
                    ]);
                }
            }
        }

        return invalidOpExpression;
    }

    // Expects a keyword matching closer.  If so, call the function with the current scope's expression, and you'll get back a final expression or a
    // terminator for a new scope, compiled using the scope content and given bracketed status
    public expect(expected: readonly KEYWORD[], makeBrackets: (span: CanonicalSpan) => SaverBase.BracketAndNodes<EXPRESSION, SAVER, BRACKET_CONTENT, EXPRESSION>, onSuccessfulClose: (content: EXPRESSION, keyword: CanonicalSpan) => Either<EXPRESSION, SaverBase.Terminator<EXPRESSION, SAVER, KEYWORD, BRACKET_CONTENT>>, prefixItemsOnFailedClose: () => readonly EXPRESSION[], promptIfUnfinished: StyledString | null, isBracket: boolean): SaverBase.Terminator<EXPRESSION, SAVER, KEYWORD, BRACKET_CONTENT>
    {
        // eslint-disable-next-line @typescript-eslint/no-this-alias
        const saver = this;
        return new class extends SaverBase.Terminator<EXPRESSION, SAVER, KEYWORD, BRACKET_CONTENT>
        {
            public override terminate(makeContent: SaverBase.FetchContent<EXPRESSION, SAVER, BRACKET_CONTENT>, terminator: KEYWORD | null, keywordErrorDisplayer: CanonicalSpan): boolean
            {
                const termIndex = terminator === null ? -1 : expected.indexOf(terminator);
                if (termIndex === 0)
                {
                    // All is well:
                    const content: EXPRESSION = makeContent(makeBrackets(keywordErrorDisplayer));
                    const result = onSuccessfulClose(content, keywordErrorDisplayer);
                    result.either_(e => saver.peekScope().items.push(Either.left(e)), t => saver.currentScopes.push(new SaverBase.Scope<EXPRESSION, OP, KEYWORD, BRACKET_CONTENT>(keywordErrorDisplayer, t)));
                    return true;
                }
                else
                {
                    if (isBracket)
                        saver.hasUnmatchedBracketsField = true;

                    // Error!
                    const toAdd = termIndex === -1 ? expected : expected.slice(0, termIndex);
                    const toAddSS = StyledString.joining(toAdd.map(s => s.toStyledString()), "…");
                    const fix = new TextQuickFix(StyledString.s("Add missing item(s)"), [], keywordErrorDisplayer.lhs(), () => new Pair(toAdd.map(k => k.getContent()).join(""), toAddSS));
                    saver.locationRecorder.addErrorAndFixes(keywordErrorDisplayer, StyledString.concat(StyledString.s("Missing "), toAddSS, StyledString.s(" before "), terminator === null ? StyledString.s("end") : terminator.toStyledString()), [fix]);
                    // Important to call makeContent before adding to scope on the next line:
                    const items: Either<SaverBase.OpAndNode<OP>, EXPRESSION>[] = [];
                    items.push(...Utility.mapListI(prefixItemsOnFailedClose(), (e: EXPRESSION) => Either.right<SaverBase.OpAndNode<OP>, EXPRESSION>(e)));
                    const content: EXPRESSION = makeContent(saver.unclosedBrackets(makeBrackets(keywordErrorDisplayer.lhs())));
                    if (promptIfUnfinished !== null)
                        saver.locationRecorder.recordEntryPromptG(content, _n => promptIfUnfinished);
                    items.push(Either.right(content));
                    //if (terminator != null)
                        //items.add(Either.<OpAndNode, @Recorded EXPRESSION>right(SaverBase.this.<EXPRESSION>record(keywordErrorDisplayer, keywordToInvalid(terminator))));
                    const built = items;
                    const invalid = saver.makeInvalidOp(CanonicalSpan.fromTo(built[0]!.either(opAndNode => opAndNode.sourceNode, e => saver.recorderFor(e)), keywordErrorDisplayer.lhs()), built);
                    saver.peekScope().items.push(Either.left(invalid));
                    return false;
                }
            }
        }(expected[0]!.getContent());
    }

    /** @internal Java: protected */
    public abstract unclosedBrackets(closed: SaverBase.BracketAndNodes<EXPRESSION, SAVER, BRACKET_CONTENT, EXPRESSION>): SaverBase.BracketAndNodes<EXPRESSION, SAVER, BRACKET_CONTENT, EXPRESSION>;

    public getErrors(): EditorLocationAndErrorRecorder.ErrorDetails[]
    {
        return this.locationRecorder.getErrors();
    }
}

export namespace SaverBase
{
    // Java: an interface with one generic method; only called if the list is valid (one more expression than operators, strictly interleaved
    export type MakeNary<EXPRESSION extends StyledShowable, SAVER, OP, BRACKET_CONTENT> = <R extends StyledShowable>(expressions: readonly EXPRESSION[], operators: readonly Pair<OP, CanonicalSpan>[], bracketedStatus: BracketAndNodes<EXPRESSION, SAVER, BRACKET_CONTENT, R>, locationRecorder: EditorLocationAndErrorRecorder) => R | null;

    // Only called if the list is valid (one more expression than operators, strictly interleaved)
    export type MakeNarySimple<EXPRESSION extends StyledShowable, OP> = (expressions: readonly EXPRESSION[], operators: readonly Pair<OP, CanonicalSpan>[]) => EXPRESSION | null;

    export type MakeBinary<EXPRESSION extends StyledShowable, SAVER, BRACKET_CONTENT> = <R extends StyledShowable>(lhs: EXPRESSION, opNode: CanonicalSpan, rhs: EXPRESSION, bracketedStatus: BracketAndNodes<EXPRESSION, SAVER, BRACKET_CONTENT, R>, locationRecorder: EditorLocationAndErrorRecorder) => R;

    export type MakeBinarySimple<EXPRESSION extends StyledShowable> = (lhs: EXPRESSION, opNode: CanonicalSpan, rhs: EXPRESSION) => EXPRESSION;

    // One set of operators that can be used to make a particular expression
    export class OperatorExpressionInfo<EXPRESSION extends StyledShowable, SAVER, OP extends ExpressionToken, BRACKET_CONTENT>
    {
        public readonly operators: readonly OP[];
        public readonly makeExpression: Either<MakeNary<EXPRESSION, SAVER, OP, BRACKET_CONTENT>, MakeBinary<EXPRESSION, SAVER, BRACKET_CONTENT>>;

        protected constructor(operators: readonly OP[], makeExpression: Either<MakeNary<EXPRESSION, SAVER, OP, BRACKET_CONTENT>, MakeBinary<EXPRESSION, SAVER, BRACKET_CONTENT>>)
        {
            this.operators = operators;
            this.makeExpression = makeExpression;
        }

        /** Java: OperatorExpressionInfo(ImmutableList<OP> operators, MakeNary makeExpression) */
        public static nary<EXPRESSION extends StyledShowable, SAVER, OP extends ExpressionToken, BRACKET_CONTENT>(operators: readonly OP[], makeExpression: MakeNary<EXPRESSION, SAVER, OP, BRACKET_CONTENT>): OperatorExpressionInfo<EXPRESSION, SAVER, OP, BRACKET_CONTENT>
        {
            return new OperatorExpressionInfo<EXPRESSION, SAVER, OP, BRACKET_CONTENT>(operators, Either.left(makeExpression));
        }

        /** Java: OperatorExpressionInfo(ImmutableList<OP> operators, MakeNarySimple makeExpression) */
        public static narySimple<EXPRESSION extends StyledShowable, SAVER, OP extends ExpressionToken, BRACKET_CONTENT>(saver: SaverBase<EXPRESSION, SAVER, OP, ExpressionToken, BRACKET_CONTENT>, operators: readonly OP[], makeExpression: MakeNarySimple<EXPRESSION, OP>): OperatorExpressionInfo<EXPRESSION, SAVER, OP, BRACKET_CONTENT>
        {
            return new OperatorExpressionInfo<EXPRESSION, SAVER, OP, BRACKET_CONTENT>(operators, Either.left(<R extends StyledShowable>(expressions: readonly EXPRESSION[], operators: readonly Pair<OP, CanonicalSpan>[], bracketAndNodes: BracketAndNodes<EXPRESSION, SAVER, BRACKET_CONTENT, R>, _locationRecorder: EditorLocationAndErrorRecorder): R | null =>
            {
                const expression = makeExpression(expressions, operators);
                if (expression === null)
                    return null;
                else
                    return bracketAndNodes.applyBrackets.applySingle(saver.record(bracketAndNodes.location, expression));
            }));
        }

        // I know it's a bit odd, but we distinguish the N-ary constructor from the binary constructor by
        // making the operators a non-list here.  The only expression with multiple operators
        // is add-subtract, which is N-ary.  And you can't have a binary expression with multiple different operators...
        /** Java: the protected OperatorExpressionInfo(OP operator, MakeBinarySimple makeExpression) */
        public static binary<EXPRESSION extends StyledShowable, SAVER, OP extends ExpressionToken, BRACKET_CONTENT>(operator: OP, makeExpression: MakeBinarySimple<EXPRESSION>): OperatorExpressionInfo<EXPRESSION, SAVER, OP, BRACKET_CONTENT>
        {
            return new OperatorExpressionInfo<EXPRESSION, SAVER, OP, BRACKET_CONTENT>([operator], Either.right(<R extends StyledShowable>(lhs: EXPRESSION, opNode: CanonicalSpan, rhs: EXPRESSION, bracketedStatus: BracketAndNodes<EXPRESSION, SAVER, BRACKET_CONTENT, R>, locationRecorder: EditorLocationAndErrorRecorder): R =>
            {
                const unrecorded = makeExpression(lhs, opNode, rhs);
                const recorded = locationRecorder.record(new CanonicalSpan(locationRecorder.recorderFor(lhs).start, locationRecorder.recorderFor(rhs).end), unrecorded);
                return bracketedStatus.applyBrackets.applySingle(recorded);
            }));
        }

        public includes(op: OP): boolean
        {
            return this.operators.includes(op);
        }

        public makeOperatorSection(locationRecorder: EditorLocationAndErrorRecorder, operatorSetPrecedence: number, initialOperator: OpAndNode<OP>, initialIndex: number): OperatorSection<EXPRESSION, SAVER, OP, BRACKET_CONTENT>
        {
            return this.makeExpression.either<OperatorSection<EXPRESSION, SAVER, OP, BRACKET_CONTENT>>(
                nAry => new NaryOperatorSection(locationRecorder, this.operators, operatorSetPrecedence, nAry, initialIndex, initialOperator),
                binary => new BinaryOperatorSection(locationRecorder, this.operators, operatorSetPrecedence, binary, initialIndex, initialOperator)
            );
        }
    }

    export abstract class OperatorSection<EXPRESSION extends StyledShowable, SAVER, OP, BRACKET_CONTENT>
    {
        protected readonly locationRecorder: EditorLocationAndErrorRecorder;
        public readonly possibleOperators: readonly OP[];
        // The ordering in the candidates list:
        public readonly operatorSetPrecedence: number;

        protected constructor(locationRecorder: EditorLocationAndErrorRecorder, possibleOperators: readonly OP[], operatorSetPrecedence: number)
        {
            this.locationRecorder = locationRecorder;
            this.possibleOperators = possibleOperators;
            this.operatorSetPrecedence = operatorSetPrecedence;
        }

        /**
         * Attempts to add the operator to this section.  If it can be added, it is added, and true is returned.
         * If it can't be added, nothing is changed, and false is returned.
         */
        public abstract addOperator(operator: OpAndNode<OP>, indexOfOperator: number): boolean;

        /**
         * Given the operators already added, makes an expression.  Will only use the indexes that pertain
         * to the operators that got added, you should pass the entire list of the expression args.
         */
        public abstract makeExpression<R extends StyledShowable>(expressions: readonly EXPRESSION[], brackets: BracketAndNodes<EXPRESSION, SAVER, BRACKET_CONTENT, R>): R | null;

        public abstract getFirstOperandIndex(): number;

        public abstract getLastOperandIndex(): number;

        public abstract makeExpressionReplaceLHS<R extends StyledShowable>(lhs: EXPRESSION, allOriginalExps: readonly EXPRESSION[], brackets: BracketAndNodes<EXPRESSION, SAVER, BRACKET_CONTENT, R>): R | null;
        public abstract makeExpressionReplaceRHS<R extends StyledShowable>(rhs: EXPRESSION, allOriginalExps: readonly EXPRESSION[], brackets: BracketAndNodes<EXPRESSION, SAVER, BRACKET_CONTENT, R>): R | null;
    }

    export class BinaryOperatorSection<EXPRESSION extends StyledShowable, SAVER, OP, BRACKET_CONTENT> extends OperatorSection<EXPRESSION, SAVER, OP, BRACKET_CONTENT>
    {
        protected readonly makeExpressionFn: MakeBinary<EXPRESSION, SAVER, BRACKET_CONTENT>;
        private readonly operatorIndex: number;
        private readonly operator: OpAndNode<OP>;

        public constructor(locationRecorder: EditorLocationAndErrorRecorder, operators: readonly OP[], candidatePrecedence: number, makeExpression: MakeBinary<EXPRESSION, SAVER, BRACKET_CONTENT>, initialIndex: number, operator: OpAndNode<OP>)
        {
            super(locationRecorder, operators, candidatePrecedence);
            this.makeExpressionFn = makeExpression;
            this.operatorIndex = initialIndex;
            this.operator = operator;
        }

        public override addOperator(_operator: OpAndNode<OP>, _indexOfOperator: number): boolean
        {
            // Can never add another operator to a binary operator:
            return false;
        }

        public override makeExpression<R extends StyledShowable>(expressions: readonly EXPRESSION[], brackets: BracketAndNodes<EXPRESSION, SAVER, BRACKET_CONTENT, R>): R
        {
            return this.makeBinary(expressions[this.operatorIndex]!, this.operator.sourceNode, expressions[this.operatorIndex + 1]!, brackets, this.locationRecorder);
        }

        protected makeBinary<R extends StyledShowable>(lhs: EXPRESSION, opNode: CanonicalSpan, rhs: EXPRESSION, brackets: BracketAndNodes<EXPRESSION, SAVER, BRACKET_CONTENT, R>, locationRecorder: EditorLocationAndErrorRecorder): R
        {
            return this.makeExpressionFn<R>(lhs, opNode, rhs, brackets, locationRecorder);
        }

        public override getFirstOperandIndex(): number
        {
            return this.operatorIndex;
        }

        public override getLastOperandIndex(): number
        {
            return this.operatorIndex + 1;
        }

        public override makeExpressionReplaceLHS<R extends StyledShowable>(lhs: EXPRESSION, expressions: readonly EXPRESSION[], brackets: BracketAndNodes<EXPRESSION, SAVER, BRACKET_CONTENT, R>): R
        {
            return this.makeBinary(lhs, this.operator.sourceNode, expressions[this.operatorIndex + 1]!, brackets, this.locationRecorder);
        }

        public override makeExpressionReplaceRHS<R extends StyledShowable>(rhs: EXPRESSION, expressions: readonly EXPRESSION[], brackets: BracketAndNodes<EXPRESSION, SAVER, BRACKET_CONTENT, R>): R
        {
            return this.makeBinary(expressions[this.operatorIndex]!, this.operator.sourceNode, rhs, brackets, this.locationRecorder);
        }
    }

    export class NaryOperatorSection<EXPRESSION extends StyledShowable, SAVER, OP, BRACKET_CONTENT> extends OperatorSection<EXPRESSION, SAVER, OP, BRACKET_CONTENT>
    {
        protected readonly makeExpressionFn: MakeNary<EXPRESSION, SAVER, OP, BRACKET_CONTENT>;
        private readonly actualOperators: Pair<OP, CanonicalSpan>[] = [];
        private readonly startingOperatorIndexIncl: number;
        private endingOperatorIndexIncl: number;

        public constructor(locationRecorder: EditorLocationAndErrorRecorder, operators: readonly OP[], candidatePrecedence: number, makeExpression: MakeNary<EXPRESSION, SAVER, OP, BRACKET_CONTENT>, initialIndex: number, initialOperator: OpAndNode<OP>)
        {
            super(locationRecorder, operators, candidatePrecedence);
            this.makeExpressionFn = makeExpression;
            this.startingOperatorIndexIncl = initialIndex;
            this.endingOperatorIndexIncl = initialIndex;
            this.actualOperators.push(new Pair(initialOperator.op, initialOperator.sourceNode));
        }

        public override addOperator(operator: OpAndNode<OP>, indexOfOperator: number): boolean
        {
            if (this.possibleOperators.includes(operator.op) && indexOfOperator === this.endingOperatorIndexIncl + 1)
            {
                this.endingOperatorIndexIncl = indexOfOperator;
                this.actualOperators.push(new Pair(operator.op, operator.sourceNode));
                return true;
            }
            else
            {
                return false;
            }
        }

        public override makeExpression<R extends StyledShowable>(expressions: readonly EXPRESSION[], brackets: BracketAndNodes<EXPRESSION, SAVER, BRACKET_CONTENT, R>): R | null
        {
            // Given a + b + c, if end operator is 1, we want to include operand index 2, hence we pass excl index 3,
            // so it's last operator-inclusive, plus 2.
            const selected = expressions.slice(this.startingOperatorIndexIncl, this.endingOperatorIndexIncl + 2);
            return this.makeNary(selected, this.actualOperators, brackets);
        }

        public override getFirstOperandIndex(): number
        {
            return this.startingOperatorIndexIncl;
        }

        public override getLastOperandIndex(): number
        {
            return this.endingOperatorIndexIncl + 1;
        }

        public override makeExpressionReplaceLHS<R extends StyledShowable>(lhs: EXPRESSION, expressions: readonly EXPRESSION[], brackets: BracketAndNodes<EXPRESSION, SAVER, BRACKET_CONTENT, R>): R | null
        {
            const args = expressions.slice(this.startingOperatorIndexIncl, this.endingOperatorIndexIncl + 2);
            args[0] = lhs;
            return this.makeNary(args, this.actualOperators, brackets);
        }

        public override makeExpressionReplaceRHS<R extends StyledShowable>(rhs: EXPRESSION, expressions: readonly EXPRESSION[], brackets: BracketAndNodes<EXPRESSION, SAVER, BRACKET_CONTENT, R>): R | null
        {
            const args = expressions.slice(this.startingOperatorIndexIncl, this.endingOperatorIndexIncl + 2);
            args[args.length - 1] = rhs;
            return this.makeNary(args, this.actualOperators, brackets);
        }

        /**
         * Uses this expression as the LHS, and a custom middle and RHS that must have matching operators.  Used
         * to join two NaryOpExpressions while bracketing an item in the middle.
         */
        public makeExpressionMiddleMerge<R extends StyledShowable>(middle: EXPRESSION, rhs: NaryOperatorSection<EXPRESSION, SAVER, OP, BRACKET_CONTENT>, expressions: readonly EXPRESSION[], brackets: BracketAndNodes<EXPRESSION, SAVER, BRACKET_CONTENT, R>): R | null
        {
            const args: EXPRESSION[] = [];
            // Add our args, minus the end one:
            args.push(...expressions.slice(this.startingOperatorIndexIncl, this.endingOperatorIndexIncl + 1));
            // Add the middle:
            args.push(middle);
            // Add RHS, minus the start one:
            args.push(...expressions.slice(rhs.startingOperatorIndexIncl + 1, rhs.endingOperatorIndexIncl + 2));
            return this.makeExpressionFn(args, Utility.concatI(this.actualOperators, rhs.actualOperators), brackets, this.locationRecorder);
        }

        protected makeNary<R extends StyledShowable>(expressions: readonly EXPRESSION[], operators: readonly Pair<OP, CanonicalSpan>[], bracketedStatus: BracketAndNodes<EXPRESSION, SAVER, BRACKET_CONTENT, R>): R | null
        {
            return this.makeExpressionFn(expressions, operators, bracketedStatus, this.locationRecorder);
        }
    }

    /**
     * A function to give back the content of a scope being ended.
     *
     * Java: an interface with one generic method, fetchContent(bracketInfo), which gives the
     * expression for the scope being ended, given the bracket context for it.
     */
    export type FetchContent<EXPRESSION, SAVER, BRACKET_CONTENT> = <R extends StyledShowable>(bracketInfo: BracketAndNodes<EXPRESSION, SAVER, BRACKET_CONTENT, R>) => R;

    /**
     * A lamba-interface like class with a method to call when you encounter
     * a keyword that should terminate the current scope.
     *
     * Cannot be an interface because it's not static because
     * it uses many type variables from the outer SaverBase.
     */
    export abstract class Terminator<EXPRESSION, SAVER, KEYWORD, BRACKET_CONTENT>
    {
        public readonly terminatorDescription: string;

        public constructor(terminatorDescription: string)
        {
            this.terminatorDescription = terminatorDescription;
        }

        /**
         *
         * @param makeContent A function which, given a BracketedStatus wrapped with error displayers,
         *                    will give you the expression content of the just-finished scope.
         * @param terminator The keyword which is terminating the current scope.
         * @param keywordErrorDisplayer The error displayer for the keyword.
         * @return true if the keyword matched and was consumed (always true if forceConsume was true), false if it didn't match and wasn't saved.
         */
        public abstract terminate(makeContent: FetchContent<EXPRESSION, SAVER, BRACKET_CONTENT>, terminator: KEYWORD | null, keywordErrorDisplayer: CanonicalSpan): boolean;
    }

    // Op is typically an enum so we can't identity-hash-map it to a node, hence this wrapper
    export class OpAndNode<OP>
    {
        public readonly op: OP;
        public readonly sourceNode: CanonicalSpan;

        public constructor(op: OP, sourceNode: CanonicalSpan)
        {
            this.op = op;
            this.sourceNode = sourceNode;
        }
    }

    export class Scope<EXPRESSION, OP, KEYWORD, BRACKET_CONTENT>
    {
        public readonly items: Either<EXPRESSION, OpAndNode<OP>>[];
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        public readonly terminator: Terminator<EXPRESSION, any, KEYWORD, BRACKET_CONTENT>;
        public readonly openingNode: CanonicalSpan;

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        public constructor(openingNode: CanonicalSpan, terminator: Terminator<EXPRESSION, any, KEYWORD, BRACKET_CONTENT>)
        {
            this.items = [];
            this.terminator = terminator;
            this.openingNode = openingNode;
        }
    }

    /**
     * BracketedStatus, paired with start and end for error recording purposes only.
     * @param <EXPRESSION>
     * @param <SAVER>
     */
    export class BracketAndNodes<EXPRESSION, SAVER, BRACKET_CONTENT, RESULT>
    {
        public readonly applyBrackets: ApplyBrackets<BRACKET_CONTENT, EXPRESSION, RESULT>;
        public readonly location: CanonicalSpan;
        private readonly alternateBracketsList: readonly ApplyBrackets<BRACKET_CONTENT, EXPRESSION, RESULT>[];

        public constructor(applyBrackets: ApplyBrackets<BRACKET_CONTENT, EXPRESSION, RESULT>, location: CanonicalSpan, alternateBrackets: readonly ApplyBrackets<BRACKET_CONTENT, EXPRESSION, RESULT>[])
        {
            this.applyBrackets = applyBrackets;
            this.location = location;
            this.alternateBracketsList = alternateBrackets;
        }

        public alternateBrackets(): BracketAndNodes<EXPRESSION, SAVER, BRACKET_CONTENT, RESULT>[]
        {
            return Utility.mapListI(this.alternateBracketsList, apply => new BracketAndNodes<EXPRESSION, SAVER, BRACKET_CONTENT, RESULT>(apply, this.location, []));
        }

        /** @internal TS-only: Java's alternateBrackets field, for subclasses' use */
        public _getAlternateBracketsList(): readonly ApplyBrackets<BRACKET_CONTENT, EXPRESSION, RESULT>[]
        {
            return this.alternateBracketsList;
        }
    }

    export interface ApplyBrackets<BRACKET_CONTENT, EXPRESSION, RESULT>
    {
        // Return null if that content with these brackets is invalid
        apply(items: BRACKET_CONTENT): RESULT | null;

        applySingle(singleItem: EXPRESSION): RESULT;
    }

    class InvalidReason
    {
        /** @internal */ public readonly location: CanonicalSpan;
        /** @internal */ public readonly error: StyledString;
        /** @internal */ public readonly fixes: readonly TextQuickFix[];

        public constructor(location: CanonicalSpan, error: StyledString, fixes: readonly TextQuickFix[])
        {
            this.location = location;
            this.error = error;
            this.fixes = fixes;
        }
    }

    export class CollectedItems<EXPRESSION extends StyledShowable, SAVER, OP extends ExpressionToken, KEYWORD extends ExpressionToken, BRACKET_CONTENT>
    {
        // This is like a boolean; empty means valid, non-empty means invalid
        // because of those errors.
        private readonly invalidReasons: InvalidReason[];
        private readonly invalid: Either<OpAndNode<OP>, EXPRESSION>[];
        private readonly validOperands: EXPRESSION[];
        private readonly validOperators: OpAndNode<OP>[];
        private readonly saver: SaverBase<EXPRESSION, SAVER, OP, KEYWORD, BRACKET_CONTENT>;

        public isValid(): boolean
        {
            return this.invalidReasons.length === 0;
        }

        public makeInvalid(location: CanonicalSpan, makeInvalid: (items: readonly EXPRESSION[]) => EXPRESSION): EXPRESSION
        {
            const expression = this.saver.record(location, makeInvalid(
                    Utility.mapListI(this.invalid, et => et.either<EXPRESSION>(o => this.saver.record(o.sourceNode, this.saver.opToInvalid(o.op)), x => x))
            ));
            for (const invalidReason of this.invalidReasons)
            {
                this.saver.locationRecorder.addErrorAndFixes(invalidReason.location, invalidReason.error, invalidReason.fixes);
            }
            return expression;
        }

        public getValidOperands(): EXPRESSION[]
        {
            return this.validOperands;
        }

        public getValidOperators(): OpAndNode<OP>[]
        {
            return this.validOperators;
        }

        /** @internal Java: private, made by SaverBase.processItems */
        public constructor(saver: SaverBase<EXPRESSION, SAVER, OP, KEYWORD, BRACKET_CONTENT>, originalContent: readonly Either<EXPRESSION, OpAndNode<OP>>[])
        {
            this.saver = saver;
            // Take a copy because we may modify it while processing unary operators:
            const content: Either<EXPRESSION, OpAndNode<OP>>[] = [...originalContent];

            // Although it's duplication, we keep a list for if it turns out invalid, and two lists for if it is valid:
            // Valid means that operands interleave exactly with operators, and there is an operand at beginning and end.
            this.invalidReasons = [];
            this.invalid = [];
            this.validOperands = [];
            this.validOperators = [];

            // (Java: a SimpleBooleanProperty and a SimpleObjectProperty, as the lambdas below change them)
            const lastWasOperand = { value: false }; // Think of it as an invisible empty prefix operator
            const lastNodeSpan: { value: CanonicalSpan | null } = { value: null };

            for (let i = 0; i < content.length; i++)
            {
                const item = content[i]!;
                const iFinal = i;

                item.either_(expression =>
                {
                    this.invalid.push(Either.right(expression));
                    this.validOperands.push(expression);

                    if (lastWasOperand.value && iFinal > 0)
                    {
                        const last = lastNodeSpan.value;
                        const start = last !== null ? last : saver.recorderFor(expression).lhs();
                        this.invalidReasons.push(new InvalidReason(CanonicalSpan.fromTo(start.rhs(), saver.recorderFor(expression).lhs()), StyledString.s("Missing operator"), saver.fixesForAdjacentOperands(this.validOperands[this.validOperands.length - 2]!, expression)));
                    }
                    lastWasOperand.value = true;
                    lastNodeSpan.value = saver.recorderFor(expression);
                }, op =>
                {
                    this.invalid.push(Either.left(op));
                    this.validOperators.push(op);

                    // There are two ways a unary operator can be valid as unary.
                    // One is that it's at the beginning of a group,
                    // the other is that it follows exactly one other operator

                    const canBeUnary: (() => EXPRESSION) | null = iFinal + 1 >= content.length ? null :
                            content[iFinal + 1]!.either<(() => EXPRESSION) | null>((next: EXPRESSION) => saver.canBeUnary(op, next), _anotherOp => null);

                    if (!lastWasOperand.value)
                    {
                        if (canBeUnary !== null)
                        {
                            // Scrap us, and modify next operand with the unary operator:
                            this.invalid.pop();
                            this.validOperators.pop();
                            content[iFinal + 1] = Either.left(canBeUnary());
                        }
                        else
                        {
                            const last = lastNodeSpan.value;
                            const start = last !== null ? last : op.sourceNode;
                            this.invalidReasons.push(new InvalidReason(CanonicalSpan.fromTo(start.rhs(), op.sourceNode.lhs()), StyledString.s("Missing item between operators"), []));
                        }
                    }
                    lastWasOperand.value = false;
                    lastNodeSpan.value = op.sourceNode;
                });
            }

            // Must end with operand:
            const last = lastNodeSpan.value;
            if (!lastWasOperand.value && last !== null)
            {
                this.invalidReasons.push(new InvalidReason(last.rhs(), StyledString.s("Missing item after operator."), []));
            }
        }
    }
}
