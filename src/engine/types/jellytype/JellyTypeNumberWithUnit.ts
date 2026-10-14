// Port of xyz.columnal.jellytype.JellyTypeNumberWithUnit (types module).
// Import JellyType and its subclasses from JellyTypes.ts (which see).
import { javaEquals, javaObjectsHash } from "../../java/JavaObject.js";
import { vocabularyOf } from "../../parsers/grammar/Vocabularies.js";
import { FormatParser } from "../../parsers/generated/FormatParser.js";
import type { Either } from "../../utility-adt/utility/adt/Either.js";
import { DataType } from "../data/datatype/DataType.js";
import { NumberInfo } from "../data/datatype/NumberInfo.js";
import type { TypeId } from "../data/datatype/TypeId.js";
import type { Unit } from "../data/unit/Unit.js";
import type { OutputBuilder } from "../loadsave/OutputBuilder.js";
import { NumTypeExp, type MutVar, type TypeExp } from "../typeExp/TypeExps.js";
import type { MutUnitVar } from "../typeExp/units/MutUnitVar.js";
import { JellyType, type JellyTypeVisitorEx } from "./JellyTypes.js";
import type { JellyUnit } from "./JellyUnit.js";

// Java: package-visible class
export class JellyTypeNumberWithUnit extends JellyType
{
    private readonly unit: JellyUnit;

    // Java: package-visible
    public constructor(unit: JellyUnit)
    {
        super();
        this.unit = unit;
    }

    public override makeTypeExp(typeVariables: ReadonlyMap<string, Either<MutUnitVar, MutVar>>): TypeExp
    {
        return new NumTypeExp(null, this.unit.makeUnitExp(typeVariables));
    }

    public override makeDataType(typeVariables: ReadonlyMap<string, Either<Unit, DataType>>): DataType
    {
        return DataType.number(new NumberInfo(this.unit.makeUnit(typeVariables)));
    }

    public override forNestedTagged(_nestedTagged: (typeId: TypeId) => void): void
    {
        // No nested tagged types
    }

    public override apply<R>(visitor: JellyTypeVisitorEx<R>): R
    {
        return visitor.number(this.unit);
    }

    public override save(output: OutputBuilder): void
    {
        output.t(FormatParser.NUMBER, vocabularyOf(FormatParser));
        if (!this.unit.isScalar())
        {
            output.raw("{");
            this.unit.save(output);
            output.raw("}");
        }
    }

    public override equals(o: unknown): boolean
    {
        if (this === o) return true;
        if (!(o instanceof JellyTypeNumberWithUnit) || o.constructor !== this.constructor) return false;
        return javaEquals(this.unit, o.unit);
    }

    public override hashCode(): number
    {
        return javaObjectsHash(this.unit);
    }

    // For debugging
    public override toString(): string
    {
        return "JellyTypeNumberWithUnit{" +
                "unit=" + this.unit.toString() +
                "}";
    }
}
