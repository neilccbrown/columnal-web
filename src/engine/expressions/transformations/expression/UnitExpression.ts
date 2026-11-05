// Port of xyz.columnal.transformations.expression.UnitExpression (expressions module).
// Load through UnitExpressions.ts (see "Class hierarchies split across files" in docs/CONVENTIONS.md).
import { javaParseInt, NumberFormatException } from "../../../java/JavaString.js";
import { UnitLexer } from "../../../parsers/generated/UnitLexer.js";
import { UnitParser, type EditBaseContext, type EditRaisedContext, type EditUnbracketedContext } from "../../../parsers/generated/UnitParser.js";
import { Unit } from "../../../types/data/unit/Unit.js";
import type { UnitManager } from "../../../types/data/unit/UnitManager.js";
import type { JellyUnit } from "../../../types/jellytype/JellyUnit.js";
import type { StyledShowable } from "../../../utility-error/styled/StyledShowable.js";
import { StyledString } from "../../../utility-error/styled/StyledString.js";
import { IdentifierUtility } from "../../../utility/utility/IdentifierUtility.js";
import { Utility } from "../../../utility/utility/Utility.js";
import { Expression } from "./Expressions.js";
import type { QuickFix } from "./QuickFix.js";
import type { Replaceable } from "./Replaceable.js";
import { InvalidOperatorUnitExpression, InvalidSingleUnitExpression, SingleUnitExpression, UnitDivideExpression, UnitExpressionIntLiteral, UnitRaiseExpression, UnitTimesExpression } from "./UnitExpressions.js";

export abstract class UnitExpression implements StyledShowable, Replaceable<UnitExpression>
{
    // Java: load(Unit), load(JellyUnit) and load(String)
    public static load(unit: Unit | JellyUnit | string): UnitExpression
    {
        if (typeof unit === "string")
            return UnitExpression.loadText(unit);
        if (unit instanceof Unit)
        {
            const details = [...unit.getDetails()];
            const top: UnitExpression[] = details
                .filter(([_k, v]) => v > 0)
                .map(([k, v]) => {
                    const single = new SingleUnitExpression(k.getName());
                    return v === 1 ? single : new UnitRaiseExpression(single, new UnitExpressionIntLiteral(v));
                });

            const r: UnitExpression = top.length === 0 ? new UnitExpressionIntLiteral(1) : (top.length === 1 ? top[0]! : new UnitTimesExpression(top));

            const bottom: UnitExpression[] = details
                .filter(([_k, v]) => v < 0)
                .map(([k, v]) => {
                    const single = new SingleUnitExpression(k.getName());
                    return v === -1 ? single : new UnitRaiseExpression(single, new UnitExpressionIntLiteral(0 - v));
                });

            if (bottom.length === 0)
                return r;
            else if (bottom.length === 1)
                return new UnitDivideExpression(r, bottom[0]!);
            else
                return new UnitDivideExpression(r, new UnitTimesExpression(bottom));
        }
        else
        {
            const details = [...unit.getDetails()];
            const top: UnitExpression[] = details
                .filter(([_k, v]) => v > 0)
                .map(([k, v]) => {
                    const single: UnitExpression = k.either<UnitExpression>(n => InvalidSingleUnitExpression.identOrUnfinished(n), u => new SingleUnitExpression(u.getName()));
                    return v === 1 ? single : new UnitRaiseExpression(single, new UnitExpressionIntLiteral(v));
                });

            const r: UnitExpression = top.length === 0 ? new UnitExpressionIntLiteral(1) : (top.length === 1 ? top[0]! : new UnitTimesExpression(top));

            const bottom: UnitExpression[] = details
                .filter(([_k, v]) => v < 0)
                .map(([k, v]) => {
                    const single: UnitExpression = k.either<UnitExpression>(n => InvalidSingleUnitExpression.identOrUnfinished(n), u => new SingleUnitExpression(u.getName()));
                    return v === -1 ? single : new UnitRaiseExpression(single, new UnitExpressionIntLiteral(0 - v));
                });

            if (bottom.length === 0)
                return r;
            else if (bottom.length === 1)
                return new UnitDivideExpression(r, bottom[0]!);
            else
                return new UnitDivideExpression(r, new UnitTimesExpression(bottom));
        }
    }

    // We mark as Recorded because constructors require
    // that, even though it's not actually reached GUI yet:
    // PORT-NOTE: Java read the text with the grammar of types' units (unitUse), which lacks the forms the
    // editor saves invalid units in, so they couldn't be loaded; editUnitUse has them too.
    private static loadText(text: string): UnitExpression
    {
        return UnitExpression.loadUnbracketed(Utility.parseAsOne(text, s => new UnitLexer(s), t => new UnitParser(t), p => p.editUnitUse().editUnbracketed()));
    }

    private static loadUnbracketed(ctx: EditUnbracketedContext): UnitExpression
    {
        const operands = ctx.editRaised().map(r => UnitExpression.loadRaised(r));
        if (ctx.DIVIDE() !== null)
            return new UnitDivideExpression(operands[0]!, operands[1]!);
        else if (operands.length > 1)
            return new UnitTimesExpression(operands);
        else
            return operands[0]!;
    }

    private static loadRaised(ctx: EditRaisedContext): UnitExpression
    {
        const base = UnitExpression.loadBase(ctx.editBase());
        const power = ctx.editRaised();
        if (power === null)
            return base;
        // A number as the power is loaded as Java did:
        const number = power.editRaised() === null ? power.editBase().NUMBER() : null;
        if (number !== null)
        {
            try
            {
                return new UnitRaiseExpression(base, new UnitExpressionIntLiteral(javaParseInt(number.getText())));
            }
            catch (e)
            {
                if (!(e instanceof NumberFormatException))
                    throw e;
                return new UnitRaiseExpression(base, new InvalidSingleUnitExpression(number.getText()));
            }
        }
        return new UnitRaiseExpression(base, UnitExpression.loadRaised(power));
    }

    private static loadBase(ctx: EditBaseContext): UnitExpression
    {
        const singleUnit = ctx.singleUnit();
        const unbracketed = ctx.editUnbracketed();
        const invalidOps = ctx.invalidOps();
        const unfinished = ctx.unfinished();
        if (singleUnit !== null)
        {
            // TODO we need to support unit variables here.
            return new SingleUnitExpression(IdentifierUtility.fromParsed(singleUnit));
        }
        else if (unbracketed !== null)
            return UnitExpression.loadUnbracketed(unbracketed);
        else if (invalidOps !== null)
            return new InvalidOperatorUnitExpression(invalidOps.editUnbracketed().map(u => UnitExpression.loadUnbracketed(u)));
        else if (unfinished !== null)
            return new InvalidSingleUnitExpression(unfinished.STRING().getText());
        try
        {
            return new UnitExpressionIntLiteral(javaParseInt(ctx.NUMBER()!.getText()));
        }
        catch (e)
        {
            if (!(e instanceof NumberFormatException))
                throw e;
            // Zero is guaranteed to be an error, so best default:
            return new UnitExpressionIntLiteral(0);
        }
    }

    public abstract asUnit(unitManager: UnitManager): JellyUnit;

    public abstract save(saveDestination: Expression.SaveDestination, topLevel: boolean): string;

    public toStyledString(): StyledString
    {
        return StyledString.s(this.save(Expression.SaveDestination.TO_STRING, true));
    }

    public abstract hashCode(): number;

    public abstract equals(obj: unknown): boolean;

    public abstract isEmpty(): boolean;

    /**
     * Is this the integer literal 1 ?
     */
    public abstract isScalar(): boolean;

    public abstract replaceSubExpression(toReplace: UnitExpression, replaceWith: UnitExpression): UnitExpression;

    public toString(): string
    {
        return this.save(Expression.SaveDestination.TO_STRING, true);
    }
}

export namespace UnitExpression
{
    // Java: a checked Exception (not a UserException)
    export class UnitLookupException extends Error
    {
        public readonly errorMessage: StyledString | null;
        public readonly errorItem: UnitExpression;
        public readonly quickFixes: readonly QuickFix<UnitExpression>[];

        public constructor(errorMessage: StyledString | null, errorItem: UnitExpression, quickFixes: readonly QuickFix<UnitExpression>[])
        {
            super(errorMessage === null ? undefined : errorMessage.toPlain());
            this.name = "UnitLookupException";
            this.errorMessage = errorMessage;
            this.errorItem = errorItem;
            this.quickFixes = quickFixes;
        }
    }
}
