// Port of xyz.columnal.data.datatype.NumberDisplayInfo (types module).

/**
 * Created by neil on 15/05/2017.
 */
export class NumberDisplayInfo
{
    private readonly minimumDP: number;
    private readonly maximumDP: number;
    private readonly rightPadding: NumberDisplayInfo.Padding;

    // Java: a static final field; a getter here because Padding is defined after the class.
    public static get SYSTEMWIDE_DEFAULT(): NumberDisplayInfo
    {
        return SYSTEMWIDE_DEFAULT;
    }

    public constructor(minimumDP: number, maximumDP: number, rightPadding: NumberDisplayInfo.Padding)
    {
        this.minimumDP = minimumDP;
        this.maximumDP = maximumDP;
        this.rightPadding = rightPadding;
    }

    public getMinimumDP(): number
    {
        return this.minimumDP;
    }

    public getMaximumDP(): number
    {
        return this.maximumDP;
    }

    public getPaddingChar(): string
    {
        return this.rightPadding === NumberDisplayInfo.Padding.ZERO ? "0" : " ";
    }

    public static merge(a: NumberDisplayInfo | null, b: NumberDisplayInfo | null): NumberDisplayInfo | null
    {
        if (a === null && b === null)
            return null;
        else if (a === null)
            return b;
        else if (b === null)
            return a;
        else
        {
            return new NumberDisplayInfo(Math.max(a.minimumDP, b.minimumDP), Math.max(a.maximumDP, b.maximumDP), a.rightPadding);
        }
    }

    public equals(o: unknown): boolean
    {
        if (this === o) return true;
        if (!(o instanceof NumberDisplayInfo) || o.constructor !== this.constructor) return false;
        if (this.minimumDP !== o.minimumDP) return false;
        if (this.maximumDP !== o.maximumDP) return false;
        return this.rightPadding === o.rightPadding;
    }

    public hashCode(): number
    {
        let result = this.minimumDP;
        result = (Math.imul(31, result) + this.maximumDP) | 0;
        // Java: rightPadding.hashCode() (an enum's identity hash), here its ordinal
        result = (Math.imul(31, result) + this.rightPadding) | 0;
        return result;
    }

    public toString(): string
    {
        return "NumberDisplayInfo{" +
            "minimumDP=" + this.minimumDP +
            ", maximumDP=" + this.maximumDP +
            ", rightPadding=" + NumberDisplayInfo.Padding[this.rightPadding] +
            "}";
    }
}

export namespace NumberDisplayInfo
{
    export enum Padding
    {
        ZERO, SPACE
    }
}

const SYSTEMWIDE_DEFAULT = new NumberDisplayInfo(0, 3, NumberDisplayInfo.Padding.SPACE);
