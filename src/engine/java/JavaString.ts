import { charToLowerCase, charToUpperCase } from "./JavaCharacter.js";
import { IndexOutOfBoundsException } from "./JavaExceptions.js";

// Helpers that reproduce the semantics of java.lang.String / Integer methods
// where they differ from the JavaScript built-ins.  See docs/CONVENTIONS.md.

/**
 * Java's String.trim(): removes leading and trailing characters whose code is
 * <= U+0020 (all ASCII control characters and space).  Unlike JavaScript's
 * String.prototype.trim(), it does not remove Unicode whitespace such as U+00A0,
 * but it does remove control characters such as U+0001.
 */
export function javaTrim(s: string): string
{
    let start = 0;
    let end = s.length;
    while (start < end && s.charCodeAt(start) <= 0x20)
        start += 1;
    while (end > start && s.charCodeAt(end - 1) <= 0x20)
        end -= 1;
    return start === 0 && end === s.length ? s : s.substring(start, end);
}

/** Equivalent of java.lang.NumberFormatException. */
export class NumberFormatException extends Error
{
    constructor(message: string)
    {
        super(message);
        this.name = "NumberFormatException";
    }
}

const INT_MIN = -0x80000000;
const INT_MAX = 0x7fffffff;

/**
 * Java's Integer.parseInt(s, radix): an optional '+' or '-' followed by one or more
 * digits in the radix, with nothing else (no whitespace), fitting in a 32-bit int.
 * Throws NumberFormatException otherwise.
 */
export function javaParseInt(s: string, radix: number = 10): number
{
    if (radix < 2 || radix > 36)
        throw new NumberFormatException(`radix ${radix} out of range`);
    let i = 0;
    let negative = false;
    if (s.length > 0 && (s[0] === "-" || s[0] === "+"))
    {
        negative = s[0] === "-";
        i = 1;
    }
    if (i >= s.length)
        throw new NumberFormatException(`For input string: "${s}"` + (radix === 10 ? "" : ` under radix ${radix}`));
    let result = 0;
    for (; i < s.length; i++)
    {
        const digit = javaDigit(s.charCodeAt(i), radix);
        if (digit < 0)
            throw new NumberFormatException(`For input string: "${s}"` + (radix === 10 ? "" : ` under radix ${radix}`));
        result = result * radix + digit;
        // Stop early so the accumulated value stays exact in a double:
        if (result > -INT_MIN)
            throw new NumberFormatException(`For input string: "${s}"` + (radix === 10 ? "" : ` under radix ${radix}`));
    }
    const value = negative ? -result : result;
    if (value < INT_MIN || value > INT_MAX)
        throw new NumberFormatException(`For input string: "${s}"` + (radix === 10 ? "" : ` under radix ${radix}`));
    return value;
}

const DECIMAL_DIGIT = /^\p{Nd}$/u;

/**
 * Character.digit(char, radix): ASCII digits and letters, fullwidth letters, and any
 * (BMP) Unicode decimal digit, e.g. Arabic-Indic digits.  Returns -1 if not a digit.
 * (In the BMP, Unicode decimal digits come in separate runs of exactly ten, 0 to 9.)
 */
export function javaDigit(code: number, radix: number): number
{
    let value = -1;
    if (code >= 0x30 && code <= 0x39)
        value = code - 0x30;
    else if (code >= 0x61 && code <= 0x7a)
        value = code - 0x61 + 10;
    else if (code >= 0x41 && code <= 0x5a)
        value = code - 0x41 + 10;
    else if (code >= 0xff21 && code <= 0xff3a) // Fullwidth A-Z
        value = code - 0xff21 + 10;
    else if (code >= 0xff41 && code <= 0xff5a) // Fullwidth a-z
        value = code - 0xff41 + 10;
    else if (code >= 0x80 && code <= 0xffff && DECIMAL_DIGIT.test(String.fromCharCode(code)))
    {
        let zero = code;
        while (zero > code - 9 && DECIMAL_DIGIT.test(String.fromCharCode(zero - 1)))
            zero -= 1;
        value = code - zero;
    }
    return value < radix ? value : -1;
}

/** Replaces non-ASCII decimal digits (which Java accepts in numbers) with ASCII ones. */
export function normalizeJavaDigits(s: string): string
{
    // eslint-disable-next-line no-control-regex
    if (/^[\x00-\x7f]*$/.test(s))
        return s;
    let r = "";
    for (let i = 0; i < s.length; i++)
    {
        const c = s.charCodeAt(i);
        const d = c >= 0x80 && !(c >= 0xff21 && c <= 0xff5a) ? javaDigit(c, 10) : -1;
        r += d >= 0 ? String.fromCharCode(0x30 + d) : s[i];
    }
    return r;
}

const LONG_MIN = -(1n << 63n);
const LONG_MAX = (1n << 63n) - 1n;

/**
 * Java's Long.parseLong(s) / Long.valueOf(s): an optional sign then one or more decimal
 * digits (including non-ASCII Unicode digits, as Java accepts), fitting in a long.
 * Throws NumberFormatException otherwise.
 */
export function javaParseLong(s: string): bigint
{
    const ascii = normalizeJavaDigits(s);
    if (!/^[+-]?[0-9]+$/.test(ascii))
        throw new NumberFormatException(`For input string: "${s}"`);
    const value = BigInt(ascii);
    if (value < LONG_MIN || value > LONG_MAX)
        throw new NumberFormatException(`For input string: "${s}"`);
    return value;
}

/**
 * Java's String.split(regex), following Pattern.split with limit 0: a zero-width match at
 * the start never produces a leading empty string, a string with no match gives the whole
 * string, and trailing empty strings are removed.  The regex is in JavaScript syntax.
 */
export function javaSplit(s: string, regex: RegExp): string[]
{
    const global = new RegExp(regex.source, regex.flags.includes("g") ? regex.flags : regex.flags + "g");
    const parts: string[] = [];
    let index = 0;
    for (const m of s.matchAll(global))
    {
        const start = m.index;
        const end = start + m[0].length;
        if (index === 0 && start === 0 && start === end)
            continue; // No leading empty string for a zero-width match at the start
        parts.push(s.substring(index, start));
        index = end;
    }
    // If no match was found, return the whole string:
    if (index === 0)
        return [s];
    parts.push(s.substring(index));
    while (parts.length > 0 && parts[parts.length - 1] === "")
        parts.pop();
    return parts;
}

/** Java's String.regionMatches(ignoreCase, toffset, other, ooffset, len). */
export function javaRegionMatches(s: string, ignoreCase: boolean, toffset: number, other: string, ooffset: number, len: number): boolean
{
    if (ooffset < 0 || toffset < 0 || toffset > s.length - len || ooffset > other.length - len)
        return false;
    for (let i = 0; i < len; i++)
    {
        const c1 = s[toffset + i]!;
        const c2 = other[ooffset + i]!;
        if (c1 === c2)
            continue;
        if (!ignoreCase)
            return false;
        // As Java: compare the uppercase forms, then the lowercase forms of those
        const u1 = charToUpperCase(c1);
        const u2 = charToUpperCase(c2);
        if (u1 !== u2 && charToLowerCase(u1) !== charToLowerCase(u2))
            return false;
    }
    return true;
}

/**
 * Java's String.replace(CharSequence target, CharSequence replacement): replaces every
 * occurrence, treating both strings literally.  (JavaScript's replaceAll would interpret
 * "$&", "$1" etc. in a replacement string, so always use this when porting String.replace.)
 */
export function javaReplace(s: string, target: string, replacement: string): string
{
    if (target === "")
    {
        // Java inserts the replacement before every char and at the end
        return replacement + Array.from({ length: s.length }, (_, i) => s[i]! + replacement).join("");
    }
    return s.split(target).join(replacement);
}

/** Java's String.codePointCount(0, length()): an unpaired surrogate counts as one code point. */
export function javaCodePointCount(s: string, beginIndex: number = 0, endIndex: number = s.length): number
{
    let count = 0;
    for (let i = beginIndex; i < endIndex; i++)
    {
        const c = s.charCodeAt(i);
        if (c >= 0xD800 && c <= 0xDBFF && i + 1 < endIndex)
        {
            const d = s.charCodeAt(i + 1);
            if (d >= 0xDC00 && d <= 0xDFFF)
                i += 1;
        }
        count += 1;
    }
    return count;
}

/**
 * Java's String.offsetByCodePoints(index, codePointOffset) for a non-negative offset: the char
 * index codePointOffset code points after index.  Throws IndexOutOfBoundsException if the
 * string runs out first.
 */
export function javaOffsetByCodePoints(s: string, index: number, codePointOffset: number): number
{
    if (index < 0 || index > s.length || codePointOffset < 0)
        throw new IndexOutOfBoundsException("offsetByCodePoints");
    let x = index;
    for (let i = 0; i < codePointOffset; i++)
    {
        if (x >= s.length)
            throw new IndexOutOfBoundsException("offsetByCodePoints");
        const c = s.charCodeAt(x++);
        if (c >= 0xD800 && c <= 0xDBFF && x < s.length)
        {
            const d = s.charCodeAt(x);
            if (d >= 0xDC00 && d <= 0xDFFF)
                x += 1;
        }
    }
    return x;
}

/**
 * Java's s.getBytes(StandardCharsets.UTF_8).  TextEncoder writes a lone surrogate as U+FFFD,
 * where Java writes '?'.
 */
export function javaUtf8Bytes(s: string): Uint8Array
{
    return new TextEncoder().encode(s.replace(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g, "?"));
}
