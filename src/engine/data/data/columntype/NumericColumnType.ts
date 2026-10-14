// Port of xyz.columnal.data.columntype.NumericColumnType (data module).
// Import it through ColumnTypes.ts (see ColumnType.ts).
import { javaReplace, javaTrim } from "../../../java/JavaString.js";
import { javaStringHashCode } from "../../../java/JavaObject.js";
import { NumberDisplayInfo } from "../../../types/data/datatype/NumberDisplayInfo.js";
import type { Unit } from "../../../types/data/unit/Unit.js";
import { ColumnType } from "./ColumnTypes.js";

// Apache Commons' StringUtils.removeStart and removeEnd
function removeStart(s: string, remove: string): string
{
    return remove.length !== 0 && s.startsWith(remove) ? s.substring(remove.length) : s;
}

function removeEnd(s: string, remove: string): string
{
    return remove.length !== 0 && s.endsWith(remove) ? s.substring(0, s.length - remove.length) : s;
}

/**
 * Created by neil on 30/10/2016.
 */
export class NumericColumnType extends ColumnType
{
    public readonly unit: Unit;
    public readonly displayInfo: NumberDisplayInfo;
    private readonly commonPrefix: string | null;
    private readonly commonSuffix: string | null;

    public constructor(unit: Unit, minDP: number, commonPrefix: string | null, commonSuffix: string | null)
    {
        super();
        this.unit = unit;
        this.displayInfo = new NumberDisplayInfo(minDP, 10, NumberDisplayInfo.Padding.ZERO);
        this.commonPrefix = commonPrefix;
        this.commonSuffix = commonSuffix;
    }

    /**
     * Removes numeric prefix from the string, and gets rid of commas.
     */
    public removePrefixAndSuffix(val: string): string
    {
        val = javaTrim(val);
        if (this.commonPrefix !== null)
            val = removeStart(val, this.commonPrefix);
        else if (val.startsWith(this.unit.getDisplayPrefix()))
            val = removeStart(val, this.unit.getDisplayPrefix());

        if (this.commonSuffix !== null)
            val = removeEnd(val, this.commonSuffix);
        else if (val.endsWith(this.unit.getDisplaySuffix()))
            val = removeEnd(val, this.unit.getDisplaySuffix());

        val = javaReplace(javaTrim(val), ",", "");
        return val;
    }

    public override equals(o: unknown): boolean
    {
        if (this === o) return true;
        if (!(o instanceof NumericColumnType)) return false;

        const that = o;

        if (!this.displayInfo.equals(that.displayInfo)) return false;
        if (this.commonPrefix !== that.commonPrefix) return false;
        if (this.commonSuffix !== that.commonSuffix) return false;
        return this.unit.equals(that.unit);
    }

    public override hashCode(): number
    {
        let result = this.unit.hashCode();
        result = (Math.imul(31, result) + this.displayInfo.hashCode()) | 0;
        if (this.commonPrefix !== null)
            result = (Math.imul(31, result) + javaStringHashCode(this.commonPrefix)) | 0;
        if (this.commonSuffix !== null)
            result = (Math.imul(31, result) + javaStringHashCode(this.commonSuffix)) | 0;
        return result;
    }

    public override toString(): string
    {
        return "Number{" +
            "unit=" + this.unit.toString() +
            ", displayInfo=" + this.displayInfo.toString() +
            ", commonPrefix='" + String(this.commonPrefix) + "'" +
            ", commonSuffix='" + String(this.commonSuffix) + "'" +
            "}";
    }
}
