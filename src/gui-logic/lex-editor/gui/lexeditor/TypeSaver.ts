// Port of xyz.columnal.gui.lexeditor.TypeSaver (lex-editor module).
import type { CanonicalLocation, ExpressionIdentifier } from "../../../../engine/anns/Annotations.js";
import { CanonicalSpan } from "../../../../engine/expressions/transformations/expression/CanonicalSpan.js";
import { IdentTypeExpression, InvalidIdentTypeExpression, InvalidOpTypeExpression, ListTypeExpression, NumberTypeExpression, RecordTypeExpression, TypeApplyExpression, UnitLiteralTypeExpression, type TypeExpression } from "../../../../engine/expressions/transformations/expression/type/TypeExpressions.js";
import type { UnitExpression } from "../../../../engine/expressions/transformations/expression/UnitExpressions.js";
import type { TypeManager } from "../../../../engine/types/data/datatype/TypeManager.js";
import { Either } from "../../../../engine/utility-adt/utility/adt/Either.js";
import { Pair } from "../../../../engine/utility-adt/utility/adt/Pair.js";
import type { StyledShowable } from "../../../../engine/utility-error/styled/StyledShowable.js";
import { StyledString } from "../../../../engine/utility-error/styled/StyledString.js";
import { Utility } from "../../../../engine/utility/utility/Utility.js";
import type { InsertListener } from "../../../lex-editor-completion/gui/lexeditor/completion/InsertListener.js";
import type { EditorLocationAndErrorRecorder } from "./EditorLocationAndErrorRecorder.js";
import { SaverBase } from "./SaverBase.js";
import { TypeLexer } from "./TypeLexer.js";

type Operator = TypeLexer.Operator;
type Keyword = TypeLexer.Keyword;

export class TypeSaver extends SaverBase<TypeExpression, TypeSaver, Operator, Keyword, TypeSaver.BracketContent>
{
    // Java: FXUtility.getDataFormat("application/records-type")
    public static readonly TYPE_CLIPBOARD_TYPE = "application/records-type";

    /** @internal Java: package-visible */
    public readonly OPERATORS: readonly SaverBase.OperatorExpressionInfo<TypeExpression, TypeSaver, Operator, TypeSaver.BracketContent>[] = [
        SaverBase.OperatorExpressionInfo.nary<TypeExpression, TypeSaver, Operator, TypeSaver.BracketContent>([TypeLexer.Operator.COMMA, TypeLexer.Operator.COLON], <R extends StyledShowable>(typeExpressions: readonly TypeExpression[], operators: readonly Pair<Operator, CanonicalSpan>[], bracketedStatus: SaverBase.BracketAndNodes<TypeExpression, TypeSaver, TypeSaver.BracketContent, R>, _errorDisplayerRecord: EditorLocationAndErrorRecorder): R | null =>
        {
            return bracketedStatus.applyBrackets.apply(new TypeSaver.BracketContent(typeExpressions, [...operators]));
        }),
    ];

    public constructor(typeManager: TypeManager, insertListener: InsertListener)
    {
        super(typeManager, insertListener);
    }

    public saveKeyword(keyword: Keyword, errorDisplayer: CanonicalSpan): void
    {
        const prefixKeyword = (): readonly TypeExpression[] => [this.record<TypeExpression>(errorDisplayer, new InvalidIdentTypeExpression(keyword.getContent()))];

        if (keyword === TypeLexer.Keyword.OPEN_ROUND)
        {
            this.currentScopes.push(new SaverBase.Scope<TypeExpression, Operator, Keyword, TypeSaver.BracketContent>(errorDisplayer, this.expect([TypeLexer.Keyword.CLOSE_ROUND], close => new SaverBase.BracketAndNodes<TypeExpression, TypeSaver, TypeSaver.BracketContent, TypeExpression>(this.tupleOrSingle(this.locationRecorder, CanonicalSpan.fromTo(errorDisplayer, close)), CanonicalSpan.fromTo(errorDisplayer, close), []),
                    (bracketed, bracketEnd) =>
                    {
                        const precedingItems = this.peekScope().items;
                        // Type applications are a special case:
                        if (precedingItems.length >= 1 && precedingItems[precedingItems.length - 1]!.either(e => e instanceof IdentTypeExpression || e instanceof TypeApplyExpression, _op => false))
                        {
                            const callTarget = precedingItems.pop()!.either<TypeExpression | null>(e => e, _op => null);
                            // Shouldn't ever be null:
                            if (callTarget !== null)
                            {
                                const newArg: Either<UnitExpression, TypeExpression> = bracketed instanceof UnitLiteralTypeExpression ? Either.left(bracketed.getUnitExpression()) : Either.right(bracketed);

                                let typeExpression: TypeApplyExpression;
                                if (callTarget instanceof TypeApplyExpression)
                                {
                                    const applyExpression = callTarget;

                                    typeExpression = new TypeApplyExpression(applyExpression.getTypeName(), Utility.concatI(applyExpression.getArgumentsOnly(), [newArg]));
                                }
                                else
                                {
                                    const identTypeExpression = callTarget as IdentTypeExpression;
                                    typeExpression = new TypeApplyExpression(identTypeExpression.asIdent(), [newArg]);
                                }
                                return Either.left<TypeExpression, SaverBase.Terminator<TypeExpression, TypeSaver, Keyword, TypeSaver.BracketContent>>(this.locationRecorder.record<TypeExpression>(CanonicalSpan.fromTo(this.recorderFor(callTarget), bracketEnd), typeExpression));
                            }
                        }
                        return Either.left<TypeExpression, SaverBase.Terminator<TypeExpression, TypeSaver, Keyword, TypeSaver.BracketContent>>(bracketed);
                    }, prefixKeyword, null, true)));
        }
        else if (keyword === TypeLexer.Keyword.OPEN_SQUARE)
        {
            this.currentScopes.push(new SaverBase.Scope<TypeExpression, Operator, Keyword, TypeSaver.BracketContent>(errorDisplayer, this.expect([TypeLexer.Keyword.CLOSE_SQUARE], close => new SaverBase.BracketAndNodes<TypeExpression, TypeSaver, TypeSaver.BracketContent, TypeExpression>(this.makeList(this.locationRecorder, CanonicalSpan.fromTo(errorDisplayer, close), CanonicalSpan.fromTo(errorDisplayer.rhs(), close.lhs())), CanonicalSpan.fromTo(errorDisplayer, close), []), (e, _c) => Either.left<TypeExpression, SaverBase.Terminator<TypeExpression, TypeSaver, Keyword, TypeSaver.BracketContent>>(e), prefixKeyword, null, true)));
        }
        else
        {
            // Should be a terminator:
            const cur = this.currentScopes.pop()!;
            if (this.currentScopes.length === 0)
            {
                this.addTopLevelScope();
            }
            cur.terminator.terminate(this.fetchMake(cur), keyword, errorDisplayer);
        }
    }

    private tupleOrSingle(errorDisplayerRecord: EditorLocationAndErrorRecorder, location: CanonicalSpan): SaverBase.ApplyBrackets<TypeSaver.BracketContent, TypeExpression, TypeExpression>
    {
        return {
            apply(items: TypeSaver.BracketContent): TypeExpression | null
            {
                if (items.typeExpressions.length === 1)
                    return items.typeExpressions[0]!;

                // Need to have pattern: IDENT : EXPRESSION (, IDENT : EXPRESSION)*
                let allOk = true;
                let recentIdent: ExpressionIdentifier | null = null;
                const pairs: Pair<ExpressionIdentifier, TypeExpression>[] = [];
                for (let i = 0; i < items.typeExpressions.length; i++)
                {
                    const expression = items.typeExpressions[i]!;
                    if (recentIdent === null)
                    {
                        // Looking for ident:
                        const ident = expression.asIdent();
                        if (ident !== null)
                        {
                            if (i !== 0 && items.operators[i - 1]!.getFirst() !== TypeLexer.Operator.COMMA)
                            {
                                allOk = false;
                                break;
                            }

                            recentIdent = ident;
                            continue;
                        }
                        allOk = false;
                    }
                    else
                    {
                        // Looking for expression:
                        if (i !== 0 && items.operators[i - 1]!.getFirst() !== TypeLexer.Operator.COLON)
                        {
                            allOk = false;
                            break;
                        }
                        pairs.push(new Pair(recentIdent, expression));
                        recentIdent = null;
                    }
                }
                if (allOk)
                    return errorDisplayerRecord.record<TypeExpression>(location, new RecordTypeExpression(pairs));

                const invalidOps: TypeExpression[] = [];
                for (let i = 0; i < items.typeExpressions.length; i++)
                {
                    const expression = items.typeExpressions[i]!;
                    invalidOps.push(expression);
                    if (i < items.operators.length)
                        invalidOps.push(errorDisplayerRecord.record(items.operators[i]!.getSecond(), new InvalidIdentTypeExpression(items.operators[i]!.getFirst().getContent())));
                }
                return errorDisplayerRecord.record<TypeExpression>(location, new InvalidOpTypeExpression(invalidOps));
            },

            applySingle(singleItem: TypeExpression): TypeExpression
            {
                return singleItem;
            },
        };
    }

    private makeList(errorDisplayerRecord: EditorLocationAndErrorRecorder, locationInclBrackets: CanonicalSpan, locationInsideBrackets: CanonicalSpan): SaverBase.ApplyBrackets<TypeSaver.BracketContent, TypeExpression, TypeExpression>
    {
        return {
            apply(items: TypeSaver.BracketContent): TypeExpression | null
            {
                if (items.typeExpressions.length === 1)
                    return errorDisplayerRecord.record<TypeExpression>(locationInclBrackets, new ListTypeExpression(items.typeExpressions[0]!));
                else
                {
                    const content = errorDisplayerRecord.record(locationInsideBrackets, new InvalidOpTypeExpression(items.typeExpressions));
                    errorDisplayerRecord.addErrorAndFixes(locationInsideBrackets, StyledString.s("Invalid expression"), []);
                    return errorDisplayerRecord.record<TypeExpression>(locationInclBrackets, new ListTypeExpression(content));
                }
            },

            applySingle(singleItem: TypeExpression): TypeExpression
            {
                return errorDisplayerRecord.record<TypeExpression>(locationInclBrackets, new ListTypeExpression(singleItem));
            },
        };
    }

    public override expectSingle(errorDisplayerRecord: EditorLocationAndErrorRecorder, location: CanonicalSpan): SaverBase.BracketAndNodes<TypeExpression, TypeSaver, TypeSaver.BracketContent, TypeExpression>
    {
        return new SaverBase.BracketAndNodes<TypeExpression, TypeSaver, TypeSaver.BracketContent, TypeExpression>({
            apply(items: TypeSaver.BracketContent): TypeExpression | null
            {
                if (items.typeExpressions.length === 1)
                    return items.typeExpressions[0]!;
                else
                    return null;
            },

            applySingle(singleItem: TypeExpression): TypeExpression
            {
                return singleItem;
            },
        }, location, [this.tupleOrSingle(errorDisplayerRecord, location)]);
    }


    public override saveOperand(singleItem: TypeExpression, location: CanonicalSpan): void
    {
        if (singleItem instanceof UnitLiteralTypeExpression)
        {
            const curItems = this.peekScope().items;
            if (curItems.length > 0)
            {
                const last = curItems[curItems.length - 1]!;
                if (last.either(t =>
                {
                    if (t instanceof NumberTypeExpression && !t.hasUnit())
                    {
                        curItems.pop();
                        super.saveOperand(new NumberTypeExpression(singleItem.getUnitExpression()), CanonicalSpan.fromTo(this.locationRecorder.recorderFor(t), location));
                        return true;
                    }
                    return false;
                }, _o => false))
                {
                    return;
                }
            }
        }
        super.saveOperand(singleItem, location);
    }

    public override canBeUnary(_operator: SaverBase.OpAndNode<Operator>, _followingOperand: TypeExpression): (() => TypeExpression) | null
    {
        return null;
    }

    public override makeInvalidOp(location: CanonicalSpan, items: readonly Either<SaverBase.OpAndNode<Operator>, TypeExpression>[]): TypeExpression
    {
        return this.locationRecorder.record<TypeExpression>(location, new InvalidOpTypeExpression(Utility.mapListI(items, x => x.either<TypeExpression>(u => this.record(u.sourceNode, new InvalidIdentTypeExpression(",")), y => y))));
    }

    public override recorderFor(typeExpression: TypeExpression): CanonicalSpan
    {
        return this.locationRecorder.recorderFor(typeExpression);
    }

    public override keywordToInvalid(keyword: Keyword): TypeExpression
    {
        return new InvalidIdentTypeExpression(keyword.getContent());
    }

    public override makeExpression<R extends StyledShowable>(contentOriginal: readonly Either<TypeExpression, SaverBase.OpAndNode<Operator>>[], brackets: SaverBase.BracketAndNodes<TypeExpression, TypeSaver, TypeSaver.BracketContent, R>, innerContentLocation: CanonicalLocation, terminatorDescription: string | null): R
    {
        if (contentOriginal.length === 0)
        {
            // If terminator is null, error will be elsewhere
            if (terminatorDescription !== null)
                this.locationRecorder.addErrorAndFixes(new CanonicalSpan(innerContentLocation, innerContentLocation), StyledString.s("Empty brackets"), []);
            return brackets.applyBrackets.applySingle(this.record<TypeExpression>(brackets.location, new InvalidOpTypeExpression([])));
        }

        const location = CanonicalSpan.fromTo(this.getLocationForEither(contentOriginal[0]!), this.getLocationForEither(contentOriginal[contentOriginal.length - 1]!));

        const content = [...contentOriginal];

        // Don't examine last item, can't be followed by unit:
        for (let i = 0; i < content.length - 1; i++)
        {
            const numberType = content[i]!.either<NumberTypeExpression | null>(e => e instanceof NumberTypeExpression && !e.hasUnit() ? e : null, _op => null);
            if (numberType !== null)
            {
                const unitLiteral = content[i + 1]!.either<UnitLiteralTypeExpression | null>(e => e instanceof UnitLiteralTypeExpression ? e : null, _op => null);
                if (unitLiteral !== null)
                {
                    content[i] = Either.left(
                        this.record<TypeExpression>(CanonicalSpan.fromTo(this.locationRecorder.recorderFor(numberType),
                            this.locationRecorder.recorderFor(unitLiteral)),
                            new NumberTypeExpression(unitLiteral.getUnitExpression())));
                    i -= 1;
                }
            }
        }

        const collectedItems = this.processItems(content);

        if (collectedItems.isValid())
        {
            const validOperands = collectedItems.getValidOperands();
            const validOperators = collectedItems.getValidOperators();

            // Single expression?
            if (validOperands.length === 1 && validOperators.length === 0)
            {
                const bracketedValid = brackets.applyBrackets.applySingle(validOperands[0]!);
                return bracketedValid;
            }

            // Now we need to check the operators can work together as one group:
            const e = this.makeExpressionWithOperators([this.OPERATORS], this.locationRecorder, (arg: readonly Either<SaverBase.OpAndNode<Operator>, TypeExpression>[]) =>
                    brackets.applyBrackets.applySingle(this.makeInvalidOp(brackets.location, arg))
                , [...validOperands], [...validOperators], brackets);
            if (e !== null)
            {
                return e;
            }

        }

        return brackets.applyBrackets.applySingle(collectedItems.makeInvalid(location, items => new InvalidOpTypeExpression(items)));
    }

    public override opToInvalid(operator: Operator): TypeExpression
    {
        return InvalidIdentTypeExpression.identOrUnfinished(operator.getContent());
    }

    public override unclosedBrackets(closed: SaverBase.BracketAndNodes<TypeExpression, TypeSaver, TypeSaver.BracketContent, TypeExpression>): SaverBase.BracketAndNodes<TypeExpression, TypeSaver, TypeSaver.BracketContent, TypeExpression>
    {
        // eslint-disable-next-line @typescript-eslint/no-this-alias
        const saver = this;
        return new SaverBase.BracketAndNodes<TypeExpression, TypeSaver, TypeSaver.BracketContent, TypeExpression>({
            apply(items: TypeSaver.BracketContent): TypeExpression | null
            {
                return saver.record<TypeExpression>(closed.location, new InvalidOpTypeExpression(items.typeExpressions));
            },

            applySingle(singleItem: TypeExpression): TypeExpression
            {
                return singleItem;
            },
        }, closed.location, [closed.applyBrackets]);
    }

    // Java: the inner class FetchMake
    private fetchMake(cur: SaverBase.Scope<TypeExpression, Operator, Keyword, TypeSaver.BracketContent>): SaverBase.FetchContent<TypeExpression, TypeSaver, TypeSaver.BracketContent>
    {
        return <R extends StyledShowable>(brackets: SaverBase.BracketAndNodes<TypeExpression, TypeSaver, TypeSaver.BracketContent, R>): R =>
        {
            return this.makeExpression(cur.items, brackets, cur.openingNode.end, cur.terminator.terminatorDescription);
        };
    }
}

export namespace TypeSaver
{
    export class BracketContent
    {
        /** @internal Java: private, read by TypeSaver */
        public readonly typeExpressions: readonly TypeExpression[];
        /** @internal Java: private, read by TypeSaver */
        public readonly operators: readonly Pair<Operator, CanonicalSpan>[];

        public constructor(typeExpressions: readonly TypeExpression[], operators: readonly Pair<Operator, CanonicalSpan>[])
        {
            this.typeExpressions = typeExpressions;
            this.operators = operators;
        }
    }
}
