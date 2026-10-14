// Port of xyz.columnal.jellytype.JellyTypeIdent (types module).
// Import JellyType and its subclasses from JellyTypes.ts (which see).
import type { ExpressionIdentifier } from "../../anns/Annotations.js";
import { javaEnumValues } from "../../java/JavaEnum.js";
import { javaObjectsHash } from "../../java/JavaObject.js";
import { Either } from "../../utility-adt/utility/adt/Either.js";
import { Pair } from "../../utility-adt/utility/adt/Pair.js";
import { Utility } from "../../utility/utility/Utility.js";
import { DataType } from "../data/datatype/DataType.js";
import { DateTimeInfo } from "../data/datatype/DateTimeInfo.js";
import type { TaggedTypeDefinition } from "../data/datatype/TaggedTypeDefinition.js";
import { TypeId } from "../data/datatype/TypeId.js";
import type { TypeManager } from "../data/datatype/TypeManager.js";
import type { Unit } from "../data/unit/Unit.js";
import type { OutputBuilder } from "../loadsave/OutputBuilder.js";
import { TypeCons, TypeExp, type MutVar } from "../typeExp/TypeExps.js";
import type { MutUnitVar } from "../typeExp/units/MutUnitVar.js";
import { JellyType, UnknownTypeException, type JellyTypeVisitorEx } from "./JellyTypes.js";

type KnownType = Either<TaggedTypeDefinition, Pair<DataType, readonly string[]>>;

/**
 * A plain ident, could be
 *
 *
 * - A tagged type without arguments
 * - A type variable, like in a function definition or tag definition
 *
 * (Java: package-visible class)
 */
export class JellyTypeIdent extends JellyType
{
    private readonly name: ExpressionIdentifier;

    // Java: package-visible
    public constructor(name: ExpressionIdentifier)
    {
        super();
        this.name = name;
    }

    public override makeTypeExp(typeVariables: ReadonlyMap<string, Either<MutUnitVar, MutVar>>): TypeExp
    {
        const v = typeVariables.get(this.name);
        if (v !== undefined)
            return v.getRight("Variable " + this.name + " should be type variable but was unit variable");
        return new TypeCons(null, this.name, [], TypeExp.ALL_TYPE_CLASSES);
    }

    public override makeDataType(typeVariables: ReadonlyMap<string, Either<Unit, DataType>>, mgr: TypeManager): DataType
    {
        const v = typeVariables.get(this.name);
        if (v !== undefined)
            return v.getRight("Variable " + this.name + " should be type variable but was unit variable");
        const dataType = mgr.lookupType(new TypeId(this.name), []);
        if (dataType !== null)
            return dataType;
        const fixes: JellyType[] = Utility.findAlternatives(this.name, JellyTypeIdent.streamKnownTypes(mgr), t => t.either<readonly string[]>(ttd => [ttd.getTaggedTypeName().getRaw()], dts => [dts.getFirst().toString(), ...dts.getSecond()])).map(t => new JellyTypeIdent(t.either<ExpressionIdentifier>(ttd => ttd.getTaggedTypeName().getRaw(), dts => dts.getFirst().toString())));
        throw new UnknownTypeException("Unknown type or type variable: " + this.name, this, fixes);
    }

    private static streamKnownTypes(mgr: TypeManager): KnownType[]
    {
        const taggedTypes: KnownType[] = [...mgr.getKnownTaggedTypes().values()].map(ttd => Either.left<TaggedTypeDefinition, Pair<DataType, readonly string[]>>(ttd));
        const basicTypes: Pair<DataType, readonly string[]>[] = [
            new Pair<DataType, readonly string[]>(DataType.BOOLEAN, ["bool"]),
            new Pair<DataType, readonly string[]>(DataType.NUMBER, ["int", "integer", "float", "double"]),
            new Pair<DataType, readonly string[]>(DataType.TEXT, ["string"]),
        ];
        const dateTypes: Pair<DataType, readonly string[]>[] = javaEnumValues<DateTimeInfo.DateTimeType>(DateTimeInfo.DateTimeType).map(dtt => new Pair<DataType, readonly string[]>(DataType.date(new DateTimeInfo(dtt)), []));
        return [...taggedTypes, ...[...basicTypes, ...dateTypes].map(t => Either.right<TaggedTypeDefinition, Pair<DataType, readonly string[]>>(t))];
    }

    public override forNestedTagged(_nestedTagged: (typeId: TypeId) => void): void
    {
        // No nested tagged types
    }

    public override apply<R>(visitor: JellyTypeVisitorEx<R>): R
    {
        return visitor.ident(this.name);
    }

    public override save(output: OutputBuilder): void
    {
        output.raw(this.name);
    }

    public override equals(o: unknown): boolean
    {
        if (this === o) return true;
        if (!(o instanceof JellyTypeIdent) || o.constructor !== this.constructor) return false;
        return this.name === o.name;
    }

    public override hashCode(): number
    {
        return javaObjectsHash(this.name);
    }

    public override toString(): string
    {
        return "JellyTypeIdent{" +
                "name='" + this.name + "'" +
                "}";
    }
}
