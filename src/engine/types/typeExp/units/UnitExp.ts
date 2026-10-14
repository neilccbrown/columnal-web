// Port of xyz.columnal.typeExp.units.UnitExp (types module).
import { javaObjectsHash } from "../../../java/JavaObject.js";
import { TreeMap } from "../../../java/TreeMap.js";
import { ComparableEither } from "../../../utility-adt/utility/adt/ComparableEither.js";
import { Pair } from "../../../utility-adt/utility/adt/Pair.js";
import { StyledString } from "../../../utility-error/styled/StyledString.js";
import type { StyledShowable } from "../../../utility-error/styled/StyledShowable.js";
import type { SingleUnit } from "../../data/unit/SingleUnit.js";
import { Unit } from "../../data/unit/Unit.js";
import { MutUnitVar } from "./MutUnitVar.js";

type UnitKey = ComparableEither<MutUnitVar, SingleUnit>;

// Java int division (truncates towards zero):
function intDiv(a: number, b: number): number
{
    return Math.trunc(a / b) | 0;
}

/**
 * As per "Types for Units-of-Measure: Theory and Practice" by Kennedy (CEFP '09),
 * and similar to our own xyz.columnal.data.unit.Unit class, a unit expression is
 * a map from units to non-zero integer powers, the difference here being simply that
 * a type can either be a concrete defined type, or a type variable awaiting inference.
 */
export class UnitExp implements StyledShowable
{
    // scalar if empty.  Maps single unit to power (can be negative, can't be zero)
    // A long is a type variable.
    private readonly units = new TreeMap<UnitKey, number>();

    // Java has a private no-argument constructor and public (MutUnitVar) and (SingleUnit) ones.
    public constructor(single?: MutUnitVar | SingleUnit)
    {
        if (single instanceof MutUnitVar)
            this.units.set(ComparableEither.left(single), 1);
        else if (single !== undefined)
            this.units.set(ComparableEither.right(single), 1);
    }

    public static readonly SCALAR = new UnitExp();

    public times(rhs: UnitExp): UnitExp
    {
        const u = new UnitExp();
        u.units.setAll(this.units);
        u.timesInPlace(rhs);
        return u;
    }

    private timesInPlace(rhs: UnitExp): void
    {
        for (const [key, value] of rhs.units)
        {
            this.units.merge(key, value, (l, r) => {
                return UnitExp.addButZeroIsNull(l, r);
            });
        }
    }

    private static addButZeroIsNull(l: number, r: number): number | null
    {
        const added = (l + r) | 0;
        return added === 0 ? null : added;
    }

    public divideBy(rhs: UnitExp): UnitExp
    {
        return this.times(rhs.reciprocal());
    }

    public reciprocal(): UnitExp
    {
        const u = new UnitExp();
        for (const [key, value] of this.units)
        {
            u.units.set(key, -value | 0);
        }
        return u;
    }

    public raisedTo(power: number): UnitExp
    {
        if (power === 0)
            return UnitExp.SCALAR;
        const u = new UnitExp();
        for (const [s, origPower] of this.units)
            u.units.set(s, Math.imul(origPower, power));
        return u;
    }

    public unifyWith(other: UnitExp): UnitExp | null
    {
        // Here's my understanding of "Types for Units-of-Measure: Theory and Practice" by Kennedy (CEFP '09)
        // section 3.5/Figure 5.  First we invert one side and multiply together, then attempt to unify to one:
        const aimingForOne = new UnitExp();
        aimingForOne.units.setAll(this.units);
        other.units.forEach((v, k) =>
            // Very important: minus v to multiply by inverse of RHS:
            aimingForOne.units.merge(k, -v | 0, UnitExp.addButZeroIsNull));
        if (aimingForOne.unifyToOne())
        {
            this.substituteMutVars();
            other.substituteMutVars();
            return this;
        }
        else
            return null;
    }

    // Makes sure all MutVar that point to a resolution get removed from the map
    private substituteMutVars(): void
    {
        let substituted: boolean;
        do
        {
            substituted = false;
            for (const [key, value] of this.units)
            {
                const pointer = key.either<UnitExp | null>(mut => mut.pointer, _s => null);
                if (pointer !== null)
                {
                    // Must remove before doing times in place, otherwise modification exception:
                    // In turn, must take value before removal because entry.getValue() is not valid after iterator removal:
                    this.units.delete(key);
                    this.timesInPlace(pointer.raisedTo(value));
                    substituted = true;
                    // Breaks the for/iterator loop
                    break;
                }
            }
        }
        while (substituted);
    }

    /**
     * Note: this function modifies the current object.  Only call it on a temporary item.
     */
    private unifyToOne(): boolean
    {
        // Make sure any mut vars involved are pointing to null (substitute if not):
        this.substituteMutVars();

        // Continuing in Figure 5: we already have the normal form, although not neatly separated
        // into type vars and normal, and not sorted by power value.

        // If no type vars and no normal vars then unification was perfect and resulted in scalar,
        // so no type vars to resolve:
        if (this.units.size === 0)
            return true;

        const typeVars: Pair<MutUnitVar, number>[] = [...this.units.entries()].flatMap(([k, v]) => k.either<Pair<MutUnitVar, number>[]>(mut => [new Pair(mut, v)], _fixed => []));

        // If no type vars (and not empty overall) then we can't unify to one: fail
        if (typeVars.length === 0)
            return false;

        // If one type var, it needs to divide all the remaining fixed units:
        if (typeVars.length === 1)
        {
            const powerOfTypeVar = typeVars[0]!.getSecond();
            if ([...this.units.entries()].filter(([k]) => k.isRight()).every(([_k, v]) => Math.abs(v) % Math.abs(powerOfTypeVar) === 0))
            {
                // It does divide all remaining fixed units: Do it!
                const result = new UnitExp();
                this.units.forEach((v, k) => {
                    k.either_(_var => {}, singleUnit => result.units.set(ComparableEither.right(singleUnit), intDiv(-v, powerOfTypeVar)));
                });
                typeVars[0]!.getFirst().pointer = result;
                return true;
            }
            else // Otherwise, we have e.g. A^2 = m^3, which we can't solve because we require integer exponents.
                return false;
        }

        // Otherwise, we perform a mapping so that all other variables except the lowest absolute-power
        // type variable become modulo that power.  Here's an example:
        // Imagine we have (capital letters are type variables, lower case are actual units:
        //   A^2 B^7 m^2 s^-7 = 1
        // We can perform a subsitution for a new variable by taking the lowest-exponent type variable and substituting
        // it for an equation that cancels out the rest usefully.  What the paper says is that the new variable will
        // be equal to the lowest-exponent type variable, multiplied by the negated floor division of the rest by that lowest-exponent.
        // In our example, this means:
        //   A = C^1 B^-3 m^-1 s^3
        // Therefore when raised to A's current power (the lowest exponent):
        //   A^2 = C^2 B^-6 m^-2 s^6
        // And once substituted, it effectively makes all exponents be modulo the lowest-exponent:
        //   (C^2 B^-6 m^-2 s^6) (B^7 m^2 s^-7) = 1
        //   C^2 B^1 s^-1 = 1
        // Now we go again, with B having lowest exponent:
        //   B = D^1 C^-2 s^1
        // Substituting:
        //   (D^1 C^-2 s^1) (C^2 s^-1) = 1
        //   D = 1
        // Then we will go into a different clause.

        // The main question I have is: how do we get the value for C, given that we eliminated it from the equations without substituting?
        // We can't ignore it because both A and B depend on C.  I think the answer is that after all unit inference, if inference
        // is successful, all units that point to nothing can be set to scalar.

        // Java: Stream.min, which keeps the first of equal minimums
        let lowestAbsPower: Pair<MutUnitVar, number> | null = null;
        for (const p of typeVars)
        {
            if (lowestAbsPower === null || Math.abs(p.getSecond()) < Math.abs(lowestAbsPower.getSecond()))
                lowestAbsPower = p;
        }
        if (lowestAbsPower === null)
            // Impossible!  We know typeVars.size() > 1 at this point
            return false;

        const newVar = new MutUnitVar();
        // Get rid of old unit:
        this.units.delete(ComparableEither.left<MutUnitVar, SingleUnit>(lowestAbsPower.getFirst()));
        // Ready new subsitution, but only insert at end (don't want to adjust its powers):
        const subst = new UnitExp();
        subst.units.set(ComparableEither.left(newVar), 1);
        // All others get the negated floored division:
        const divisor = lowestAbsPower.getSecond();
        this.units.forEach((v, k) => subst.units.set(k, -intDiv(v, divisor) | 0));
        lowestAbsPower.getFirst().pointer = subst;
        for (const [key, value] of this.units)
        {
            // Guava's IntMath.mod: a non-negative result
            const m = Math.abs(lowestAbsPower.getSecond());
            const mod = ((value % m) + m) % m;
            if (mod === 0)
            {
                this.units.delete(key);
            }
            else
                this.units.set(key, mod);
        }
        // Having removed old var, put new var in with same power:
        this.units.set(ComparableEither.left(newVar), lowestAbsPower.getSecond());
        // Round we go again:
        return this.unifyToOne();
    }

    public toConcreteUnit(): Unit | null
    {
        this.substituteMutVars();
        let u = Unit.SCALAR;
        for (const [key, value] of this.units)
        {
            const multiplier = key.either<Unit | null>(_l => null, singleUnit => new Unit(singleUnit).raisedTo(value));
            if (multiplier === null)
                return null;
            u = u.times(multiplier);
        }
        return u;
    }

    public static fromConcrete(unit: Unit): UnitExp
    {
        const unitExp = new UnitExp();
        for (const [key, value] of unit.getDetails())
        {
            unitExp.units.set(ComparableEither.right(key), value);
        }
        return unitExp;
    }

    public static makeVariable(): UnitExp
    {
        const unitExp = new UnitExp();
        unitExp.units.set(ComparableEither.left(new MutUnitVar()), 1);
        return unitExp;
    }

    public toStyledString(): StyledString
    {
        const topContent: StyledString[] = [];
        // First add positives:
        let pos = 0;
        let neg = 0;
        this.units.forEach((p, u) => {
            if (p >= 1)
            {
                if (p > 1)
                    topContent.push(StyledString.concat(UnitExp.etoString(u), StyledString.s("^" + p)));
                else
                    topContent.push(UnitExp.etoString(u));
                pos += 1;
            }
            else if (p < 0)
            {
                neg += 1;
            }
        });
        if (pos === 0 && neg === 0)
            return StyledString.s("1");
        const content: StyledString[] = [];
        content.push(StyledString.intercalate(StyledString.s("*"), topContent));
        if (neg === 0)
        {
            return StyledString.concat(...content);
        }
        else
        {
            if (pos > 1)
            {
                // Need to bracket the top:
                content.unshift(StyledString.s("("));
                content.push(StyledString.s(")"));
            }
            const bottom: StyledString[] = [];
            const showAsNegative = pos === 0;
            this.units.forEach((p, u) =>
            {
                if (p < -1 || (p === -1 && showAsNegative))
                    bottom.push(StyledString.concat(UnitExp.etoString(u), StyledString.s("^" + (showAsNegative ? p : -p))));
                else if (p === -1)
                    bottom.push(UnitExp.etoString(u));
            });
            if (showAsNegative)
                return StyledString.intercalate(StyledString.s("*"), bottom);
            else if (neg > 1)
            {
                content.push(StyledString.s("/("));
                content.push(...bottom);
                content.push(StyledString.s(")"));
            }
            else
            {
                content.push(StyledString.s("/"));
                content.push(...bottom);
            }
            return StyledString.concat(...content);
        }
    }

    private static etoString(u: UnitKey): StyledString
    {
        return u.either(mut => mut.toStyledString(), singleUnit => StyledString.s(singleUnit.getName()));
    }

    public equals(o: unknown): boolean
    {
        if (this === o) return true;
        if (!(o instanceof UnitExp) || o.constructor !== this.constructor) return false;
        return this.units.equals(o.units);
    }

    public hashCode(): number
    {
        return javaObjectsHash(this.units);
    }

    public isOnlyVars(): boolean
    {
        return [...this.units.keys()].every(k => k.isLeft());
    }

    public toString(): string
    {
        return this.toStyledString().toPlain();
    }
}
