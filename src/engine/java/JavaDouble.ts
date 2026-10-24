// Equivalents of java.lang.Double's string conversions.
import { Decimal, decimalFromDoubleExact } from "./JavaBigDecimal.js";
import { javaTrim, NumberFormatException } from "./JavaString.js";

/**
 * The significant digits and exponent that Java's Double.toString uses (Java 19+): the
 * shortest decimal that rounds to the double (as JavaScript also uses), except that at least
 * two digits are needed, and if the shortest has one digit, Java picks the two-digit decimal
 * closest to the exact value (e.g. Double.MIN_VALUE is 4.9E-324, not 5.0E-324).
 */
function javaDoubleDigits(abs: number): { digits: string; exp: number }
{
    const [mantissa, expPart] = abs.toExponential().split("e") as [string, string];
    let digits = mantissa.replace(".", "");
    let exp = Number(expPart);
    if (digits.length === 1)
    {
        const two = decimalFromDoubleExact(abs).toSignificantDigits(2, Decimal.ROUND_HALF_EVEN);
        if (two.toNumber() === abs)
        {
            const [m2, e2] = two.toExponential(1).split("e") as [string, string];
            digits = m2.replace(".", "");
            exp = Number(e2);
        }
        else
            digits += "0";
    }
    return { digits, exp };
}

/**
 * Java's Double.toString(d) (Java 19+): e.g. 2.0 -> "2.0", 1e7 -> "1.0E7", 0.0001 -> "1.0E-4".
 */
export function javaDoubleToString(d: number): string
{
    if (Number.isNaN(d))
        return "NaN";
    if (d === Infinity)
        return "Infinity";
    if (d === -Infinity)
        return "-Infinity";
    if (d === 0)
        return Object.is(d, -0) ? "-0.0" : "0.0";
    const sign = d < 0 ? "-" : "";
    const abs = Math.abs(d);
    const { digits, exp } = javaDoubleDigits(abs);
    if (abs >= 1e-3 && abs < 1e7)
    {
        // Plain notation with at least one digit after the point
        let intPart: string;
        let fracPart: string;
        if (exp >= 0)
        {
            intPart = digits.substring(0, exp + 1).padEnd(exp + 1, "0");
            fracPart = digits.substring(exp + 1);
        }
        else
        {
            intPart = "0";
            fracPart = "0".repeat(-exp - 1) + digits;
        }
        fracPart = fracPart.replace(/0+$/, "");
        return sign + intPart + "." + (fracPart === "" ? "0" : fracPart);
    }
    // Computerized scientific notation, with at least one digit after the point
    const rest = digits.substring(1).replace(/0+$/, "");
    return sign + digits[0] + "." + (rest === "" ? "0" : rest) + "E" + exp;
}

const JAVA_DECIMAL_DOUBLE = /^[+-]?(?:NaN|Infinity|(?:(?:[0-9]+\.?[0-9]*|\.[0-9]+)(?:[eE][+-]?[0-9]+)?)[fFdD]?)$/;
const JAVA_HEX_DOUBLE = /^([+-]?)0[xX]((?:[0-9a-fA-F]+\.?[0-9a-fA-F]*|\.[0-9a-fA-F]+))[pP]([+-]?[0-9]+)[fFdD]?$/;

/**
 * Java's Double.parseDouble / Double.valueOf(String): the string is trimmed (Java's trim),
 * and may be a decimal (with optional f/F/d/D suffix), NaN, Infinity or a hex float.
 * Throws NumberFormatException otherwise.
 * PORT-NOTE: hex floats with more than 53 significant bits may be rounded slightly differently.
 */
export function javaParseDouble(s: string): number
{
    const t = javaTrim(s);
    if (JAVA_DECIMAL_DOUBLE.test(t))
    {
        const body = t.replace(/[fFdD]$/, "");
        if (body.endsWith("NaN"))
            return NaN;
        if (body.endsWith("Infinity"))
            return body.startsWith("-") ? -Infinity : Infinity;
        return Number(body);
    }
    const hex = JAVA_HEX_DOUBLE.exec(t);
    if (hex)
    {
        const [, sign, mantissa, exp] = hex as unknown as [string, string, string, string];
        const [intPart, fracPart = ""] = mantissa.split(".") as [string, string?];
        const value = Number(BigInt("0x" + ((intPart + fracPart) || "0"))) * 2 ** (Number(exp) - 4 * fracPart.length);
        return sign === "-" ? -value : value;
    }
    throw new NumberFormatException(`For input string: "${s}"`);
}

/** Java's (int) cast of a double: truncates, gives 0 for NaN, and saturates at the int range. */
export function javaDoubleToInt(d: number): number
{
    if (Number.isNaN(d))
        return 0;
    if (d >= 2147483647)
        return 2147483647;
    if (d <= -2147483648)
        return -2147483648;
    return Math.trunc(d);
}
