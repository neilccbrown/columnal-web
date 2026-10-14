// Port of xyz.columnal.data.unit.UnitDeclaration (types module).
import { javaEquals, javaObjectsHash } from "../../../java/JavaObject.js";
import type { Rational } from "../../../java/Rational.js";
import type { Pair } from "../../../utility-adt/utility/adt/Pair.js";
import type { SingleUnit } from "./SingleUnit.js";
import { Unit } from "./Unit.js";

/**
 * Created by neil on 09/12/2016.
 */
export class UnitDeclaration
{
    private readonly definedUnit: SingleUnit;
    private readonly equivalentTo: Pair<Rational, Unit> | null;
    private readonly cachedSingleUnit: Unit;
    private readonly category: string;

    public constructor(definedUnit: SingleUnit, equivalentTo: Pair<Rational, Unit> | null, category: string)
    {
        this.definedUnit = definedUnit;
        this.equivalentTo = equivalentTo;
        this.cachedSingleUnit = new Unit(definedUnit);
        this.category = category;
    }

    public getDefined(): SingleUnit
    {
        return this.definedUnit;
    }

    public getUnit(): Unit
    {
        return this.cachedSingleUnit;
    }

    public getEquivalentTo(): Pair<Rational, Unit> | null
    {
        return this.equivalentTo;
    }

    // Needed for testing:
    public equals(o: unknown): boolean
    {
        if (this === o) return true;
        if (!(o instanceof UnitDeclaration) || o.constructor !== this.constructor) return false;
        return javaEquals(this.definedUnit, o.definedUnit) &&
                javaEquals(this.equivalentTo, o.equivalentTo);
    }

    public hashCode(): number
    {
        return javaObjectsHash(this.definedUnit, this.equivalentTo);
    }

    public toString(): string
    {
        return "UnitDeclaration{" +
                "definedUnit=" + String(this.definedUnit) +
                ", equivalentTo=" + String(this.equivalentTo) +
                "}";
    }

    public getCategory(): string
    {
        return this.category;
    }
}
