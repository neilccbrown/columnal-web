// Port of org.sosy_lab.common.rationals.Rational (from the sosy-lab common library used via
// javaSMT, Apache License 2.0), which Columnal uses for unit exponents and scale factors.
// Java BigInteger becomes bigint.
import { Decimal, toBigInteger } from "./JavaBigDecimal.js";
import { javaHashCode, type Comparable } from "./JavaObject.js";

function bigintAbs(b: bigint): bigint
{
    return b < 0n ? -b : b;
}

// BigInteger.gcd: always non-negative; gcd(0, 0) == 0.
function gcd(a: bigint, b: bigint): bigint
{
    a = bigintAbs(a);
    b = bigintAbs(b);
    while (b !== 0n)
    {
        const t = a % b;
        a = b;
        b = t;
    }
    return a;
}

// new BigInteger(String): an optional sign then one or more digits.
function parseBigInteger(s: string): bigint
{
    if (!/^[+-]?[0-9]+$/.test(s))
        throw new RangeError(`Invalid BigInteger: "${s}"`); // Java: NumberFormatException
    return BigInt(s);
}

// Java's (int) and (long) casts from double: truncate, saturate, NaN -> 0.
function doubleToInt(d: number, min: number, max: number): number
{
    if (Number.isNaN(d))
        return 0;
    return Math.max(min, Math.min(max, Math.trunc(d)));
}

export class Rational implements Comparable<Rational>
{
    // -- Just some shortcuts for BigIntegers --
    private static readonly B_ZERO = 0n;
    private static readonly B_ONE = 1n;
    private static readonly B_M_ONE = -1n;

    public static readonly ZERO = new Rational(Rational.B_ZERO, Rational.B_ONE);
    public static readonly ONE = new Rational(Rational.B_ONE, Rational.B_ONE);
    public static readonly NEG_ONE = new Rational(Rational.B_M_ONE, Rational.B_ONE);

    private readonly num: bigint;
    private readonly den: bigint;

    private constructor(numerator: bigint, denominator: bigint)
    {
        this.num = numerator;
        this.den = denominator;
    }

    // Factory functions.

    /** Java: of(BigInteger, BigInteger), of(String) and of(long). */
    public static of(numerator: bigint, denominator: bigint): Rational;
    public static of(s: string): Rational;
    public static of(l: number | bigint): Rational;
    public static of(a: bigint | number | string, b?: bigint): Rational
    {
        if (typeof a === "string")
            return Rational.ofString(a);
        if (b === undefined)
            return Rational.ofLong(a);
        let numerator = BigInt(a);
        let denominator = b;
        if (denominator === 0n)
            throw new RangeError("Infinity is not supported, use ExtendedRational instead");
        if (denominator < 0n)
        {
            // Make denominator positive.
            denominator = -denominator;
            numerator = -numerator;
        }
        // Reduce by GCD. GCD will never be zero as the denominator is never
        // zero at this stage.
        const g = gcd(numerator, denominator);
        numerator = numerator / g;
        denominator = denominator / g;
        return Rational.ofNormalForm(numerator, denominator);
    }

    private static ofNormalForm(num: bigint, den: bigint): Rational
    {
        if (num === Rational.B_ZERO)
        {
            return Rational.ZERO;
        }
        else if (den === Rational.B_ONE)
        {
            if (num === Rational.B_ONE)
            {
                return Rational.ONE;
            }
            else if (num === Rational.B_M_ONE)
            {
                return Rational.NEG_ONE;
            }
        }
        return new Rational(num, den);
    }

    public static ofLongs(numerator: number | bigint, denominator: number | bigint): Rational
    {
        return Rational.of(BigInt(numerator), BigInt(denominator));
    }

    public static ofLong(numerator: number | bigint): Rational
    {
        return Rational.of(BigInt(numerator), Rational.B_ONE);
    }

    public static ofBigInteger(numerator: bigint): Rational
    {
        return Rational.of(numerator, Rational.B_ONE);
    }

    public static ofString(s: string): Rational
    {
        const idx = s.indexOf("/");
        if (idx === -1) // No slash found.
        {
            return Rational.ofBigInteger(parseBigInteger(s));
        }
        else
        {
            return Rational.of(parseBigInteger(s.substring(0, idx)), parseBigInteger(s.substring(idx + 1)));
        }
    }

    /** Java: ofBigDecimal.  The decimal is converted exactly. */
    public static ofBigDecimal(decimal: Decimal): Rational
    {
        if (decimal.isInteger())
            return Rational.of(toBigInteger(decimal), 1n);
        const dp = decimal.decimalPlaces();
        return Rational.of(toBigInteger(decimal.times(new Decimal(10).pow(dp))), 10n ** BigInt(dp));
    }

    public times(b: Rational): Rational
    {
        // eslint-disable-next-line @typescript-eslint/no-this-alias
        const a: Rational = this;
        // Normalized form uses cached instances, so reference equality is enough:
        if (a === Rational.ZERO || b === Rational.ZERO)
        {
            return Rational.ZERO;
        }
        if (a === Rational.ONE)
        {
            return b;
        }
        if (b === Rational.ONE)
        {
            return a;
        }

        // reduce p1/q2 and p2/q1, then multiply, where a = p1/q1 and b = p2/q2
        const c = Rational.of(a.num, b.den);
        const d = Rational.of(b.num, a.den);
        return Rational.ofNormalForm(c.num * d.num, c.den * d.den);
    }

    public plus(b: Rational): Rational
    {
        // eslint-disable-next-line @typescript-eslint/no-this-alias
        const a: Rational = this;
        if (a === Rational.ZERO)
        {
            return b;
        }
        if (b === Rational.ZERO)
        {
            return a;
        }
        return Rational.of(a.num * b.den + b.num * a.den, a.den * b.den);
    }

    public minus(b: Rational): Rational
    {
        return this.plus(b.negate());
    }

    public divides(b: Rational): Rational
    {
        // Reciprocal method will throw the exception for the division-by-zero
        // error if required.
        return this.times(b.reciprocal());
    }

    public reciprocal(): Rational
    {
        if (this.num === Rational.B_ZERO)
            throw new RangeError("Division by zero not supported, use ExtendedRational if you need it");
        return Rational.of(this.den, this.num);
    }

    public negate(): Rational
    {
        return Rational.ofNormalForm(-this.num, this.den);
    }

    public doubleValue(): number
    {
        return Number(this.num) / Number(this.den);
    }

    public isIntegral(): boolean
    {
        return this.den === Rational.B_ONE;
    }

    public getNum(): bigint
    {
        return this.num;
    }

    public getDen(): bigint
    {
        return this.den;
    }

    public signum(): number
    {
        return this.num > 0n ? 1 : this.num < 0n ? -1 : 0;
    }

    public abs(): Rational
    {
        return this.signum() === -1 ? this.negate() : this;
    }

    public toString(): string
    {
        if (this.den === Rational.B_ONE)
            return this.num.toString();
        else
            return this.num.toString() + "/" + this.den.toString();
    }

    public compareTo(b: Rational): number
    {
        const lhs = this.num * b.den;
        const rhs = this.den * b.num;
        return lhs > rhs ? 1 : lhs < rhs ? -1 : 0;
    }

    public equals(y: unknown): boolean
    {
        if (this === y)
            return true;
        if (!(y instanceof Rational))
            return false;
        return this.num === y.num && this.den === y.den;
    }

    public hashCode(): number
    {
        // Java: Objects.hash(num, den)
        return (Math.imul(31, (31 + javaHashCode(this.num)) | 0) + javaHashCode(this.den)) | 0;
    }

    public static max(a: Rational, b: Rational): Rational
    {
        if (a.compareTo(b) >= 0)
        {
            return a;
        }
        return b;
    }

    public intValue(): number
    {
        return doubleToInt(this.doubleValue(), -0x80000000, 0x7fffffff);
    }

    public longValue(): bigint
    {
        const d = this.doubleValue();
        if (Number.isNaN(d))
            return 0n;
        if (d >= 2 ** 63)
            return (1n << 63n) - 1n;
        if (d <= -(2 ** 63))
            return -(1n << 63n);
        return BigInt(Math.trunc(d));
    }
}
