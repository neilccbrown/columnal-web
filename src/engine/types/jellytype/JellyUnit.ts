// Port of xyz.columnal.jellytype.JellyUnit (types module).
import { javaObjectsHash } from "../../java/JavaObject.js";
import { javaParseInt, NumberFormatException } from "../../java/JavaString.js";
import { TreeMap } from "../../java/TreeMap.js";
import { vocabularyOf } from "../../parsers/grammar/Vocabularies.js";
import { UnitLexer } from "../../parsers/generated/UnitLexer.js";
import { UnitParser, type SingleUnitContext, type UnbracketedUnitContext, type UnitContext } from "../../parsers/generated/UnitParser.js";
import { ComparableEither } from "../../utility-adt/utility/adt/ComparableEither.js";
import type { Either } from "../../utility-adt/utility/adt/Either.js";
import { InternalException } from "../../utility-error/error/InternalException.js";
import { IdentifierUtility } from "../../utility/utility/IdentifierUtility.js";
import { Utility } from "../../utility/utility/Utility.js";
import type { DataType } from "../data/datatype/DataType.js";
import type { SingleUnit } from "../data/unit/SingleUnit.js";
import { Unit } from "../data/unit/Unit.js";
import type { UnitManager } from "../data/unit/UnitManager.js";
import type { OutputBuilder } from "../loadsave/OutputBuilder.js";
import type { MutVar } from "../typeExp/TypeExps.js";
import type { MutUnitVar } from "../typeExp/units/MutUnitVar.js";
import { UnitExp } from "../typeExp/units/UnitExp.js";

type JellyUnitKey = ComparableEither<string, SingleUnit>;

export class JellyUnit
{
    // scalar if empty.  Maps single unit variable or unit to power (can be negative, can't be zero)
    private readonly units = new TreeMap<JellyUnitKey, number>();

    // package-visible
    private constructor()
    {
    }

    public static fromConcrete(unit: Unit): JellyUnit
    {
        const u = new JellyUnit();
        for (const [key, value] of unit.getDetails())
            u.units.set(ComparableEither.right<string, SingleUnit>(key), value);
        return u;
    }

    public makeUnitExp(typeVariables: ReadonlyMap<string, Either<MutUnitVar, MutVar>>): UnitExp
    {
        let u = UnitExp.SCALAR;
        for (const [key, value] of this.units)
        {
            u = u.times(key.eitherInt<UnitExp>(name => {
                const v = typeVariables.get(name);
                if (v === undefined)
                    throw new InternalException("Type variable " + name + " not found");
                // PORT-NOTE: as in Java, the power of a unit variable is ignored here
                return new UnitExp(v.getLeft("Variable " + name + " should be type variable but was unit variable"));
                    },
                (single: SingleUnit) => new UnitExp(single).raisedTo(value)));
        }
        return u;
    }

    public makeUnit(typeVariables: ReadonlyMap<string, Either<Unit, DataType>>): Unit
    {
        let u = Unit.SCALAR;
        for (const [key, value] of this.units)
        {
            u = u.times(key.eitherInt<Unit>(name => {
                    const subst = typeVariables.get(name);
                    if (subst === undefined)
                        throw new InternalException("Cannot instantiate unit with variable " + name);
                    return subst.eitherInt<Unit>(unit => unit, _t => {
                        throw new InternalException("Looked for unit variable " + name + " but found type variable with that name instead.");
                    });
                },
                (single: SingleUnit) => new Unit(single).raisedTo(value)));
        }
        return u;
    }

    public divideBy(rhs: JellyUnit): JellyUnit
    {
        return this.times(rhs.raiseBy(-1));
    }

    public times(rhs: JellyUnit): JellyUnit
    {
        const u = new JellyUnit();
        u.units.setAll(this.units);
        for (const [key, value] of rhs.units)
        {
            u.units.merge(key, value, (l, r) => {
                const added = (l + r) | 0;
                return added === 0 ? null : added;
            });
        }
        return u;
    }

    public raiseBy(power: number): JellyUnit
    {
        if (power === 0)
            return new JellyUnit();
        const u = new JellyUnit();
        for (const [s, origPower] of this.units)
            u.units.set(s, Math.imul(origPower, power));
        return u;
    }

    public save(output: OutputBuilder): void
    {
        if (this.units.size === 0)
        {
            output.raw("1");
            return;
        }
        let first = true;
        for (const [key, value] of this.units)
        {
            if (!first)
            {
                output.raw("*");
            }
            first = false;
            key.either(name => output.t(UnitParser.UNITVAR, vocabularyOf(UnitParser)).raw(name),
                u => output.raw(u.getName()));
            if (value !== 1)
            {
                output.raw("^" + value);
            }
        }
    }

    public equals(o: unknown): boolean
    {
        if (this === o) return true;
        if (!(o instanceof JellyUnit) || o.constructor !== this.constructor) return false;
        return this.units.equals(o.units);
    }

    public hashCode(): number
    {
        return javaObjectsHash(this.units);
    }

    public static unitVariable(name: string): JellyUnit
    {
        const u = new JellyUnit();
        u.units.set(ComparableEither.left<string, SingleUnit>(name), 1);
        return u;
    }

    // Java has load(String, UnitManager), load(UnbracketedUnitContext, UnitManager) and private
    // load(UnitContext, UnitManager) and load(SingleUnitContext, UnitManager) (here loadUnit, loadSingleUnit)
    public static load(src: string | UnbracketedUnitContext, mgr: UnitManager): JellyUnit
    {
        if (typeof src === "string")
            return JellyUnit.load(Utility.parseAsOne<UnbracketedUnitContext, UnitParser>(src, s => new UnitLexer(s), t => new UnitParser(t), p => p.unitUse().unbracketedUnit()), mgr);
        const ctx = src;
        let u = JellyUnit.loadUnit(ctx.unit(), mgr);
        const divideBy = ctx.divideBy();
        if (divideBy !== null)
            u = u.divideBy(JellyUnit.loadUnit(divideBy.unit()!, mgr));
        else
        {
            for (const rhs of ctx.timesBy())
            {
                u = u.times(JellyUnit.loadUnit(rhs.unit(), mgr));
            }
        }
        return u;
    }

    private static loadUnit(ctx: UnitContext, mgr: UnitManager): JellyUnit
    {
        const unbracketedUnit = ctx.unbracketedUnit();
        if (unbracketedUnit !== null)
        {
            return JellyUnit.load(unbracketedUnit, mgr);
        }
        else
        {
            const singleItem = ctx.single()!;
            const number = singleItem.NUMBER();
            if (singleItem.singleUnit() === null && number !== null)
            {
                return new JellyUnit();
            }
            else
            {
                const singleUnit = JellyUnit.loadSingleUnit(singleItem.singleUnit()!, mgr);
                if (number !== null)
                {
                    try
                    {
                        return singleUnit.raiseBy(javaParseInt(number.getText()));
                    }
                    catch (e)
                    {
                        if (!(e instanceof NumberFormatException))
                            throw e;
                        // Best default:
                        return singleUnit;
                    }
                }
                else
                {
                    return singleUnit;
                }
            }
        }
    }

    private static loadSingleUnit(ctx: SingleUnitContext, mgr: UnitManager): JellyUnit
    {
        const u = new JellyUnit();
        const unitName = IdentifierUtility.fromParsed(ctx);
        if (ctx.UNITVAR() !== null)
        {
            u.units.set(ComparableEither.left<string, SingleUnit>(unitName), 1);
        }
        else
        {
            u.units.set(ComparableEither.right<string, SingleUnit>(mgr.getDeclared(unitName)), 1);
        }
        return u;
    }

    public getDetails(): TreeMap<JellyUnitKey, number>
    {
        return this.units;
    }

    public isScalar(): boolean
    {
        return this.units.size === 0;
    }

    // For debugging
    public toString(): string
    {
        return "JellyUnit{" +
                "units=" + this.units.toString() +
                "}";
    }
}
