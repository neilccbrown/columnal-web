// Port of xyz.columnal.jellytype.JellyTypeFunction (types module).
// Import JellyType and its subclasses from JellyTypes.ts (which see).
import { javaEquals, javaObjectsHash } from "../../java/JavaObject.js";
import type { Either } from "../../utility-adt/utility/adt/Either.js";
import { Utility } from "../../utility/utility/Utility.js";
import { DataType } from "../data/datatype/DataType.js";
import type { TypeId } from "../data/datatype/TypeId.js";
import type { TypeManager } from "../data/datatype/TypeManager.js";
import type { Unit } from "../data/unit/Unit.js";
import type { OutputBuilder } from "../loadsave/OutputBuilder.js";
import { TypeExp, type MutVar } from "../typeExp/TypeExps.js";
import type { MutUnitVar } from "../typeExp/units/MutUnitVar.js";
import { JellyType, type JellyTypeVisitorEx } from "./JellyTypes.js";

// Java: package-visible class
export class JellyTypeFunction extends JellyType
{
    private readonly params: readonly JellyType[];
    private readonly result: JellyType;

    // Java: package-visible
    public constructor(params: readonly JellyType[], result: JellyType)
    {
        super();
        this.params = params;
        this.result = result;
    }

    public override makeTypeExp(typeVariables: ReadonlyMap<string, Either<MutUnitVar, MutVar>>): TypeExp
    {
        return TypeExp.function(null, Utility.mapListInt(this.params, p => p.makeTypeExp(typeVariables)), this.result.makeTypeExp(typeVariables));
    }

    public override makeDataType(typeVariables: ReadonlyMap<string, Either<Unit, DataType>>, mgr: TypeManager): DataType
    {
        const paramTypes: DataType[] = [];
        for (const param of this.params)
        {
            paramTypes.push(param.makeDataType(typeVariables, mgr));
        }
        return DataType.function(paramTypes, this.result.makeDataType(typeVariables, mgr));
    }

    public override forNestedTagged(nestedTagged: (typeId: TypeId) => void): void
    {
        this.params.forEach(p => p.forNestedTagged(nestedTagged));
        this.result.forNestedTagged(nestedTagged);
    }

    public override apply<R>(visitor: JellyTypeVisitorEx<R>): R
    {
        return visitor.function(this.params, this.result);
    }

    public override save(output: OutputBuilder): void
    {
        output.raw("((");
        for (let i = 0; i < this.params.length; i++)
        {
            this.params[i]!.save(output);
            // PORT-NOTE: as in Java, the separator comes after the second and later parameters
            if (i > 0)
                output.raw(", ");
        }
        output.raw(") -> ");
        this.result.save(output);
        output.raw(")");
    }

    public override equals(o: unknown): boolean
    {
        if (this === o) return true;
        if (!(o instanceof JellyTypeFunction) || o.constructor !== this.constructor) return false;
        return javaEquals(this.params, o.params) &&
            javaEquals(this.result, o.result);
    }

    public override hashCode(): number
    {
        return javaObjectsHash(this.params, this.result);
    }
}
