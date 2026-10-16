// Port of xyz.columnal.transformations.expression.CanonicalSpan (expressions module).
import { javaObjectsHash } from "../../../java/JavaObject.js";
import type { CanonicalLocation } from "../../../anns/Annotations.js";

// A semantic error matches an expression which may span multiple children.
export class CanonicalSpan
{
    // Start is inclusive char index, end is exclusive char index
    public readonly start: CanonicalLocation;
    public readonly end: CanonicalLocation;

    public constructor(start: CanonicalLocation, end: CanonicalLocation)
    {
        this.start = start;
        this.end = end;
    }

    public static fromTo(start: CanonicalSpan, end: CanonicalSpan): CanonicalSpan
    {
        if (start.start <= end.end)
            return new CanonicalSpan(start.start, end.end);
        else
            return new CanonicalSpan(start.start, start.start);
    }

    public offsetBy(offsetBy: CanonicalLocation): CanonicalSpan
    {
        return new CanonicalSpan(this.start + offsetBy, this.end + offsetBy);
    }

    public static readonly START = new CanonicalSpan(0, 0);

    // Even though end is typically exclusive, this checks
    // if <= end because for errors etc we still want to display
    // if we touch the extremity.
    public touches(position: CanonicalLocation): boolean
    {
        return this.start <= position && position <= this.end;
    }

    public toString(): string
    {
        return "[" + this.start + "->" + this.end + "]";
    }

    public equals(o: unknown): boolean
    {
        if (this === o) return true;
        if (!(o instanceof CanonicalSpan) || o.constructor !== this.constructor) return false;
        return this.start === o.start &&
                this.end === o.end;
    }

    public hashCode(): number
    {
        return javaObjectsHash(this.start, this.end);
    }

    public compareTo(o: CanonicalSpan): number
    {
        const c = Math.sign(this.start - o.start);
        if (c !== 0)
            return c;
        else
            return Math.sign(this.end - o.end);
    }

    public lhs(): CanonicalSpan
    {
        return new CanonicalSpan(this.start, this.start);
    }

    public rhs(): CanonicalSpan
    {
        return new CanonicalSpan(this.end, this.end);
    }
}
