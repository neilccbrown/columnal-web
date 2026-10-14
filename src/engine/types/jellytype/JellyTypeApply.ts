// Port of xyz.columnal.jellytype.JellyTypeApply (types module).
// Import JellyType and its subclasses from JellyTypes.ts (which see).
import { javaEquals, javaObjectsHash } from "../../java/JavaObject.js";
import { vocabularyOf } from "../../parsers/grammar/Vocabularies.js";
import { FormatLexer } from "../../parsers/generated/FormatLexer.js";
import type { Either } from "../../utility-adt/utility/adt/Either.js";
import { UnitType } from "../../utility/utility/UnitType.js";
import { Utility } from "../../utility/utility/Utility.js";
import type { DataType } from "../data/datatype/DataType.js";
import type { TypeId } from "../data/datatype/TypeId.js";
import type { TypeManager } from "../data/datatype/TypeManager.js";
import type { Unit } from "../data/unit/Unit.js";
import type { OutputBuilder } from "../loadsave/OutputBuilder.js";
import { TypeCons, TypeExp, type MutVar } from "../typeExp/TypeExps.js";
import type { MutUnitVar } from "../typeExp/units/MutUnitVar.js";
import type { UnitExp } from "../typeExp/units/UnitExp.js";
import { JellyType, UnknownTypeException, type JellyTypeVisitorEx } from "./JellyTypes.js";
import type { JellyUnit } from "./JellyUnit.js";

export class JellyTypeApply extends JellyType
{
    private readonly typeName: TypeId;
    private readonly typeParams: readonly Either<JellyUnit, JellyType>[];

    public constructor(typeName: TypeId, typeParams: readonly Either<JellyUnit, JellyType>[])
    {
        super();
        this.typeName = typeName;
        this.typeParams = typeParams;
    }

    public override makeTypeExp(typeVariables: ReadonlyMap<string, Either<MutUnitVar, MutVar>>): TypeExp
    {
        return new TypeCons(null, this.typeName.getRaw(), Utility.mapListInt(this.typeParams, p =>
            p.mapBothInt<UnitExp, TypeExp>(u => u.makeUnitExp(typeVariables), t => t.makeTypeExp(typeVariables))
        ), TypeExp.ALL_TYPE_CLASSES);
    }

    public override makeDataType(typeVariables: ReadonlyMap<string, Either<Unit, DataType>>, mgr: TypeManager): DataType
    {
        const typeParamConcrete: Either<Unit, DataType>[] = [];
        for (const typeParam of this.typeParams)
        {
            typeParamConcrete.push(typeParam.mapBothEx3<Unit, DataType>(u => u.makeUnit(typeVariables), t => t.makeDataType(typeVariables, mgr)));
        }
        const dataType = mgr.lookupType(this.typeName, typeParamConcrete);
        if (dataType !== null)
            return dataType;
        const fixes: JellyType[] = Utility.findAlternatives(this.typeName.getRaw(), [...mgr.getKnownTaggedTypes().values()], ttd => [ttd.getTaggedTypeName().getRaw()]).map(t => new JellyTypeApply(t.getTaggedTypeName(), this.typeParams));
        throw new UnknownTypeException("Could not find data type: " + this.typeName.toString(), this, fixes);
    }

    public override save(output: OutputBuilder): void
    {
        output.t(FormatLexer.APPLY, vocabularyOf(FormatLexer));
        output.raw(" ");
        output.unquoted(this.typeName);
        for (const typeParam of this.typeParams)
        {
            output.raw("(");
            typeParam.either(u => {
                output.raw("{");
                u.save(output);
                output.raw("}");
                return UnitType.UNIT;
            }, t => {t.save(output); return UnitType.UNIT;});
            output.raw(")");
        }
    }

    public override equals(o: unknown): boolean
    {
        if (this === o) return true;
        if (!(o instanceof JellyTypeApply) || o.constructor !== this.constructor) return false;
        return javaEquals(this.typeName, o.typeName) &&
            javaEquals(this.typeParams, o.typeParams);
    }

    public override hashCode(): number
    {
        return javaObjectsHash(this.typeName, this.typeParams);
    }

    public override forNestedTagged(nestedTagged: (typeId: TypeId) => void): void
    {
        nestedTagged(this.typeName);
        for (const typeParam of this.typeParams)
        {
            typeParam.ifRight(t => t.forNestedTagged(nestedTagged));
        }
    }

    public override apply<R>(visitor: JellyTypeVisitorEx<R>): R
    {
        return visitor.applyTagged(this.typeName, this.typeParams);
    }

    public getName(): TypeId
    {
        return this.typeName;
    }

    public getTypeParams(): readonly Either<JellyUnit, JellyType>[]
    {
        return this.typeParams;
    }

    public override toString(): string
    {
        return "JellyTypeApply{" +
                "typeName=" + this.typeName.toString() +
                ", typeParams=" + Utility.listToString(this.typeParams) +
                "}";
    }
}
