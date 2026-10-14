// Port of xyz.columnal.data.datatype.NumberInfo (types module).
import { Unit } from "../unit/Unit.js";

/**
 * Created by neil on 15/05/2017.
 */
export class NumberInfo
{
    private readonly unit: Unit;

    public constructor(unit: Unit)
    {
        this.unit = unit;
    }

    public static readonly DEFAULT = new NumberInfo(Unit.SCALAR);

    public equals(o: unknown): boolean
    {
        if (this === o) return true;
        if (!(o instanceof NumberInfo) || o.constructor !== this.constructor) return false;
        return this.unit.equals(o.unit);
    }

    public hashCode(): number
    {
        return this.unit.hashCode();
    }

    public getUnit(): Unit
    {
        return this.unit;
    }

    public sameType(numberInfo: NumberInfo | null): boolean
    {
        if (numberInfo === null)
            return false;
        return this.unit.equals(numberInfo.unit);
    }

    public hashCodeForType(): number
    {
        return this.unit.hashCode();
    }
}
