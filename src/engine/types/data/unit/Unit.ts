// Port of xyz.columnal.data.unit.Unit (types module).
import type { ReadonlyMapLike } from "../../../java/HashMap.js";
import type { Rational } from "../../../java/Rational.js";
import { TreeMap } from "../../../java/TreeMap.js";
import { UserException } from "../../../utility-error/error/UserException.js";
import type { SingleUnit } from "./SingleUnit.js";
import type { UnitManager } from "./UnitManager.js";

/**
 * Created by neil on 09/12/2016.
 */
export class Unit
{
    // scalar if empty.  Maps single unit to power (can be negative, can't be zero)
    private readonly units = new TreeMap<SingleUnit, number>();

    // Java has a public (SingleUnit) constructor and a private no-argument one.
    public constructor(singleUnit?: SingleUnit)
    {
        if (singleUnit !== undefined)
            this.units.set(singleUnit, 1);
    }

    public static readonly SCALAR = new Unit();

    public times(rhs: Unit): Unit
    {
        const u = new Unit();
        u.units.setAll(this.units);
        for (const [key, value] of rhs.units)
        {
            u.units.merge(key, value, (l, r) => {
                // Java int arithmetic:
                const added = (l + r) | 0;
                return added === 0 ? null : added;
            });
        }
        return u;
    }

    public divideBy(rhs: Unit): Unit
    {
        return this.times(rhs.reciprocal());
    }

    public raisedTo(power: number): Unit
    {
        if (power === 0)
            return Unit.SCALAR;
        const u = new Unit();
        for (const [s, origPower] of this.units)
            u.units.set(s, Math.imul(origPower, power));
        return u;
    }

    public rootedBy(root: number): Unit
    {
        const u = new Unit();
        for (const [key, value] of this.units)
        {
            if (value % root !== 0)
            {
                throw new UserException("Cannot root unit " + String(key) + "^" + value + " by " + root);
            }
            u.units.set(key, (value / root) | 0);
        }
        return u;
    }

    public getDisplayPrefix(): string
    {
        if (this.units.size === 1)
        {
            const [key, value] = this.units.entries().next().value!;
            if (value === 1)
                return key.getPrefix();
        }
        return "";
    }

    public getDisplaySuffix(): string
    {
        if (this.units.size === 1)
        {
            const [key, value] = this.units.entries().next().value!;
            if (value === 1)
                return key.getSuffix();
        }
        return "";
    }

    public toString(): string
    {
        const top: string[] = [];
        // First add positives:
        let pos = 0;
        this.units.forEach((p, u) => {
            if (p >= 1)
            {
                if (p > 1)
                    top.push(u.toString() + "^" + p);
                else
                    top.push(u.toString());
                pos += 1;
            }
        });
        const neg = this.units.size - pos;
        let allUnits = pos > 1 ? "(" + top.join("*") + ")" : top.join("*");
        if (allUnits === "")
            allUnits = "1";
        if (neg > 0)
        {
            const bottom: string[] = [];
            this.units.forEach((p, u) =>
            {
                if (p < -1)
                    bottom.push(u.toString() + "^" + (-p));
                else if (p === -1)
                    bottom.push(u.toString());
            });
            if (neg > 1)
                allUnits += "/(" + bottom.join("*") + ")";
            else
                allUnits += "/" + bottom.join("*");
        }
        return allUnits;
    }

    public forDisplay(): string
    {
        if (this.units.size === 0)
            return "";
        else
            return this.toString();
    }

    public equals(o: unknown): boolean
    {
        if (this === o) return true;
        if (!(o instanceof Unit) || o.constructor !== this.constructor) return false;
        return this.units.equals(o.units);
    }

    public hashCode(): number
    {
        return this.units.hashCode();
    }

    public reciprocal(): Unit
    {
        const u = new Unit();
        for (const [key, value] of this.units)
        {
            u.units.set(key, -value | 0);
        }
        return u;
    }

    // If this unit can scale to that one, return the multiplier needed to convert
    // If conversion not possible, return empty.
    public canScaleTo(unit: Unit, mgr: UnitManager): Rational | null
    {
        const thisCanon = mgr.canonicalise(this);
        const otherCanon = mgr.canonicalise(unit);
        if (!thisCanon.getSecond().units.equals(otherCanon.getSecond().units))
            return null;
        else
            return thisCanon.getFirst().divides(otherCanon.getFirst());
    }

    public getDetails(): ReadonlyMapLike<SingleUnit, number>
    {
        return this.units;
    }

    public static _test_make(...params: (SingleUnit | number)[]): Unit
    {
        const u = new Unit();
        for (let i = 0; i < params.length; i += 2)
        {
            const unit = params[i] as SingleUnit;
            if (u.units.has(unit))
            {
                throw new Error("Duplicate unit: " + String(unit));
            }
            u.units.set(unit, params[i + 1] as number);
        }
        return u;
    }
}
