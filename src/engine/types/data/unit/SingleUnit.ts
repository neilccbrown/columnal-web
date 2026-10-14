// Port of xyz.columnal.data.unit.SingleUnit (types module).
import type { UnitIdentifier } from "../../../anns/Annotations.js";
import { javaStringCompare, javaStringHashCode, type Comparable } from "../../../java/JavaObject.js";

export class SingleUnit implements Comparable<SingleUnit>
{
    private readonly unitName: UnitIdentifier;
    private readonly description: string;
    private readonly prefix: string;
    private readonly suffix: string;

    public constructor(unitName: UnitIdentifier, description: string, prefix: string, suffix: string)
    {
        this.unitName = unitName;
        this.description = description;
        this.prefix = prefix;
        this.suffix = suffix;
    }

    public getName(): UnitIdentifier
    {
        return this.unitName;
    }

    public getPrefix(): string
    {
        return this.prefix;
    }

    public getSuffix(): string
    {
        return this.suffix;
    }

    public getDescription(): string
    {
        return this.description;
    }

    public equals(o: unknown): boolean
    {
        if (this === o) return true;
        if (!(o instanceof SingleUnit) || o.constructor !== this.constructor) return false;
        return this.unitName === o.unitName;
    }

    public hashCode(): number
    {
        return javaStringHashCode(this.unitName);
    }

    public toString(): string
    {
        return this.unitName;
    }

    public compareTo(o: SingleUnit): number
    {
        return javaStringCompare(this.unitName, o.unitName);
    }
}
