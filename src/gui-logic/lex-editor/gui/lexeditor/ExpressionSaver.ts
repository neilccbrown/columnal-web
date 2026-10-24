// Port of xyz.columnal.gui.lexeditor.ExpressionSaver (lex-editor module).
//
// PORT-NOTE: Java's inner classes (BracketContent, the Choice classes for @match, FunctionParamThen,
// DefineThen and KeyValueExpression) are module-level classes here, given the saver where they
// need it.  The streams of suppliers that Java passes around for invalid prefixes are arrays.
import type { CanonicalLocation, ExpressionIdentifier } from "../../../../engine/anns/Annotations.js";
import { BracketedStatus } from "../../../../engine/expressions/transformations/expression/BracketedStatus.js";
import { CanonicalSpan } from "../../../../engine/expressions/transformations/expression/CanonicalSpan.js";
import type { ErrorAndTypeRecorder } from "../../../../engine/expressions/transformations/expression/ErrorAndTypeRecorder.js";
import type { EvaluateState } from "../../../../engine/expressions/transformations/expression/EvaluateState.js";
import { AddSubtractExpression, AndExpression, ArrayExpression, CallExpression, ComparisonExpression, DefineExpression, DivideExpression, EqualExpression, Expression, FieldAccessExpression, HasTypeExpression, IdentExpression, IfThenElseExpression, ImplicitLambdaArg, InvalidIdentExpression, InvalidOperatorExpression, LambdaExpression, MatchExpression, NotEqualExpression, NumericLiteral, OrExpression, PlusMinusPatternExpression, RaiseExpression, RecordExpression, StringConcatExpression, TimesExpression, UnitLiteralExpression } from "../../../../engine/expressions/transformations/expression/Expressions.js";
import { ExpressionUtil } from "../../../../engine/expressions/transformations/expression/ExpressionUtil.js";
import type { FunctionLookup } from "../../../../engine/expressions/transformations/expression/function/FunctionLookup.js";
import { QuickFix } from "../../../../engine/expressions/transformations/expression/QuickFix.js";
import type { TypeState } from "../../../../engine/expressions/transformations/expression/TypeState.js";
import { ExpressionVisitorFlat } from "../../../../engine/expressions/transformations/expression/visitor/ExpressionVisitorFlat.js";
import type { ExpressionVisitor } from "../../../../engine/expressions/transformations/expression/visitor/ExpressionVisitor.js";
import { ExpressionVisitorStream } from "../../../../engine/expressions/transformations/expression/visitor/ExpressionVisitorStream.js";
import type { TableAndColumnRenames } from "../../../../engine/identifiers/id/TableAndColumnRenames.js";
import type { JavaRandom } from "../../../../engine/java/JavaRandom.js";
import type { TypeManager } from "../../../../engine/types/data/datatype/TypeManager.js";
import type { UnitManager } from "../../../../engine/types/data/unit/UnitManager.js";
import { Either } from "../../../../engine/utility-adt/utility/adt/Either.js";
import { Pair } from "../../../../engine/utility-adt/utility/adt/Pair.js";
import { InternalException } from "../../../../engine/utility-error/error/InternalException.js";
import type { StyledShowable } from "../../../../engine/utility-error/styled/StyledShowable.js";
import { StyledCSS } from "../../../../engine/utility-error/styled/StyledCSS.js";
import { StyledString } from "../../../../engine/utility-error/styled/StyledString.js";
import { Log } from "../../../../engine/utility/log/Log.js";
import { Utility } from "../../../../engine/utility/utility/Utility.js";
import type { InsertListener } from "../../../lex-editor-completion/gui/lexeditor/completion/InsertListener.js";
import { Clickable } from "../../../utility-gui/utility/gui/Clickable.js";
import { DocWindow } from "./DocWindow.js";
import type { EditorLocationAndErrorRecorder } from "./EditorLocationAndErrorRecorder.js";
import { ExpressionLexer } from "./ExpressionLexer.js";
import { SaverBase } from "./SaverBase.js";
import { TextQuickFix } from "./TextQuickFix.js";
import type { TopLevelEditor } from "./TopLevelEditor.js";

type Op = ExpressionLexer.Op;
type Keyword = ExpressionLexer.Keyword;
type BracketContent = ExpressionSaver.BracketContent;
type Terminator = SaverBase.Terminator<Expression, ExpressionSaver, Keyword, BracketContent>;
type OpAndNode = SaverBase.OpAndNode<Op>;
type OperatorExpressionInfo = SaverBase.OperatorExpressionInfo<Expression, ExpressionSaver, Op, BracketContent>;

export class ExpressionSaver extends SaverBase<Expression, ExpressionSaver, Op, Keyword, BracketContent>
{
    private readonly functionLookup: FunctionLookup;

    public constructor(typeManager: TypeManager, functionLookup: FunctionLookup, insertListener: InsertListener)
    {
        super(typeManager, insertListener);
        this.functionLookup = functionLookup;
    }

    public override expectSingle(locationRecorder: EditorLocationAndErrorRecorder, location: CanonicalSpan): SaverBase.BracketAndNodes<Expression, ExpressionSaver, BracketContent, Expression>
    {
        return new SaverBase.BracketAndNodes<Expression, ExpressionSaver, BracketContent, Expression>({
            apply(items: BracketContent): Expression | null
            {
                if (items.expressions.length === 1)
                    return items.expressions[0]!;
                else
                    return null;
            },

            applySingle(singleItem: Expression): Expression
            {
                return singleItem;
            },
        }, location, [this.tupleBracket(locationRecorder, location), this.makeList(locationRecorder, location)]);
    }

    private makeList(locationRecorder: EditorLocationAndErrorRecorder, location: CanonicalSpan): SaverBase.ApplyBrackets<BracketContent, Expression, Expression>
    {
        return {
            apply(items: BracketContent): Expression | null
            {
                return locationRecorder.record<Expression>(location, new ArrayExpression(items.expressions));
            },

            applySingle(singleItem: Expression): Expression
            {
                return locationRecorder.record<Expression>(location, new ArrayExpression([singleItem]));
            },
        };
    }

    // Note: if we are copying to clipboard, callback will not be called
    public saveKeyword(keyword: Keyword, errorDisplayer: CanonicalSpan): void
    {
        const Keyword = ExpressionLexer.Keyword;
        const prefixKeyword = (): readonly Expression[] => [this.record<Expression>(errorDisplayer, new InvalidIdentExpression(keyword.getContent()))];

        if (keyword === Keyword.QUEST)
        {
            this.saveOperand(new ImplicitLambdaArg(), errorDisplayer);
        }
        else if (keyword === Keyword.OPEN_ROUND)
        {
            let invalidPrefix = prefixKeyword;
            let applyBrackets = (c: CanonicalSpan): SaverBase.ApplyBrackets<BracketContent, Expression, Expression> => this.tupleBracket(this.locationRecorder, CanonicalSpan.fromTo(errorDisplayer, c));
            const precedingItems = this.peekScope().items;
            // Function calls are a special case:
            if (precedingItems.length >= 1 && precedingItems[precedingItems.length - 1]!.either(e => ExpressionUtil.isCallTarget(e), _op => false))
            {
                const callTarget = precedingItems.pop()!.either<Expression | null>(e => e, _op => null);
                // Shouldn't ever be null:
                if (callTarget !== null)
                {
                    const locationRecorder = this.locationRecorder;
                    applyBrackets = (c: CanonicalSpan): SaverBase.ApplyBrackets<BracketContent, Expression, Expression> =>
                    {
                        const makeParamPrompt = (functionName: string, paramNames: readonly string[], paramIndex: number, docURL: string, _span: CanonicalSpan): (toRightOf: unknown) => StyledString =>
                        {
                            const r = new StyledString.Builder();
                            r.append(functionName).append("(");
                            for (let i = 0; i < paramNames.length; i++)
                            {
                                if (i > 0)
                                    r.append(", ");
                                if (i === paramIndex)
                                {
                                    r.append(StyledString.styled(paramNames[i]!, new StyledCSS("entry-prompt-bold")));
                                }
                                else
                                {
                                    r.append(paramNames[i]!);
                                }
                            }
                            r.append(")");
                            return toRightOf => StyledString.concat(r.build().withStyle(new StyledCSS("entry-prompt")), StyledString.s("  "), StyledString.s("show doc").withStyle(new class extends Clickable
                            {
                                protected override onClick(_mouseButton: string, _screenPoint: { x: number, y: number }): void
                                {
                                    try
                                    {
                                        DocWindow.show(functionName + " function", docURL, toRightOf, locationRecorder.getInsertListener(), null);
                                    }
                                    catch (e)
                                    {
                                        if (!(e instanceof InternalException))
                                            throw e;
                                        Log.log(e);
                                    }
                                }
                            }(null, "show-doc-link") as Clickable));
                        };
                        const apply = (args: BracketContent): Expression =>
                        {
                            const span = CanonicalSpan.fromTo(locationRecorder.recorderFor(callTarget), c);

                            if (callTarget instanceof IdentExpression)
                            {
                                const func = callTarget.getFunctionDefinition();
                                if (func !== null)
                                {
                                    const paramNames = func.getParamNames();
                                    const funcDocURL = ExpressionLexer.makeFuncDocURL(func);
                                    if (args.expressions.length === 0)
                                    {
                                        // No params yet, need to add in the empty bit between brackets
                                        locationRecorder.recordEntryPrompt(c, makeParamPrompt(func.getName(), paramNames, 0, funcDocURL, span));
                                    }
                                    else
                                    {
                                        for (let i = 0; i < args.expressions.length && i < paramNames.length; i++)
                                        {
                                            locationRecorder.recordEntryPrompt(args.expressions[i]!, makeParamPrompt(func.getName(), paramNames, i, funcDocURL, span));
                                        }
                                    }
                                }
                            }

                            return locationRecorder.record<Expression>(span, new CallExpression(callTarget, args.expressions));
                        };
                        return {
                            apply,

                            applySingle(singleItem: Expression): Expression
                            {
                                return apply(new ExpressionSaver.BracketContent([singleItem], []));
                            },
                        };
                    };
                    invalidPrefix = () =>
                    {
                        return Utility.prependToList(callTarget, prefixKeyword());
                    };
                }
            }
            const applyBracketsFinal = applyBrackets;
            this.currentScopes.push(new SaverBase.Scope<Expression, Op, Keyword, BracketContent>(errorDisplayer, this.expect([Keyword.CLOSE_ROUND], close => new SaverBase.BracketAndNodes<Expression, ExpressionSaver, BracketContent, Expression>(applyBracketsFinal(close), CanonicalSpan.fromTo(errorDisplayer, close), []), (bracketed, _bracketEnd) =>
            {
                return Either.left<Expression, Terminator>(bracketed);
            }, invalidPrefix, null, true)));
        }
        else if (keyword === Keyword.OPEN_SQUARE)
        {
            this.currentScopes.push(new SaverBase.Scope<Expression, Op, Keyword, BracketContent>(errorDisplayer,
                this.expect([Keyword.CLOSE_SQUARE],
                    close => new SaverBase.BracketAndNodes<Expression, ExpressionSaver, BracketContent, Expression>(this.makeList(this.locationRecorder, CanonicalSpan.fromTo(errorDisplayer, close)), CanonicalSpan.fromTo(errorDisplayer, close), []),
                    (e, _c) => Either.left<Expression, Terminator>(e), prefixKeyword, null, true)));
        }
        else if (keyword === Keyword.IF)
        {
            const invalid: Expression[] = [];
            invalid.push(...prefixKeyword());
            const invalidBuild = (): readonly Expression[] => [...invalid];
            this.currentScopes.push(new SaverBase.Scope<Expression, Op, Keyword, BracketContent>(errorDisplayer, this.expect([Keyword.THEN, Keyword.ELSE, Keyword.ENDIF], this.miscBracketsFrom(errorDisplayer), (condition, conditionEnd) =>
            {
                invalid.push(condition);
                invalid.push(this.record<Expression>(conditionEnd, new InvalidIdentExpression(Keyword.THEN.getContent())));
                return Either.right<Expression, Terminator>(this.expect([Keyword.ELSE, Keyword.ENDIF], this.miscBracketsFrom(conditionEnd), (thenPart, thenEnd) =>
                {
                    invalid.push(thenPart);
                    invalid.push(this.record<Expression>(thenEnd, new InvalidIdentExpression(Keyword.ELSE.getContent())));
                    return Either.right<Expression, Terminator>(this.expect([Keyword.ENDIF], this.miscBracketsFrom(thenEnd), (elsePart, elseEnd) =>
                    {
                        const ifThenElseExpression = new IfThenElseExpression(errorDisplayer, condition, conditionEnd, thenPart, thenEnd, elsePart, elseEnd);
                        return Either.left<Expression, Terminator>(this.locationRecorder.record<Expression>(CanonicalSpan.fromTo(errorDisplayer, elseEnd), ifThenElseExpression));
                    }, invalidBuild, this.ifPrompt(2), false));
                }, invalidBuild, this.ifPrompt(1), false));
            }, invalidBuild, this.ifPrompt(0), false)));
        }
        else if (keyword === Keyword.MATCH)
        {
            this.currentScopes.push(new SaverBase.Scope<Expression, Op, Keyword, BracketContent>(errorDisplayer, this.expectOneOf(errorDisplayer, [new Case(this, errorDisplayer)], [() => this.record<Expression>(errorDisplayer, new InvalidIdentExpression(keyword.getContent()))])));
        }
        else if (keyword === Keyword.DEFINE)
        {
            this.currentScopes.push(new SaverBase.Scope<Expression, Op, Keyword, BracketContent>(errorDisplayer, new DefineThen(this, errorDisplayer)));
        }
        else if (keyword === Keyword.FUNCTION)
        {
            this.currentScopes.push(new SaverBase.Scope<Expression, Op, Keyword, BracketContent>(errorDisplayer, new FunctionParamThen(this, errorDisplayer)));
        }
        else
        {
            let consumed = false;
            // Will terminate because addTopLevelScope always returns true
            while (!consumed)
            {
                // Should be a terminator:
                const cur = this.currentScopes.pop()!;
                if (this.currentScopes.length === 0)
                {
                    this.addTopLevelScope();
                }
                consumed = cur.terminator.terminate(<R extends StyledShowable>(brackets: SaverBase.BracketAndNodes<Expression, ExpressionSaver, BracketContent, R>): R =>
                {
                    return this.makeExpression(cur.items, brackets, cur.openingNode.end, cur.terminator.terminatorDescription);
                }, keyword, errorDisplayer);
            }
        }
    }

    private ifPrompt(partToBold: number): StyledString
    {
        const Keyword = ExpressionLexer.Keyword;
        const parts: StyledString[] = [];
        parts.push(StyledString.s(" condition "));
        parts.push(StyledString.s(" value if true "));
        parts.push(StyledString.s(" value if false "));

        parts[partToBold] = parts[partToBold]!.withStyle(new StyledCSS("entry-prompt-bold"));
        return StyledString.concat(
            StyledString.s(Keyword.IF.getContent()),
            parts[0]!,
            StyledString.s(Keyword.THEN.getContent()),
            parts[1]!,
            StyledString.s(Keyword.ELSE.getContent()),
            parts[2]!,
            StyledString.s(Keyword.ENDIF.getContent())
        );
    }

    public override unclosedBrackets(closed: SaverBase.BracketAndNodes<Expression, ExpressionSaver, BracketContent, Expression>): SaverBase.BracketAndNodes<Expression, ExpressionSaver, BracketContent, Expression>
    {
        // eslint-disable-next-line @typescript-eslint/no-this-alias
        const saver = this;
        return new SaverBase.BracketAndNodes<Expression, ExpressionSaver, BracketContent, Expression>({
            apply(items: BracketContent): Expression | null
            {
                return saver.record<Expression>(closed.location, items.expressions.length === 1 ? items.expressions[0]! : new InvalidOperatorExpression(items.expressions));
            },

            applySingle(singleItem: Expression): Expression
            {
                return singleItem;
            },
        }, closed.location, [closed.applyBrackets]);
    }

    private tupleBracket(locationRecorder: EditorLocationAndErrorRecorder, location: CanonicalSpan): SaverBase.ApplyBrackets<BracketContent, Expression, Expression>
    {
        return {
            apply(items: BracketContent): Expression | null
            {
                if (items.expressions.length === 0)
                    return null;
                if (items.expressions.every(e => e instanceof KeyValueExpression))
                {
                    let allOk = true;
                    const pairs: Pair<ExpressionIdentifier, Expression>[] = [];
                    for (const expression of items.expressions)
                    {
                        const p = (expression as KeyValueExpression).extractPair();
                        if (p === null)
                        {
                            allOk = false;
                            break;
                        }
                        else
                            pairs.push(p);
                    }
                    if (allOk)
                        return locationRecorder.record<Expression>(location, new RecordExpression(pairs));
                }

                if (items.expressions.length === 1)
                    return items.expressions[0]!;
                else
                {
                    const invalidOps: Expression[] = [];
                    for (let i = 0; i < items.expressions.length; i++)
                    {
                        const expression = items.expressions[i]!;
                        if (expression instanceof KeyValueExpression)
                        {
                            const keyValueExpression = expression;
                            invalidOps.push(keyValueExpression.lhs, keyValueExpression.opAsExpression(locationRecorder), keyValueExpression.rhs);
                        }
                        else
                            invalidOps.push(expression);
                        if (i < items.commas.length)
                            invalidOps.push(locationRecorder.record(items.commas[i]!.getSecond(), new InvalidIdentExpression(items.commas[i]!.getFirst().getContent())));
                    }
                    return locationRecorder.record<Expression>(location, new InvalidOperatorExpression(invalidOps));
                }
            },

            applySingle(singleItem: Expression): Expression
            {
                return singleItem;
            },
        };
    }

    public override makeExpression<R extends StyledShowable>(content: readonly Either<Expression, OpAndNode>[], brackets: SaverBase.BracketAndNodes<Expression, ExpressionSaver, BracketContent, R>, innerContentLocation: CanonicalLocation, terminatorDescription: string | null): R
    {
        if (content.length === 0)
        {
            const bracketedEmpty = brackets.applyBrackets.apply(new ExpressionSaver.BracketContent([], []));
            if (bracketedEmpty !== null)
                return bracketedEmpty;
            else
            {
                if (terminatorDescription !== null)
                    this.locationRecorder.addErrorAndFixes(new CanonicalSpan(innerContentLocation, innerContentLocation), StyledString.s("Missing expression before " + terminatorDescription), []);
                return brackets.applyBrackets.applySingle(this.locationRecorder.record<Expression>(new CanonicalSpan(innerContentLocation, innerContentLocation), new InvalidOperatorExpression([])));
            }
        }
        const location = CanonicalSpan.fromTo(this.getLocationForEither(content[0]!), this.getLocationForEither(content[content.length - 1]!));

        const collectedItems = this.processItems(content);

        let e: R | null = null;
        if (collectedItems.isValid())
        {
            const validOperands = collectedItems.getValidOperands();
            const validOperators = collectedItems.getValidOperators();

            const beforePrevCommas: Expression[] = [];
            const prevCommas: OpAndNode[] = [];
            const sinceLastCommaOperands: Expression[] = [];
            const sinceLastCommaOperators: OpAndNode[] = [];
            // Split by commas
            for (let i = 0; i < validOperands.length; i++)
            {
                sinceLastCommaOperands.push(validOperands[i]!);
                if (i < validOperators.length && validOperators[i]!.op === ExpressionLexer.Op.COMMA)
                {
                    const unbracketed = this.unbracketed(sinceLastCommaOperands);
                    const made = this.makeExpressionWithOperators(this.OPERATORS, this.locationRecorder, (es: readonly Either<OpAndNode, Expression>[]) => this.makeInvalidOp(location, es), [...sinceLastCommaOperands], [...sinceLastCommaOperators], unbracketed);
                    if (made !== null)
                        beforePrevCommas.push(made);
                    else
                        beforePrevCommas.push(this.makeInvalidOp(unbracketed.location, this.interleave<OpAndNode>([...sinceLastCommaOperands], [...sinceLastCommaOperators])));
                    prevCommas.push(validOperators[i]!);
                    sinceLastCommaOperands.length = 0;
                    sinceLastCommaOperators.length = 0;
                }
                else if (i < validOperators.length)
                {
                    sinceLastCommaOperators.push(validOperators[i]!);
                }
            }

            // Now we need to check the operators can work together as one group:
            const unbracketed = this.unbracketed(sinceLastCommaOperands);
            const made = this.makeExpressionWithOperators(this.OPERATORS, this.locationRecorder, (es: readonly Either<OpAndNode, Expression>[]) => this.makeInvalidOp(location, es), [...sinceLastCommaOperands], [...sinceLastCommaOperators], unbracketed);
            if (made !== null)
                beforePrevCommas.push(made);
            else
                beforePrevCommas.push(this.makeInvalidOp(unbracketed.location, this.interleave<OpAndNode>([...sinceLastCommaOperands], [...sinceLastCommaOperators])));

            const bracketContent = new ExpressionSaver.BracketContent([...beforePrevCommas], Utility.mapListI(prevCommas, c => new Pair(c.op, c.sourceNode)));
            e = brackets.applyBrackets.apply(bracketContent);
            if (e === null)
            {
                const possibles: R[] = [];
                for (const alternateBracket of brackets.alternateBrackets())
                {
                    const possible = alternateBracket.applyBrackets.apply(bracketContent);
                    if (possible !== null)
                    {
                        possibles.push(possible);
                    }
                }
                if (possibles.length !== 0)
                {
                    const invalidOpExpression = brackets.applyBrackets.applySingle(collectedItems.makeInvalid(location, items => new InvalidOperatorExpression(items)));
                    this.locationRecorder.getRecorder().recordError(invalidOpExpression, StyledString.s("Surrounding brackets required"));
                    this.locationRecorder.getRecorder().recordQuickFixes<R>(invalidOpExpression, Utility.mapList(possibles, fixed => new QuickFix<R>("fix.bracketAs", invalidOpExpression, () => fixed)));
                    return invalidOpExpression;
                }
            }
        }

        if (e === null)
        {
            const invalid = collectedItems.makeInvalid(location, items => new InvalidOperatorExpression(items));
            e = brackets.applyBrackets.applySingle(invalid);
        }

        return e;
    }

    private unbracketed(operands: readonly Expression[]): SaverBase.BracketAndNodes<Expression, ExpressionSaver, BracketContent, Expression>
    {
        return new SaverBase.BracketAndNodes<Expression, ExpressionSaver, BracketContent, Expression>({
            apply(_items: BracketContent): Expression | null
            {
                return null;
            },

            applySingle(singleItem: Expression): Expression
            {
                return singleItem;
            },
        }, CanonicalSpan.fromTo(this.recorderFor(operands[0]!), this.recorderFor(operands[operands.length - 1]!)), []);
    }

    public override opToInvalid(op: Op): Expression
    {
        return new InvalidIdentExpression(op.getContent());
    }

    public override makeInvalidOp(location: CanonicalSpan, items: readonly Either<OpAndNode, Expression>[]): Expression
    {
        const invalidOperatorExpression = new InvalidOperatorExpression(Utility.mapListI(items, x => x.either<Expression>(op => this.locationRecorder.record(op.sourceNode, new InvalidIdentExpression(op.op.getContent())), y => y)));
        return this.locationRecorder.record<Expression>(location, invalidOperatorExpression);
    }

    // Java: keywordToInvalid(Keyword) and the private keywordToInvalid(Keyword, CanonicalSpan location)
    public override keywordToInvalid(keyword: Keyword): Expression;
    public override keywordToInvalid(keyword: Keyword, location: CanonicalSpan): Expression;
    public override keywordToInvalid(keyword: Keyword, location?: CanonicalSpan): Expression
    {
        if (location !== undefined)
            return this.locationRecorder.record(location, this.keywordToInvalid(keyword));
        return new InvalidIdentExpression(keyword.getContent());
    }

    /** @internal Java: private, used by the Then choice */
    public isEqualDefinition(expression: Expression): boolean
    {
        if (expression instanceof EqualExpression)
        {
            const equalExpression = expression;
            return equalExpression.getOperands().length === 2 && !equalExpression.lastIsPattern();
        }
        return false;
    }

    public expectOneOf(start: CanonicalSpan, choices: readonly Choice[], prefixIfInvalid: readonly (() => Expression)[]): Terminator
    {
        // eslint-disable-next-line @typescript-eslint/no-this-alias
        const saver = this;
        return new class extends SaverBase.Terminator<Expression, ExpressionSaver, Keyword, BracketContent>
        {
            public override terminate(makeContent: SaverBase.FetchContent<Expression, ExpressionSaver, BracketContent>, terminator: Keyword | null, keywordErrorDisplayer: CanonicalSpan): boolean
            {
                const brackets = saver.miscBrackets(CanonicalSpan.fromTo(start, keywordErrorDisplayer));

                for (const choice of choices)
                {
                    if (choice.keyword === terminator)
                    {
                        // All is well:
                        const expressionBefore: Expression = makeContent(brackets);
                        const result = choice.foundKeyword(expressionBefore, keywordErrorDisplayer, [...prefixIfInvalid, () => expressionBefore, () => saver.record<Expression>(keywordErrorDisplayer, new InvalidIdentExpression(choice.keyword.getContent()))]);
                        result.either_(e => saver.peekScope().items.push(Either.left(e)), t => saver.currentScopes.push(new SaverBase.Scope<Expression, Op, Keyword, BracketContent>(keywordErrorDisplayer, t)));
                        return true;
                    }
                }

                // Error!
                const fixes = Utility.mapListI(choices, c => new TextQuickFix(StyledString.s("Add missing " + c.keyword.getContent()), [], keywordErrorDisplayer.lhs(), () => new Pair(c.keyword.getContent(), StyledString.s(c.keyword.getContent()))));
                saver.locationRecorder.addErrorAndFixes(keywordErrorDisplayer, StyledString.concat(StyledString.s("Missing "), StyledString.joining(choices.map(e => e.keyword.toStyledString()), " or "), StyledString.s(" before "), (terminator === null ? StyledString.s("end") : terminator.toStyledString())), fixes);
                // Important to call makeContent before adding to scope on the next line:
                const items: Expression[] = [];
                items.push(...prefixIfInvalid.map(s => s()));
                items.push(makeContent(brackets));
                //if (terminator != null)
                    //items.add(locationRecorder.record(keywordErrorDisplayer, new InvalidIdentExpression(terminator.getContent())));
                const invalid = saver.locationRecorder.record<Expression>(CanonicalSpan.fromTo(start, keywordErrorDisplayer), new InvalidOperatorExpression(items));
                saver.peekScope().items.push(Either.left(invalid));
                return false;
            }
        }(choices.map(c => c.keyword.getContent()).join(" or "));
    }

    public lastWasNumber(): boolean
    {
        const curItems = this.peekScope().items;
        return curItems.length >= 1 && curItems[curItems.length - 1]!.either(e => e instanceof NumericLiteral, _op => false);
    }

    public override saveOperand(singleItem: Expression, location: CanonicalSpan): void
    {
        const curItems = this.peekScope().items;
        if (singleItem instanceof UnitLiteralExpression && curItems.length >= 1)
        {
            const recent = curItems[curItems.length - 1]!;
            const num = recent.either<NumericLiteral | null>(e => e instanceof NumericLiteral ? e : null, _o => null);
            if (num !== null && num.getUnitExpression() === null)
            {
                const recorder = this.locationRecorder.recorderFor(num);
                curItems[curItems.length - 1] = Either.left(this.locationRecorder.record<Expression>(CanonicalSpan.fromTo(recorder, location), new NumericLiteral(num.getNumber(), singleItem.getUnit())));
                return;
            }
        }

        super.saveOperand(singleItem, location);
    }

    public override canBeUnary(operator: OpAndNode, followingOperand: Expression): (() => Expression) | null
    {
        if ([ExpressionLexer.Op.ADD, ExpressionLexer.Op.SUBTRACT].includes(operator.op)
                && followingOperand instanceof NumericLiteral)
        {
            const numericLiteral = followingOperand;
            if (operator.op === ExpressionLexer.Op.SUBTRACT)
                return () => this.record<Expression>(CanonicalSpan.fromTo(operator.sourceNode, this.locationRecorder.recorderFor(numericLiteral)), new NumericLiteral(Utility.negate(numericLiteral.getNumber()), numericLiteral.getUnitExpression()));
            else
                return () => numericLiteral; // No change needed for unary plus
        }
        else
            return null;
    }

    /**
     * Get likely types and completions for given child.  For example,
     * if the expression is column Name = _ (where the RHS
     * is the child in question) we might offer Text and most frequent values
     * of the Name column.
     *
     * The completions are not meant to be all possible values of the given
     * type (e.g. literals, available columns, etc), as that can be figured out
     * from the type regardless of context.  This is only items which make
     * particular sense in this particular context, e.g. a commonly passed argument
     * to a function.
     */
    //List<Pair<DataType, List<String>>> getSuggestedContext(EEDisplayNode child) throws InternalException, UserException;

    // Remember: earlier means more likely to be inner-bracketed.  Outer list is groups of operators
    // with equal bracketing likelihood/precedence.
    /** @internal Java: package-visible */
    public readonly OPERATORS: readonly (readonly OperatorExpressionInfo[])[] = ExpressionSaver.makeOperators(this);

    private static makeOperators(saver: ExpressionSaver): readonly (readonly OperatorExpressionInfo[])[]
    {
        const Op = ExpressionLexer.Op;
        const OEI = SaverBase.OperatorExpressionInfo;
        const binary = (op: Op, make: SaverBase.MakeBinarySimple<Expression>): OperatorExpressionInfo => OEI.binary<Expression, ExpressionSaver, Op, BracketContent>(op, make);
        const narySimple = (ops: readonly Op[], make: SaverBase.MakeNarySimple<Expression, Op>): OperatorExpressionInfo => OEI.narySimple<Expression, ExpressionSaver, Op, BracketContent>(saver, ops, make);
        return [
            [
                binary(Op.FIELD_ACCESS, (lhs, _n, rhs) => FieldAccessExpression.fromBinary(lhs, rhs)),
            ],


            // Raise does come above arithmetic, because I think it is more likely that 1 * 2 ^ 3 is actually 1 * (2 ^ 3)
            [
                binary(Op.RAISE, (lhs, _n, rhs) => new RaiseExpression(lhs, rhs)),
            ],

            // Arithmetic operators are all one group.  I know we could separate +- from */, but if you see
            // an expression like 1 + 2 * 3, I'm not sure either bracketing is obviously more likely than the other.
            [
                narySimple([Op.ADD, Op.SUBTRACT], ExpressionSaver.makeAddSubtract),
                narySimple([Op.MULTIPLY], ExpressionSaver.makeTimes),
                binary(Op.DIVIDE, (lhs, _n, rhs) => new DivideExpression(lhs, rhs)),
            ],

            // String concatenation lower than arithmetic.  If you write "val: (" ; 1 * 2; ")" then what you meant
            // is "val: (" ; to.string(1 * 2); ")" which requires an extra function call, but bracketing the arithmetic
            // will be the first step, and much more likely than ("val: (" ; 1) * (2; ")")
            [
                narySimple([Op.STRING_CONCAT], ExpressionSaver.makeStringConcat),
            ],

            // It's moot really whether this is before or after string concat, but feels odd putting them in same group:
            [
                binary(Op.PLUS_MINUS, (lhs, _n, rhs) => new PlusMinusPatternExpression(lhs, rhs)),
            ],

            // Equality and comparison operators:
            [
                narySimple([Op.EQUALS], ExpressionSaver.makeEqual),
                binary(Op.EQUALS_PATTERN, (lhs, _n, rhs) => new EqualExpression([lhs, rhs], true)),
                binary(Op.NOT_EQUAL, (lhs, _n, rhs) => new NotEqualExpression(lhs, rhs)),
                narySimple([Op.LESS_THAN, Op.LESS_THAN_OR_EQUAL], ExpressionSaver.makeComparisonLess),
                narySimple([Op.GREATER_THAN, Op.GREATER_THAN_OR_EQUAL], ExpressionSaver.makeComparisonGreater),
            ],

            // Boolean and, or expressions come near-last.  If you see a = b & c = d, it's much more likely you wanted (a = b) & (c = d) than
            // a = (b & c) = d.
            [
                narySimple([Op.AND], ExpressionSaver.makeAnd),
                narySimple([Op.OR], ExpressionSaver.makeOr),
            ],

            [
                binary(Op.HAS_TYPE, (lhs, _opLoc, rhs) => ExpressionSaver.makeHasType(lhs, rhs)),
            ],

            [
                binary(Op.COLON, (lhs, opLoc, rhs) => new KeyValueExpression(lhs, new SaverBase.OpAndNode(Op.COLON, opLoc), rhs)),
            ],

            // But the very last is the comma separator.  If you see (a & b, c | d), almost certain that you want a tuple
            // like that, rather than a & (b, c) | d.  Especially since tuples can't be fed to any binary operators besides comparison!
            [
                new CommaOperatorExpressionInfo(binary(Op.COMMA, (lhs, _n, _rhs) => /* Dummy, see below: */ lhs)),
            ],
        ];
    }

    private static makeAddSubtract(args: readonly Expression[], ops: readonly Pair<Op, CanonicalSpan>[]): Expression
    {
        return new AddSubtractExpression(args, Utility.mapList(ops, op => op.getFirst() === ExpressionLexer.Op.ADD ? AddSubtractExpression.AddSubtractOp.ADD : AddSubtractExpression.AddSubtractOp.SUBTRACT));
    }

    private static makeTimes(args: readonly Expression[], _ops: readonly Pair<Op, CanonicalSpan>[]): Expression
    {
        return new TimesExpression(args);
    }

    private static makeStringConcat(args: readonly Expression[], _ops: readonly Pair<Op, CanonicalSpan>[]): Expression
    {
        return new StringConcatExpression(args);
    }

    private static makeEqual(args: readonly Expression[], ops: readonly Pair<Op, CanonicalSpan>[]): Expression
    {
        return new EqualExpression(args, ops[ops.length - 1]!.getFirst() === ExpressionLexer.Op.EQUALS_PATTERN);
    }

    private static makeComparisonLess(args: readonly Expression[], ops: readonly Pair<Op, CanonicalSpan>[]): Expression
    {
        return new ComparisonExpression(args, Utility.mapListI(ops, op => op.getFirst() === ExpressionLexer.Op.LESS_THAN ? ComparisonExpression.ComparisonOperator.LESS_THAN : ComparisonExpression.ComparisonOperator.LESS_THAN_OR_EQUAL_TO));
    }

    private static makeComparisonGreater(args: readonly Expression[], ops: readonly Pair<Op, CanonicalSpan>[]): Expression
    {
        return new ComparisonExpression(args, Utility.mapListI(ops, op => op.getFirst() === ExpressionLexer.Op.GREATER_THAN ? ComparisonExpression.ComparisonOperator.GREATER_THAN : ComparisonExpression.ComparisonOperator.GREATER_THAN_OR_EQUAL_TO));
    }

    private static makeAnd(args: readonly Expression[], _ops: readonly Pair<Op, CanonicalSpan>[]): Expression
    {
        return new AndExpression(args);
    }

    private static makeOr(args: readonly Expression[], _ops: readonly Pair<Op, CanonicalSpan>[]): Expression
    {
        return new OrExpression(args);
    }

    private static makeHasType(lhs: Expression, rhs: Expression): Expression
    {
        return lhs.visit(new class extends ExpressionVisitorFlat<Expression>
        {
            public override ident(self: IdentExpression, namespace: ExpressionIdentifier | null, idents: readonly ExpressionIdentifier[], _isVariable: boolean): Expression
            {
                if (namespace === null || namespace === "var")
                    return new HasTypeExpression(idents[idents.length - 1]!, rhs);
                return this.makeDef(self);
            }

            protected override makeDef(_expression: Expression): Expression
            {
                return new InvalidOperatorExpression([lhs, new InvalidIdentExpression("::"), rhs]);
            }
        }());
    }

    public override recorderFor(expression: Expression): CanonicalSpan
    {
        return this.locationRecorder.recorderFor(expression);
    }

    public override fixesForAdjacentOperands(first: Expression, second: Expression): TextQuickFix[]
    {
        // We look for things where people have tried to use
        // C/Java style array indexing of lists.  Because it's invalid
        // we can't know types, so we use syntax.
        // For the list we look for column references
        // (most likely item by far to be a list).
        /* TODO (see the Java) */

        return super.fixesForAdjacentOperands(first, second);
    }

    public getDisplayFor(canonIndex: CanonicalLocation, toRightOf: unknown): ReadonlyMap<TopLevelEditor.DisplayType, Pair<StyledString, readonly TextQuickFix[]>>
    {
        return this.locationRecorder.getDisplayFor(canonIndex, toRightOf);
    }

    /** @internal Java: the private field functionLookup (unused there too) */
    public _getFunctionLookup(): FunctionLookup
    {
        return this.functionLookup;
    }
}

export namespace ExpressionSaver
{
    export class BracketContent implements StyledShowable
    {
        /** @internal Java: private, read by ExpressionSaver */
        public readonly expressions: readonly Expression[];
        /** @internal Java: private, read by ExpressionSaver */
        public readonly commas: readonly Pair<Op, CanonicalSpan>[];

        public constructor(expressions: readonly Expression[], commas: readonly Pair<Op, CanonicalSpan>[])
        {
            this.expressions = expressions;
            this.commas = commas;
        }

        public toStyledString(): StyledString
        {
            // Java: interleave(expressions, commas), from SaverBase
            const items: StyledString[] = [];
            for (let i = 0; i < this.expressions.length; i++)
            {
                items.push(this.expressions[i]!.toStyledString());
                if (i < this.commas.length)
                    items.push(this.commas[i]!.getFirst().toStyledString());
            }
            return StyledString.joining(items, "");
        }
    }
}

// The comma "operator", which makes BracketContent rather than an expression (Java: an anonymous
// subclass of OperatorExpressionInfo overriding makeOperatorSection)
class CommaOperatorExpressionInfo extends SaverBase.OperatorExpressionInfo<Expression, ExpressionSaver, Op, BracketContent>
{
    public constructor(dummy: OperatorExpressionInfo)
    {
        super(dummy.operators, dummy.makeExpression);
    }

    public override makeOperatorSection(locationRecorder: EditorLocationAndErrorRecorder, operatorSetPrecedence: number, initialOperator: OpAndNode, initialIndex: number): SaverBase.OperatorSection<Expression, ExpressionSaver, Op, BracketContent>
    {
        return new SaverBase.NaryOperatorSection<Expression, ExpressionSaver, Op, BracketContent>(locationRecorder, this.operators, operatorSetPrecedence, <R extends StyledShowable>(args: readonly Expression[], ops: readonly Pair<Op, CanonicalSpan>[], brackets: SaverBase.BracketAndNodes<Expression, ExpressionSaver, BracketContent, R>, _locationRecorder: EditorLocationAndErrorRecorder): R | null =>
        {
            return brackets.applyBrackets.apply(new ExpressionSaver.BracketContent(args, [...ops]));
        }, initialIndex, initialOperator);

    }
}

// Looks for a keyword, then takes the expression before the keyword and gives next step.
abstract class Choice
{
    public readonly keyword: Keyword;

    protected constructor(keyword: Keyword)
    {
        this.keyword = keyword;
    }

    public abstract foundKeyword(expressionBefore: Expression, node: CanonicalSpan, prefixIfInvalid: readonly (() => Expression)[]): Either<Expression, Terminator>;
}

// Looks for @case
class Case extends Choice
{
    private readonly saver: ExpressionSaver;
    private readonly matchKeyword: CanonicalSpan;
    // If null, we are the first case.  Otherwise we are a later case,
    // in which case we are Right with the given patterns
    private readonly matchAndPatterns: Pair<CanonicalSpan, Pair<Expression, readonly MatchExpression.Pattern[]>> | null;
    // Previous complete clauses
    private readonly previousClauses: readonly MatchExpression.MatchClause[];

    // Java: Case(matchKeyword), which looks for first @case after a @match, and
    // Case(matchKeyword, caseLocation, matchFrom, previousClauses, patternsForCur), which matches a
    // later @case, meaning we follow a @then and an outcome
    public constructor(saver: ExpressionSaver, matchKeyword: CanonicalSpan, later: { caseLocation: CanonicalSpan, matchFrom: Expression, previousClauses: readonly MatchExpression.MatchClause[], patternsForCur: readonly MatchExpression.Pattern[] } | null = null)
    {
        super(ExpressionLexer.Keyword.CASE);
        this.saver = saver;
        this.matchKeyword = matchKeyword;
        if (later === null)
        {
            this.matchAndPatterns = null;
            this.previousClauses = [];
        }
        else
        {
            this.matchAndPatterns = new Pair(later.caseLocation, new Pair(later.matchFrom, later.patternsForCur));
            this.previousClauses = later.previousClauses;
        }
    }

    public override foundKeyword(expressionBefore: Expression, node: CanonicalSpan, prefixIfInvalid: readonly (() => Expression)[]): Either<Expression, Terminator>
    {
        let m: Expression;
        let newClauses: readonly MatchExpression.MatchClause[];
        // If we are first case, use the expression as the match expression:
        if (this.matchAndPatterns === null)
        {
            m = expressionBefore;
            newClauses = this.previousClauses;
        }
        else
        {
            // Otherwise this is the outcome for the most recent clause:
            m = this.matchAndPatterns.getSecond().getFirst();
            const patterns = this.matchAndPatterns.getSecond().getSecond();
            newClauses = Utility.appendToList(this.previousClauses, new MatchExpression.MatchClause(this.matchAndPatterns.getFirst(), patterns, expressionBefore));
        }
        return Either.right(this.saver.expectOneOf(node, [
            new Then(this.saver, this.matchKeyword, m, newClauses, [], node, ExpressionLexer.Keyword.CASE),
            new Given(this.saver, this.matchKeyword, m, newClauses, [], node),
            new OrCase(this.saver, this.matchKeyword, m, newClauses, [], node, null),
        ], prefixIfInvalid));
    }
}

// Looks for @given to add a guard
class Given extends Choice
{
    public constructor(private readonly saver: ExpressionSaver, private readonly matchKeyword: CanonicalSpan, private readonly matchFrom: Expression, private readonly previousClauses: readonly MatchExpression.MatchClause[], private readonly previousCases: readonly MatchExpression.Pattern[], private readonly caseLocation: CanonicalSpan)
    {
        super(ExpressionLexer.Keyword.GIVEN);
    }

    public override foundKeyword(expressionBefore: Expression, node: CanonicalSpan, prefixIfInvalid: readonly (() => Expression)[]): Either<Expression, Terminator>
    {
        // Expression here is the pattern, which comes before the guard:
        return Either.right(this.saver.expectOneOf(node, [
            new OrCase(this.saver, this.matchKeyword, this.matchFrom, this.previousClauses, this.previousCases, this.caseLocation, expressionBefore),
            new Then(this.saver, this.matchKeyword, this.matchFrom, this.previousClauses, Utility.appendToList(this.previousCases, new MatchExpression.Pattern(expressionBefore, null)), this.caseLocation, ExpressionLexer.Keyword.GIVEN),
        ], prefixIfInvalid));
    }
}

// Looks for @orcase
class OrCase extends Choice
{
    // curMatch: if null, nothing so far, if non-null we are a guard
    public constructor(private readonly saver: ExpressionSaver, private readonly matchKeyword: CanonicalSpan, private readonly matchFrom: Expression, private readonly previousClauses: readonly MatchExpression.MatchClause[], private readonly previousCases: readonly MatchExpression.Pattern[], private readonly caseLocation: CanonicalSpan, private readonly curMatch: Expression | null)
    {
        super(ExpressionLexer.Keyword.ORCASE);
    }

    public override foundKeyword(expressionBefore: Expression, node: CanonicalSpan, prefixIfInvalid: readonly (() => Expression)[]): Either<Expression, Terminator>
    {
        const newCases = Utility.appendToList(this.previousCases, this.curMatch === null ?
            // We are the pattern:
            new MatchExpression.Pattern(expressionBefore, null) :
            // We are the guard:
            new MatchExpression.Pattern(this.curMatch, expressionBefore)
        );
        return Either.right(this.saver.expectOneOf(node, [
            new Given(this.saver, this.matchKeyword, this.matchFrom, this.previousClauses, newCases, this.caseLocation),
            new OrCase(this.saver, this.matchKeyword, this.matchFrom, this.previousClauses, newCases, this.caseLocation, null),
            new Then(this.saver, this.matchKeyword, this.matchFrom, this.previousClauses, newCases, this.caseLocation, ExpressionLexer.Keyword.ORCASE),
        ], prefixIfInvalid));
    }
}

// Looks for @then (in match expressions; if-then-else is handled separately)
class Then extends Choice
{
    // Preceding keyword may be CASE, GIVEN or ORCASE:
    public constructor(private readonly saver: ExpressionSaver, private readonly matchKeywordNode: CanonicalSpan, private readonly matchFrom: Expression, private readonly previousClauses: readonly MatchExpression.MatchClause[], private readonly previousPatterns: readonly MatchExpression.Pattern[], private readonly caseLocation: CanonicalSpan, private readonly precedingKeyword: Keyword)
    {
        super(ExpressionLexer.Keyword.THEN);
    }

    public override foundKeyword(expressionBefore: Expression, node: CanonicalSpan, prefixIfInvalid: readonly (() => Expression)[]): Either<Expression, Terminator>
    {
        let newPatterns: readonly MatchExpression.Pattern[];
        if (this.precedingKeyword === ExpressionLexer.Keyword.GIVEN)
        {
            // The expression is a guard for the most recent pattern:
            newPatterns = Utility.appendToList(this.previousPatterns.slice(0, this.previousPatterns.length - 1), new MatchExpression.Pattern(this.previousPatterns[this.previousPatterns.length - 1]!.getPattern(), expressionBefore));
        }
        else //if (precedingKeyword == Keyword.ORCASE || precedingKeyword == Keyword.CASE)
        {
            // The expression is a pattern:
            newPatterns = Utility.appendToList(this.previousPatterns, new MatchExpression.Pattern(expressionBefore, null));
        }
        // eslint-disable-next-line @typescript-eslint/no-this-alias
        const then = this;
        return Either.right(this.saver.expectOneOf(node, [
            new Case(this.saver, this.matchKeywordNode, { caseLocation: this.caseLocation, matchFrom: this.matchFrom, previousClauses: this.previousClauses, patternsForCur: newPatterns }),
            new class extends Choice
            {
                public constructor()
                {
                    super(ExpressionLexer.Keyword.ENDMATCH);
                }

                public override foundKeyword(lastExpression: Expression, endNode: CanonicalSpan, _prefixIfInvalid: readonly (() => Expression)[]): Either<Expression, Terminator>
                {
                    const matchExpression = new MatchExpression(then.matchKeywordNode, then.matchFrom, Utility.appendToList(then.previousClauses, new MatchExpression.MatchClause(then.caseLocation, newPatterns, lastExpression)), endNode);
                    return Either.left<Expression, Terminator>(then.saver.locationRecorder.record<Expression>(CanonicalSpan.fromTo(then.matchKeywordNode, endNode), matchExpression));
                }
            }(),
        ], prefixIfInvalid));
    }
}

class KeyValueExpression extends Expression
{
    /** @internal */ public readonly lhs: Expression;
    private readonly colon: OpAndNode;
    /** @internal */ public readonly rhs: Expression;

    public constructor(lhs: Expression, opAndNode: OpAndNode, rhs: Expression)
    {
        super();
        this.lhs = lhs;
        this.colon = opAndNode;
        this.rhs = rhs;
    }

    public override check(_dataLookup: Expression.ColumnLookup, _typeState: TypeState, _kind: Expression.ExpressionKind, _locationInfo: Expression.LocationInfo, onError: ErrorAndTypeRecorder): Expression.CheckedExp | null
    {
        // If we are type-checked directly, we are in the wrong place:
        onError.recordError(this, StyledString.s("Colon not a valid operator here"));
        return null;
    }

    public override calculateValue(_state: EvaluateState): Expression.ValueResult
    {
        // If we are executed directly, we are in the wrong place:
        throw new InternalException("Executing KeyValueExpression despite failed typecheck");
    }

    public override visit<T>(visitor: ExpressionVisitor<T>): T
    {
        // Bit of a hack all round:
        if (visitor instanceof ExpressionVisitorStream)
            return [] as T;

        Log.logStackTrace("KeyValueExpression.visit");
        return null as T;
    }

    public override save(saveDestination: Expression.SaveDestination, _surround: BracketedStatus, renames: TableAndColumnRenames): string
    {
        return this.lhs.save(saveDestination, BracketedStatus.NEED_BRACKETS, renames) + ": " + this.rhs.save(saveDestination, BracketedStatus.NEED_BRACKETS, renames);
    }

    public override _test_childMutationPoints(): Pair<Expression, (e: Expression) => Expression>[]
    {
        return [];
    }

    public override _test_typeFailure(_r: JavaRandom, _newExpressionOfDifferentType: Expression._test_TypeVary, _unitManager: UnitManager): Expression | null
    {
        return null;
    }

    public override equals(_o: unknown): boolean
    {
        return false;
    }

    public override hashCode(): number
    {
        return 0;
    }

    public override toDisplay(_displayType: Expression.DisplayType, _bracketedStatus: BracketedStatus, _expressionStyler: Expression.ExpressionStyler): StyledString
    {
        return StyledString.concat(this.lhs.toStyledString(), StyledString.s(" : "), this.rhs.toStyledString());
    }

    public override replaceSubExpression(toReplace: Expression, replaceWith: Expression): Expression
    {
        if (this === toReplace)
            return replaceWith;
        else
            return new KeyValueExpression(this.lhs.replaceSubExpression(toReplace, replaceWith), this.colon, this.rhs.replaceSubExpression(toReplace, replaceWith));
    }

    public extractPair(): Pair<ExpressionIdentifier, Expression> | null
    {
        const lhsIdent = this.lhs.visit(new class extends ExpressionVisitorFlat<ExpressionIdentifier | null>
        {
            protected override makeDef(_expression: Expression): ExpressionIdentifier | null
            {
                return null;
            }

            public override ident(self: IdentExpression, namespace: ExpressionIdentifier | null, idents: readonly ExpressionIdentifier[], isVariable: boolean): ExpressionIdentifier | null
            {
                if (namespace === null && idents.length === 1)
                    return idents[0]!;
                return super.ident(self, namespace, idents, isVariable);
            }
        }());

        if (lhsIdent !== null)
            return new Pair(lhsIdent, this.rhs);
        else
            return null;
    }

    public opAsExpression(locationRecorder: EditorLocationAndErrorRecorder): Expression
    {
        return locationRecorder.record<Expression>(this.colon.sourceNode, new InvalidIdentExpression(this.colon.op.getContent()));
    }
}

// Java: the inner class FunctionParamThen
class FunctionParamThen extends SaverBase.Terminator<Expression, ExpressionSaver, Keyword, BracketContent>
{
    public constructor(private readonly saver: ExpressionSaver, private readonly initialFunction: CanonicalSpan)
    {
        super("@then");
    }

    public override terminate(makeContent: SaverBase.FetchContent<Expression, ExpressionSaver, BracketContent>, terminator: Keyword | null, keywordErrorDisplayer: CanonicalSpan): boolean
    {
        const saver = this.saver;
        const locationRecorder = saver.locationRecorder;
        const itemsIfInvalid: Expression[] = [];
        // We can't actually record BracketContent
        const bracketContent: BracketContent = makeContent(new SaverBase.BracketAndNodes<Expression, ExpressionSaver, BracketContent, BracketContent & StyledShowable>({
            apply(items: BracketContent): BracketContent | null
            {
                return items;
            },

            applySingle(singleItem: Expression): BracketContent
            {
                return new ExpressionSaver.BracketContent([singleItem], []);
            },
        }, keywordErrorDisplayer, []));

        const foundThen = (terminator === ExpressionLexer.Keyword.THEN);

        const params: Expression[] | null = foundThen ? [] : null;
        for (let i = 0; i < bracketContent.expressions.length; i++)
        {
            const e = bracketContent.expressions[i]!;
            itemsIfInvalid.push(e);
            if (i < bracketContent.commas.length)
                itemsIfInvalid.push(locationRecorder.record(bracketContent.commas[i]!.getSecond(), new InvalidIdentExpression(bracketContent.commas[i]!.getFirst().getContent())));
            if (params !== null)
                params.push(e);
        }

        if (foundThen)
            itemsIfInvalid.push(saver.keywordToInvalid(ExpressionLexer.Keyword.THEN, keywordErrorDisplayer));
        if (params !== null)
        {
            const args = [...params];
            saver.currentScopes.push(new SaverBase.Scope<Expression, Op, Keyword, BracketContent>(keywordErrorDisplayer, saver.expect([ExpressionLexer.Keyword.ENDFUNCTION], s => saver.expectSingle(locationRecorder, s), (e, s) => Either.left<Expression, Terminator>(locationRecorder.record<Expression>(new CanonicalSpan(this.initialFunction.start, s.end), new LambdaExpression(args, e))), () => [...itemsIfInvalid], null, false)));
        }
        else
        {
            // Invalid
            saver.peekScope().items.push(Either.left<Expression, OpAndNode>(locationRecorder.record<Expression>(new CanonicalSpan(this.initialFunction.start, itemsIfInvalid.length === 0 ? this.initialFunction.end : locationRecorder.recorderFor(itemsIfInvalid[itemsIfInvalid.length - 1]!).end), new InvalidOperatorExpression(Utility.prependToList(saver.keywordToInvalid(ExpressionLexer.Keyword.FUNCTION, this.initialFunction), [...itemsIfInvalid])))));
        }
        return foundThen;
    }
}

// Java: the inner class DefineThen
class DefineThen extends SaverBase.Terminator<Expression, ExpressionSaver, Keyword, BracketContent>
{
    public constructor(private readonly saver: ExpressionSaver, private readonly initialDefine: CanonicalSpan)
    {
        super("@then");
    }

    public override terminate(makeContent: SaverBase.FetchContent<Expression, ExpressionSaver, BracketContent>, terminator: Keyword | null, keywordErrorDisplayer: CanonicalSpan): boolean
    {
        const saver = this.saver;
        const locationRecorder = saver.locationRecorder;
        const itemsIfInvalid: Expression[] = [];
        itemsIfInvalid.push(saver.keywordToInvalid(ExpressionLexer.Keyword.DEFINE, this.initialDefine));
        // We can't actually record BracketContent
        const bracketContent: BracketContent = makeContent(new SaverBase.BracketAndNodes<Expression, ExpressionSaver, BracketContent, BracketContent & StyledShowable>({
            apply(items: BracketContent): BracketContent | null
            {
                return items;
            },

            applySingle(singleItem: Expression): BracketContent
            {
                return new ExpressionSaver.BracketContent([singleItem], []);
            },
        }, keywordErrorDisplayer, []));

        const foundThen = (terminator === ExpressionLexer.Keyword.THEN);

        let definitions: DefineExpression.DefineItem[] | null = foundThen ? [] : null;
        for (let i = 0; i < bracketContent.expressions.length; i++)
        {
            const e = bracketContent.expressions[i]!;
            itemsIfInvalid.push(e);
            if (i < bracketContent.commas.length)
                itemsIfInvalid.push(locationRecorder.record(bracketContent.commas[i]!.getSecond(), new InvalidIdentExpression(bracketContent.commas[i]!.getFirst().getContent())));
            if (definitions !== null)
                definitions = e.visit(new VisitDefinitions(definitions, i < bracketContent.commas.length ? bracketContent.commas[i]!.getSecond() : keywordErrorDisplayer));
        }

        if (foundThen)
            itemsIfInvalid.push(saver.keywordToInvalid(ExpressionLexer.Keyword.THEN, keywordErrorDisplayer));
        if (definitions !== null)
        {
            const defs = [...definitions];

            saver.currentScopes.push(new SaverBase.Scope<Expression, Op, Keyword, BracketContent>(keywordErrorDisplayer, saver.expect([ExpressionLexer.Keyword.ENDDEFINE], s => saver.expectSingle(locationRecorder, s), (e, s) =>
            {
                const defineExpression = new DefineExpression(this.initialDefine, defs, e, s);
                return Either.left<Expression, Terminator>(locationRecorder.record<Expression>(new CanonicalSpan(this.initialDefine.start, s.end), defineExpression));
            }, () => [...itemsIfInvalid], null, false)));
        }
        else
        {
            // Invalid
            saver.peekScope().items.push(Either.left<Expression, OpAndNode>(locationRecorder.record<Expression>(new CanonicalSpan(this.initialDefine.start, itemsIfInvalid.length === 0 ? this.initialDefine.end : locationRecorder.recorderFor(itemsIfInvalid[itemsIfInvalid.length - 1]!).end), new InvalidOperatorExpression([...itemsIfInvalid]))));
        }
        return foundThen;
    }
}

// Returns null or the original array reference passed to constructor
class VisitDefinitions extends ExpressionVisitorFlat<DefineExpression.DefineItem[] | null>
{
    public constructor(private readonly definitions: DefineExpression.DefineItem[], private readonly terminatorLocation: CanonicalSpan) // of either comma or @then
    {
        super();
    }

    protected override makeDef(_expression: Expression): DefineExpression.DefineItem[] | null
    {
        return null;
    }

    public override hasType(self: HasTypeExpression, _lhsVar: ExpressionIdentifier, _rhsType: Expression): DefineExpression.DefineItem[] | null
    {
        this.definitions.push(new DefineExpression.DefineItem(Either.left(self), this.terminatorLocation));
        return this.definitions;
    }

    public override equal(_self: EqualExpression, expressions: readonly Expression[], lastIsPattern: boolean): DefineExpression.DefineItem[] | null
    {
        if (expressions.length === 2 && !lastIsPattern)
        {
            this.definitions.push(new DefineExpression.DefineItem(Either.right(new DefineExpression.Definition(expressions[0]!, expressions[1]!)), this.terminatorLocation));
            return this.definitions;
        }
        else
            return null;
    }
}
