// Port of xyz.columnal.gui.lexeditor.UnitSaver (lex-editor module).
import type { CanonicalLocation, LocalizableKey, Localized } from "../../../../engine/anns/Annotations.js";
import { CanonicalSpan } from "../../../../engine/expressions/transformations/expression/CanonicalSpan.js";
import { InvalidOperatorUnitExpression, InvalidSingleUnitExpression, SingleUnitExpression, UnitDivideExpression, UnitExpressionIntLiteral, UnitRaiseExpression, UnitTimesExpression, type UnitExpression } from "../../../../engine/expressions/transformations/expression/UnitExpressions.js";
import type { TypeManager } from "../../../../engine/types/data/datatype/TypeManager.js";
import { Either } from "../../../../engine/utility-adt/utility/adt/Either.js";
import { Pair } from "../../../../engine/utility-adt/utility/adt/Pair.js";
import type { StyledShowable } from "../../../../engine/utility-error/styled/StyledShowable.js";
import { StyledString } from "../../../../engine/utility-error/styled/StyledString.js";
import { TranslationUtility } from "../../../../engine/utility/utility/TranslationUtility.js";
import { Utility } from "../../../../engine/utility/utility/Utility.js";
import type { InsertListener } from "../../../lex-editor-completion/gui/lexeditor/completion/InsertListener.js";
import type { EditorLocationAndErrorRecorder } from "./EditorLocationAndErrorRecorder.js";
import { SaverBase } from "./SaverBase.js";
import { UnitLexer } from "./UnitLexer.js";

type UnitOp = UnitLexer.UnitOp;
type UnitBracket = UnitLexer.UnitBracket;
// Java: Void, as there is no bracket content for units
type Void = never;

export class UnitSaver extends SaverBase<UnitExpression, UnitSaver, UnitOp, UnitBracket, Void>// implements ErrorAndTypeRecorder
{
    // Java: FXUtility.getDataFormat("application/records-type")
    public static readonly UNIT_CLIPBOARD_TYPE = "application/records-type";

    /** @internal Java: package-visible */
    public readonly OPERATORS: readonly SaverBase.OperatorExpressionInfo<UnitExpression, UnitSaver, UnitOp, Void>[] = [
        SaverBase.OperatorExpressionInfo.narySimple<UnitExpression, UnitSaver, UnitOp, Void>(this, [UnitLexer.UnitOp.MULTIPLY], UnitSaver.makeTimes),
        SaverBase.OperatorExpressionInfo.binary<UnitExpression, UnitSaver, UnitOp, Void>(UnitLexer.UnitOp.DIVIDE, UnitSaver.makeDivide),
        SaverBase.OperatorExpressionInfo.binary<UnitExpression, UnitSaver, UnitOp, Void>(UnitLexer.UnitOp.RAISE, UnitSaver.makeRaise),
    ];

    private static makeTimes(expressions: readonly UnitExpression[], _operators: readonly Pair<UnitOp, CanonicalSpan>[]): UnitExpression
    {
        return new UnitTimesExpression(expressions);
    }

    private static makeDivide(lhs: UnitExpression, _opNode: CanonicalSpan, rhs: UnitExpression): UnitExpression
    {
        return new UnitDivideExpression(lhs, rhs);
    }

    private static makeRaise(lhs: UnitExpression, _opNode: CanonicalSpan, rhs: UnitExpression): UnitExpression
    {
        return new UnitRaiseExpression(lhs, rhs);
    }

    public override expectSingle(_locationRecorder: EditorLocationAndErrorRecorder, location: CanonicalSpan): SaverBase.BracketAndNodes<UnitExpression, UnitSaver, Void, UnitExpression>
    {
        return new SaverBase.BracketAndNodes<UnitExpression, UnitSaver, Void, UnitExpression>({
            apply(_items: Void): UnitExpression | null
            {
                // Should not be possible anyway
                throw new Error("IllegalStateException");
            },

            applySingle(singleItem: UnitExpression): UnitExpression
            {
                return singleItem;
            },
        }, location, []);
    }

    //UnitManager getUnitManager();


    public constructor(typeManager: TypeManager, insertListener: InsertListener)
    {
        super(typeManager, insertListener);
    }

    public override makeExpression<R extends StyledShowable>(content: readonly Either<UnitExpression, SaverBase.OpAndNode<UnitOp>>[], brackets: SaverBase.BracketAndNodes<UnitExpression, UnitSaver, Void, R>, innerContentLocation: CanonicalLocation, terminatorDescription: string | null): R
    {
        if (content.length === 0)
        {
            if (terminatorDescription !== null)
                this.locationRecorder.addErrorAndFixes(new CanonicalSpan(innerContentLocation, innerContentLocation), StyledString.s("Missing expression before " + terminatorDescription), []);
            return brackets.applyBrackets.applySingle(this.record(brackets.location, new InvalidOperatorUnitExpression([])));
        }
        const location = CanonicalSpan.fromTo(this.getLocationForEither(content[0]!), this.getLocationForEither(content[content.length - 1]!));

        const collectedItems = this.processItems(content);

        if (collectedItems.isValid())
        {
            const validOperands = collectedItems.getValidOperands();
            const validOperators = collectedItems.getValidOperators();

            // Single expression?
            if (validOperands.length === 1 && validOperators.length === 0)
                return brackets.applyBrackets.applySingle(validOperands[0]!);

            // Raise is a special case as it doesn't need to be bracketed:
            for (let i = 0; i < validOperators.length; i++)
            {
                if (validOperators[i]!.op === UnitLexer.UnitOp.RAISE)
                {
                    if (validOperands[i] instanceof SingleUnitExpression && i + 1 < validOperands.length && validOperands[i + 1] instanceof UnitExpressionIntLiteral)
                    {
                        validOperators.splice(i, 1);
                        const power = validOperands.splice(i + 1, 1)[0] as UnitExpressionIntLiteral;
                        const recorder = this.locationRecorder.recorderFor(validOperands[i]!);
                        validOperands[i] = this.record(CanonicalSpan.fromTo(recorder, this.locationRecorder.recorderFor(power)), new UnitRaiseExpression(validOperands[i]!, power));
                    }
                }
            }

            // Now we need to check the operators can work together as one group:
            const e: R | null = this.makeExpressionWithOperators([this.OPERATORS], this.locationRecorder, (arg: readonly Either<SaverBase.OpAndNode<UnitOp>, UnitExpression>[]) =>
                    brackets.applyBrackets.applySingle(this.makeInvalidOp(brackets.location, arg))
                , [...validOperands], [...validOperators], brackets);
            if (e !== null)
            {
                return e;
            }

        }

        return brackets.applyBrackets.applySingle(collectedItems.makeInvalid(location, items => new InvalidOperatorUnitExpression(items)));
    }

    public override opToInvalid(unitOp: UnitOp): UnitExpression
    {
        return new InvalidSingleUnitExpression(unitOp.getContent());
    }

    public override canBeUnary(_operator: SaverBase.OpAndNode<UnitOp>, _followingOperand: UnitExpression): (() => UnitExpression) | null
    {
        return null;
    }

    public override makeInvalidOp(location: CanonicalSpan, items: readonly Either<SaverBase.OpAndNode<UnitOp>, UnitExpression>[]): UnitExpression
    {
        return this.locationRecorder.record(location, new InvalidOperatorUnitExpression(Utility.mapListI(items, x => x.either<UnitExpression>(op => this.locationRecorder.record(op.sourceNode, new InvalidSingleUnitExpression(op.op.getContent())), y => y))));
    }

    // Unused, as in Java
    public static opD(op: UnitOp, key: LocalizableKey): Pair<UnitOp, Localized>
    {
        return new Pair(op, TranslationUtility.getString(key));
    }

    public saveBracket(bracket: UnitBracket, errorDisplayer: CanonicalSpan): void
    {
        // eslint-disable-next-line @typescript-eslint/no-this-alias
        const saver = this;
        if (bracket === UnitLexer.UnitBracket.OPEN_ROUND)
        {
            this.currentScopes.push(new SaverBase.Scope<UnitExpression, UnitOp, UnitBracket, Void>(errorDisplayer, new class extends SaverBase.Terminator<UnitExpression, UnitSaver, UnitBracket, Void>
            {
                public override terminate(makeContent: SaverBase.FetchContent<UnitExpression, UnitSaver, Void>, terminator: UnitBracket | null, keywordErrorDisplayer: CanonicalSpan): boolean
                {
                    const brackets = saver.expectSingle(saver.locationRecorder, CanonicalSpan.fromTo(errorDisplayer, keywordErrorDisplayer));
                    if (terminator === UnitLexer.UnitBracket.CLOSE_ROUND)
                    {
                        // All is well:
                        const result: UnitExpression = makeContent(brackets);
                        saver.peekScope().items.push(Either.left(result));
                    }
                    else
                    {
                        // Error!
                        saver.locationRecorder.addErrorAndFixes(keywordErrorDisplayer, StyledString.concat(StyledString.s("Missing ) before "), terminator === null ? StyledString.s("end") : terminator.toStyledString()), []);
                        // Important to call makeContent before adding to scope on the next line:
                        const items: UnitExpression[] = [];
                        items.push(saver.record(errorDisplayer, new InvalidSingleUnitExpression(bracket.getContent())));
                        items.push(makeContent(brackets));
                        if (terminator !== null)
                            items.push(saver.record(errorDisplayer, new InvalidSingleUnitExpression(terminator.getContent())));
                        const invalid = saver.record(CanonicalSpan.fromTo(brackets.location, keywordErrorDisplayer), new InvalidOperatorUnitExpression(items));
                        saver.peekScope().items.push(Either.left(invalid));
                    }
                    return true;
                }
            }(")")));
        }
        else
        {
            const cur = this.currentScopes.pop()!;
            if (this.currentScopes.length === 0)
            {
                this.addTopLevelScope();
            }
            cur.terminator.terminate(<R extends StyledShowable>(brackets: SaverBase.BracketAndNodes<UnitExpression, UnitSaver, Void, R>): R =>
            {
                return this.makeExpression<R>(cur.items, brackets, cur.openingNode.end, cur.terminator.terminatorDescription);
            }, bracket, errorDisplayer);
        }
    }

    public override keywordToInvalid(unitBracket: UnitBracket): UnitExpression
    {
        return new InvalidSingleUnitExpression(unitBracket.getContent());
    }

    public override recorderFor(unitExpression: UnitExpression): CanonicalSpan
    {
        return this.locationRecorder.recorderFor(unitExpression);
    }

    public override unclosedBrackets(closed: SaverBase.BracketAndNodes<UnitExpression, UnitSaver, Void, UnitExpression>): SaverBase.BracketAndNodes<UnitExpression, UnitSaver, Void, UnitExpression>
    {
        return new SaverBase.BracketAndNodes<UnitExpression, UnitSaver, Void, UnitExpression>({
            apply(_items: Void): UnitExpression | null
            {
                // Can't happen
                throw new Error("IllegalStateException");
            },

            applySingle(singleItem: UnitExpression): UnitExpression
            {
                return singleItem;
            },
        }, closed.location, [closed.applyBrackets]);
    }
}
