// Port of xyz.columnal.typeExp.units.MutUnitVar (types module).
import { javaObjectsHash, type Comparable } from "../../../java/JavaObject.js";
import { CommonStyles } from "../../../utility-error/styled/CommonStyles.js";
import { StyledString } from "../../../utility-error/styled/StyledString.js";
import type { StyledShowable } from "../../../utility-error/styled/StyledShowable.js";
import type { Unit } from "../../data/unit/Unit.js";
import type { UnitExp } from "./UnitExp.js";

export class MutUnitVar implements Comparable<MutUnitVar>, StyledShowable
{
    // For Comparable and printing purposes
    private static nextId = 0n;
    private readonly id: bigint = MutUnitVar.nextId++;
    // Java: package-visible (only UnitExp uses it)
    public pointer: UnitExp | null = null;

    public toConcreteUnit(): Unit | null
    {
        if (this.pointer === null)
            return null;
        return this.pointer.toConcreteUnit();
    }

    public compareTo(o: MutUnitVar): number
    {
        return this.id < o.id ? -1 : this.id > o.id ? 1 : 0;
    }

    public equals(o: unknown): boolean
    {
        if (this === o) return true;
        if (!(o instanceof MutUnitVar) || o.constructor !== this.constructor) return false;
        return this.id === o.id;
    }

    public hashCode(): number
    {
        return javaObjectsHash(this.id);
    }

    public toStyledString(): StyledString
    {
        const name = "_u" + this.id;
        if (this.pointer === null)
            return StyledString.styled(name, CommonStyles.ITALIC);
        else
            return StyledString.concat(StyledString.s(name + "[="), this.pointer.toStyledString(), StyledString.s("]"))
                .withStyle(CommonStyles.ITALIC);
    }
}
