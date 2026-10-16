// Columnal's number type, and equivalents of the java.math.BigDecimal operations it uses.
//
// In Java, a Columnal number is a Long (or smaller integer) or a BigDecimal, with arithmetic
// done in MathContext.DECIMAL128 (34 significant digits, round half even).  Here every number
// is a canonical decimal.js Decimal with the same precision and rounding: canonical means
// trailing zeros are not significant (2.5 and 2.50 are the same value) and there is no -0.
// See docs/CONVENTIONS.md ("Numbers").
//
// decimal.js's +, -, *, / are correctly rounded to the precision, as Java's are with
// DECIMAL128, so they give the same values.  BigDecimal.pow(int, MathContext) is not correctly
// rounded in Java, so it is ported exactly (powDecimal128).
import { Decimal as DecimalJs } from "decimal.js";
import { normalizeJavaDigits, NumberFormatException } from "./JavaString.js";

const CONFIG = {
    precision: 34,
    rounding: DecimalJs.ROUND_HALF_EVEN,
    // BigDecimal.remainder: the result has the sign of the dividend
    modulo: DecimalJs.ROUND_DOWN,
    // Approximately BigDecimal's limits (its scale is a Java int); beyond them Java throws
    // ArithmeticException, which checkFinite reproduces for overflow.
    maxE: 2147483647,
    minE: -2147483648,
    toExpNeg: -7,
    toExpPos: 21,
} as const;

/** Columnal's number type: canonical decimals with DECIMAL128 arithmetic. */
export const Decimal = DecimalJs.clone(CONFIG);
export type Decimal = DecimalJs;
/** A decimal.js rounding mode, such as Decimal.ROUND_HALF_UP */
export type Rounding = DecimalJs.Rounding;

export const ZERO: Decimal = new Decimal(0);
export const ONE: Decimal = new Decimal(1);

/** Equivalent of java.lang.ArithmeticException. */
export class ArithmeticException extends Error
{
    constructor(message: string)
    {
        super(message);
        this.name = "ArithmeticException";
    }
}

/** Returns the canonical form of the number: in particular, -0 becomes 0. */
export function canonical(d: Decimal): Decimal
{
    return d.isZero() ? ZERO : d;
}

/** Throws ArithmeticException (as Java's BigDecimal would) if the result overflowed. */
export function checkFinite(d: Decimal): Decimal
{
    if (!d.isFinite())
        throw new ArithmeticException("Overflow");
    return d;
}

/** A whole number (Java long or BigInteger) as a Decimal. */
export function decimalFromBigInt(b: bigint): Decimal
{
    return new Decimal(b.toString());
}

const BIG_DECIMAL_SYNTAX = /^[+-]?(?:[0-9]+(?:\.[0-9]*)?|\.[0-9]+)(?:[eE]([+-]?[0-9]+))?$/;

/**
 * new BigDecimal(String), or new BigDecimal(String, MathContext.DECIMAL128) if decimal128
 * is true (rounding to 34 significant digits).  Accepts exactly Java's syntax (no spaces,
 * no Infinity/NaN, no hex, but any Unicode decimal digits), throwing NumberFormatException otherwise.
 */
export function parseBigDecimal(original: string, decimal128: boolean): Decimal
{
    const s = normalizeJavaDigits(original);
    const m = BIG_DECIMAL_SYNTAX.exec(s);
    if (m === null)
        throw new NumberFormatException(`Character array is not a valid decimal number: "${original}"`);
    if (m[1] !== undefined && Math.abs(Number(m[1])) > 2147483647)
        throw new NumberFormatException("Exponent overflow.");
    const d = checkFinite(new Decimal(s));
    return canonical(decimal128 ? d.toSignificantDigits(34, Decimal.ROUND_HALF_EVEN) : d);
}

/** BigDecimal.valueOf(double): the shortest decimal that represents the double. */
export function decimalFromDouble(d: number): Decimal
{
    if (!Number.isFinite(d))
        throw new NumberFormatException("Infinite or NaN");
    return canonical(new Decimal(d));
}

/**
 * BigDecimal.pow(n, MathContext.DECIMAL128), using exactly Java's algorithm (ANSI X3.274-1996,
 * with a working precision of 34 + digits(n) + 1), which is not always correctly rounded.
 */
export function powDecimal128(x: Decimal, n: number): Decimal
{
    if (!Number.isInteger(n) || n < -999999999 || n > 999999999)
        throw new ArithmeticException("Invalid operation");
    if (n === 0)
        return ONE; // x**0 == 1 in X3.274
    let mag = Math.abs(n);
    const elength = String(mag).length; // length of the number in digits
    // Java: if (elength > mc.precision) throw new ArithmeticException("Invalid operation");
    // which cannot happen here as n has at most 9 digits.
    const Work = Decimal.clone({ ...CONFIG, precision: 34 + elength + 1 });
    const lhs = new Work(x);
    let acc = new Work(1);
    let seenbit = false; // set once we've seen a 1-bit
    for (let i = 1; ; i++) // for each bit [top bit ignored]
    {
        mag = (mag << 1) | 0; // shift left 1 bit (as a Java int)
        if (mag < 0) // top bit is set
        {
            seenbit = true; // OK, we're off
            acc = acc.times(lhs); // acc=acc*x
        }
        if (i === 31)
            break; // that was the last bit
        if (seenbit)
            acc = acc.times(acc); // acc=acc*acc [square]
        // else (!seenbit) no point in squaring ONE
    }
    // if negative n, calculate the reciprocal using working precision
    if (n < 0) // [hence mc.precision>0]
    {
        if (acc.isZero())
            throw new ArithmeticException("Division by zero"); // As BigDecimal.divide would
        acc = new Work(1).div(acc);
    }
    // round to final precision and strip zeros
    return canonical(checkFinite(new Decimal(acc).toSignificantDigits(34, Decimal.ROUND_HALF_EVEN)));
}

/** BigDecimal.toPlainString(): no exponent notation. */
export function toPlainString(d: Decimal): string
{
    return canonical(d).toFixed();
}

/** BigDecimal.toBigInteger(): the integer part (truncated towards zero). */
export function toBigInteger(d: Decimal): bigint
{
    return BigInt(d.trunc().toFixed());
}

/**
 * BigDecimal.setScale(newScale, roundingMode): rounds to newScale decimal places, or for a
 * negative newScale, to a multiple of 10^-newScale.  The rounding mode is a decimal.js one
 * (Decimal.ROUND_HALF_UP is Java's RoundingMode.HALF_UP).  Not limited to 34 digits, like Java's.
 */
export function setScale(d: Decimal, newScale: number, rounding: Rounding): Decimal
{
    if (newScale >= 0)
        return canonical(d.toDecimalPlaces(newScale, rounding));
    return canonical(shiftPowerOfTen(shiftPowerOfTen(d, newScale).toDecimalPlaces(0, rounding), -newScale));
}

// d * 10^n, exactly (decimal.js arithmetic would round to 34 digits)
function shiftPowerOfTen(d: Decimal, n: number): Decimal
{
    if (d.isZero())
        return d;
    const [mantissa, exponent] = d.toExponential().split("e") as [string, string];
    return new Decimal(mantissa + "e" + (Number(exponent) + n));
}

/** BigDecimal.longValue() / Number.longValue(): the integer part, wrapped to 64 bits as Java does. */
export function longValue(d: Decimal): bigint
{
    return BigInt.asIntN(64, toBigInteger(d));
}

/** BigDecimal.intValue() / Number.intValue(): the integer part, wrapped to 32 bits as Java does. */
export function intValue(d: Decimal): number
{
    return Number(BigInt.asIntN(32, toBigInteger(d)));
}

/** BigDecimal.doubleValue(): the nearest double. */
export function doubleValue(d: Decimal): number
{
    return d.toNumber();
}

const LONG_MIN = -(1n << 63n);
const LONG_MAX = (1n << 63n) - 1n;

/** True if the number is a whole number within Java's long range (Java would hold it as a Long). */
export function fitsLong(d: Decimal): boolean
{
    if (!d.isInteger())
        return false;
    const b = toBigInteger(d);
    return b >= LONG_MIN && b <= LONG_MAX;
}

/**
 * The Java toString of a Columnal number: a whole number in long range prints like a Java
 * Long ("1000"); anything else like a stripped BigDecimal, which uses scientific notation
 * when the exponent is positive or the number is very small ("1E+20", "1.5E-7").
 */
export function toJavaString(d: Decimal): string
{
    d = canonical(d);
    if (fitsLong(d))
        return toBigInteger(d).toString();
    const [mantissa, expPart] = d.abs().toExponential().split("e") as [string, string];
    const coeff = mantissa.replace(".", "");
    const adjusted = Number(expPart);
    const scale = coeff.length - 1 - adjusted;
    const sign = d.isNeg() ? "-" : "";
    if (scale >= 0 && adjusted >= -6)
        return sign + d.abs().toFixed(); // Plain notation
    return sign + coeff[0] + (coeff.length > 1 ? "." + coeff.substring(1) : "") + "E" + (adjusted > 0 ? "+" : "") + adjusted;
}

const doubleBits = new DataView(new ArrayBuffer(8));

/**
 * new BigDecimal(double): the EXACT value of the double's binary representation, which can
 * have many digits (e.g. 0.1 is 0.1000000000000000055511151231257827021181583404541015625).
 * Compare decimalFromDouble, which is BigDecimal.valueOf(double).
 */
export function decimalFromDoubleExact(d: number): Decimal
{
    if (!Number.isFinite(d))
        throw new NumberFormatException("Infinite or NaN");
    if (d === 0)
        return ZERO;
    doubleBits.setFloat64(0, d);
    const hi = doubleBits.getUint32(0);
    const lo = doubleBits.getUint32(4);
    const negative = (hi >>> 31) === 1;
    const exponentBits = (hi >>> 20) & 0x7ff;
    let mantissa = (BigInt(hi & 0xfffff) << 32n) | BigInt(lo);
    let exponent: number;
    if (exponentBits === 0)
        exponent = -1074; // Subnormal
    else
    {
        mantissa |= 1n << 52n;
        exponent = exponentBits - 1075;
    }
    // value = mantissa * 2^exponent, computed exactly in decimal:
    let result: Decimal;
    if (exponent >= 0)
        result = new Decimal((mantissa << BigInt(exponent)).toString());
    else
    {
        // mantissa / 2^k == mantissa * 5^k / 10^k
        const k = -exponent;
        const digits = (mantissa * 5n ** BigInt(k)).toString();
        result = new Decimal(digits + "e-" + k);
    }
    return canonical(negative ? result.neg() : result);
}
