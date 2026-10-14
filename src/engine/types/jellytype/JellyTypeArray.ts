// Port of xyz.columnal.jellytype.JellyTypeArray (types module).
// Import JellyType and its subclasses from JellyTypes.ts (which see).
import { javaEquals, javaObjectsHash } from "../../java/JavaObject.js";
import type { Either } from "../../utility-adt/utility/adt/Either.js";
import { DataType } from "../data/datatype/DataType.js";
import type { TypeId } from "../data/datatype/TypeId.js";
import type { TypeManager } from "../data/datatype/TypeManager.js";
import type { Unit } from "../data/unit/Unit.js";
import type { OutputBuilder } from "../loadsave/OutputBuilder.js";
import { TypeExp, type MutVar } from "../typeExp/TypeExps.js";
import type { MutUnitVar } from "../typeExp/units/MutUnitVar.js";
import { JellyType, type JellyTypeVisitorEx } from "./JellyTypes.js";

// Java: package-visible class
export class JellyTypeArray extends JellyType
{
    private readonly inner: JellyType;

    // Java: package-visible
    public constructor(inner: JellyType)
    {
        super();
        this.inner = inner;
    }

    public override makeTypeExp(typeVariables: ReadonlyMap<string, Either<MutUnitVar, MutVar>>): TypeExp
    {
        return TypeExp.list(null, this.inner.makeTypeExp(typeVariables));
    }

    public override makeDataType(typeVariables: ReadonlyMap<string, Either<Unit, DataType>>, mgr: TypeManager): DataType
    {
        return DataType.array(this.inner.makeDataType(typeVariables, mgr));
    }

    public override forNestedTagged(nestedTagged: (typeId: TypeId) => void): void
    {
        this.inner.forNestedTagged(nestedTagged);
    }

    public override apply<R>(visitor: JellyTypeVisitorEx<R>): R
    {
        return visitor.array(this.inner);
    }

    public override save(output: OutputBuilder): void
    {
        output.raw("[");
        this.inner.save(output);
        output.raw("]");
    }

    public override equals(o: unknown): boolean
    {
        if (this === o) return true;
        if (!(o instanceof JellyTypeArray) || o.constructor !== this.constructor) return false;
        return javaEquals(this.inner, o.inner);
    }

    public override hashCode(): number
    {
        return javaObjectsHash(this.inner);
    }
}
