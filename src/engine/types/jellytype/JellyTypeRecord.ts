// Port of xyz.columnal.jellytype.JellyTypeRecord (types module).
// Import JellyType and its subclasses from JellyTypes.ts (which see).
import type { ExpressionIdentifier } from "../../anns/Annotations.js";
import { javaEquals, javaObjectsHash, javaStringCompare } from "../../java/JavaObject.js";
import { Either } from "../../utility-adt/utility/adt/Either.js";
import { Utility } from "../../utility/utility/Utility.js";
import { DataType } from "../data/datatype/DataType.js";
import type { TypeId } from "../data/datatype/TypeId.js";
import type { TypeManager } from "../data/datatype/TypeManager.js";
import type { Unit } from "../data/unit/Unit.js";
import type { OutputBuilder } from "../loadsave/OutputBuilder.js";
import { RecordTypeExp, type MutVar, type TypeExp } from "../typeExp/TypeExps.js";
import type { MutUnitVar } from "../typeExp/units/MutUnitVar.js";
import { JellyType, type JellyTypeVisitorEx } from "./JellyTypes.js";

export class JellyTypeRecord extends JellyType
{
    // Java: ImmutableMap (iteration in the given order)
    private readonly fields: ReadonlyMap<ExpressionIdentifier, JellyTypeRecord.Field>;
    private readonly complete: boolean;

    public constructor(fields: ReadonlyMap<ExpressionIdentifier, JellyTypeRecord.Field>, complete: boolean)
    {
        super();
        this.fields = fields;
        this.complete = complete;
    }

    public override makeTypeExp(typeVariables: ReadonlyMap<string, Either<MutUnitVar, MutVar>>): TypeExp
    {
        return new RecordTypeExp(null, new Map(Utility.mapValuesInt(this.fields, f => f.getJellyType().makeTypeExp(typeVariables))), this.complete);
    }

    public override makeDataType(typeVariables: ReadonlyMap<string, Either<Unit, DataType>>, mgr: TypeManager): DataType
    {
        const types = new Map<ExpressionIdentifier, DataType>();
        for (const [key, value] of this.fields)
        {
            types.set(key, value.makeDataType(typeVariables, mgr));
        }
        return DataType.record(types);
    }

    public override save(output: OutputBuilder): void
    {
        output.raw("(");
        let first = true;
        for (const [key, value] of [...this.fields].sort((a, b) => javaStringCompare(a[0], b[0])))
        {
            if (!first)
                output.raw(",");
            first = false;
            output.expId(key).raw(value.isRequired() ? ":" : "?:");
            value.getJellyType().save(output);
        }
        output.raw(")");
    }

    public override equals(o: unknown): boolean
    {
        if (this === o) return true;
        if (!(o instanceof JellyTypeRecord) || o.constructor !== this.constructor) return false;
        return this.complete === o.complete &&
            javaEquals(this.fields, o.fields);
    }

    public override hashCode(): number
    {
        return javaObjectsHash(this.fields, this.complete);
    }

    public override forNestedTagged(nestedTagged: (typeId: TypeId) => void): void
    {
        for (const value of this.fields.values())
        {
            value.getJellyType().forNestedTagged(nestedTagged);
        }
    }

    public override apply<R>(visitor: JellyTypeVisitorEx<R>): R
    {
        return visitor.record(this.fields, this.complete);
    }
}

export namespace JellyTypeRecord
{
    export class Field
    {
        private readonly type: JellyType;
        private readonly required: boolean;

        public constructor(type: JellyType, required: boolean)
        {
            this.type = type;
            this.required = required;
        }

        public equals(o: unknown): boolean
        {
            if (this === o) return true;
            if (!(o instanceof Field) || o.constructor !== this.constructor) return false;
            return this.required === o.required &&
                this.type.equals(o.type);
        }

        public hashCode(): number
        {
            return javaObjectsHash(this.type, this.required);
        }

        public makeDataType(typeVariables: ReadonlyMap<string, Either<Unit, DataType>>, mgr: TypeManager): DataType
        {
            const core = this.type.makeDataType(typeVariables, mgr);
            if (this.required)
                return core;
            else
                return mgr.getMaybeType().instantiate([Either.right<Unit, DataType>(core)], mgr);
        }

        public getJellyType(): JellyType
        {
            return this.type;
        }

        // Java: JellyTypeRecord reads the private field directly
        public isRequired(): boolean
        {
            return this.required;
        }
    }
}
