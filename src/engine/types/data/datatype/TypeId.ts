// Port of xyz.columnal.data.datatype.TypeId (types module).
import type { ExpressionIdentifier, Localized } from "../../../anns/Annotations.js";
import { javaStringCompare, javaStringHashCode, type Comparable } from "../../../java/JavaObject.js";

/**
 * Created by neil on 14/11/2016.
 */
export class TypeId implements Comparable<TypeId>
{
    private readonly typeId: ExpressionIdentifier;

    public constructor(typeId: ExpressionIdentifier)
    {
        this.typeId = typeId;
    }

    public equals(o: unknown): boolean
    {
        if (this === o) return true;
        if (!(o instanceof TypeId) || o.constructor !== this.constructor) return false;
        return this.typeId === o.typeId;
    }

    public hashCode(): number
    {
        return javaStringHashCode(this.typeId);
    }

    public toString(): string
    {
        return this.typeId;
    }

    public getOutput(): string
    {
        return this.typeId;
    }

    public getRaw(): Localized & ExpressionIdentifier
    {
        return this.typeId;
    }

    public compareTo(o: TypeId): number
    {
        return javaStringCompare(this.typeId, o.typeId);
    }
}
