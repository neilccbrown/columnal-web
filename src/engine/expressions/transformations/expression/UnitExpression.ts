// Port of xyz.columnal.transformations.expression.UnitExpression (expressions module).
// Load through UnitExpressions.ts (see "Class hierarchies split across files" in docs/CONVENTIONS.md).
import { javaParseInt, NumberFormatException } from "../../../java/JavaString.js";
import { UnitLexer } from "../../../parsers/generated/UnitLexer.js";
import { UnitParser, type UnbracketedUnitContext, type UnitContext } from "../../../parsers/generated/UnitParser.js";
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
import { InvalidSingleUnitExpression, SingleUnitExpression, UnitDivideExpression, UnitExpressionIntLiteral, UnitRaiseExpression, UnitTimesExpression } from "./UnitExpressions.js";

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
    private static loadText(text: string): UnitExpression
    {
        return UnitExpression.loadUnbracketed(Utility.parseAsOne(text, s => new UnitLexer(s), t => new UnitParser(t), p => p.unitUse().unbracketedUnit()));
    }

    private static loadUnit(ctx: UnitContext): UnitExpression
    {
        const unbracketed = ctx.unbracketedUnit();
        if (unbracketed !== null)
        {
            return UnitExpression.loadUnbracketed(unbracketed);
        }
        else
        {
            const singleItem = ctx.single()!;
            const singleItemUnit = singleItem.singleUnit();
            const number = singleItem.NUMBER();
            if (singleItemUnit === null && number !== null)
            {
                try
                {
                    return new UnitExpressionIntLiteral(javaParseInt(number.getText()));
                }
                catch (e)
                {
                    if (!(e instanceof NumberFormatException))
                        throw e;
                    // Zero is guaranteed to be an error, so best default:
                    return new UnitExpressionIntLiteral(0);
                }
            }
            else
            {
                // TODO we need to support unit variables here.
                const singleUnit = new SingleUnitExpression(IdentifierUtility.fromParsed(singleItemUnit!));
                if (number !== null)
                {
                    try
                    {
                        return new UnitRaiseExpression(singleUnit, new UnitExpressionIntLiteral(javaParseInt(number.getText())));
                    }
                    catch (e)
                    {
                        if (!(e instanceof NumberFormatException))
                            throw e;
                        return new UnitRaiseExpression(singleUnit, new InvalidSingleUnitExpression(number.getText()));
                    }
                }
                else
                {
                    return singleUnit;
                }
            }
        }
    }

    private static loadUnbracketed(ctx: UnbracketedUnitContext): UnitExpression
    {
        const divideBy = ctx.divideBy();
        if (divideBy !== null)
        {
            return new UnitDivideExpression(UnitExpression.loadUnit(ctx.unit()), UnitExpression.loadUnit(divideBy.unit()!));
        }
        else if (ctx.timesBy().length > 0)
        {
            return new UnitTimesExpression([ctx.unit(), ...ctx.timesBy().map(t => t.unit())].map(c => UnitExpression.loadUnit(c)));
        }
        else
        {
            return UnitExpression.loadUnit(ctx.unit());
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
