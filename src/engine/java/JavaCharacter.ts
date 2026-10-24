// Equivalents of java.lang.Character classification methods, taking a code point.
// The Unicode version may differ slightly between the JVM and the JS engine;
// this only affects rarely-used, recently-assigned characters.

function test(re: RegExp, codePoint: number): boolean
{
    if (codePoint < 0 || codePoint > 0x10ffff)
        return false;
    return re.test(String.fromCodePoint(codePoint));
}

const ALPHABETIC = /^\p{Alphabetic}$/u;
const LETTER = /^\p{L}$/u;
const DIGIT = /^\p{Nd}$/u;

/** Character.isAlphabetic(int) */
export function isAlphabetic(codePoint: number): boolean
{
    return test(ALPHABETIC, codePoint);
}

/** Character.isLetter(int) */
export function isLetter(codePoint: number): boolean
{
    return test(LETTER, codePoint);
}

/** Character.isDigit(int) */
export function isDigit(codePoint: number): boolean
{
    return test(DIGIT, codePoint);
}

/** Character.isLetterOrDigit(int) */
export function isLetterOrDigit(codePoint: number): boolean
{
    return isLetter(codePoint) || isDigit(codePoint);
}

/**
 * The code points of a string, like Java's String.codePoints(): a surrogate pair
 * gives one code point, and an unpaired surrogate is returned as its own value.
 */
export function codePoints(s: string): number[]
{
    const result: number[] = [];
    for (const ch of s)
        result.push(ch.codePointAt(0)!);
    return result;
}

/**
 * Java's new String(int[] codePoints, offset, count).  Throws a RangeError
 * (Java: IllegalArgumentException) for values that are not valid code points.
 */
export function stringFromCodePoints(cps: readonly number[], offset: number = 0, count: number = cps.length - offset): string
{
    const CHUNK = 8192;
    const parts: string[] = [];
    for (let i = offset; i < offset + count; i += CHUNK)
        parts.push(String.fromCodePoint(...cps.slice(i, Math.min(i + CHUNK, offset + count))));
    return parts.join("");
}

const SPACE_SEPARATOR_ETC = /^[\p{Zs}\p{Zl}\p{Zp}]$/u;

/**
 * Character.isWhitespace(int): space, line and paragraph separators except the
 * non-breaking ones (U+00A0, U+2007, U+202F), plus \t \n U+000B \f \r and U+001C-U+001F.
 * Note this differs from both JavaScript's \s and the Unicode White_Space property.
 */
export function isWhitespace(codePoint: number): boolean
{
    if ((codePoint >= 0x09 && codePoint <= 0x0d) || (codePoint >= 0x1c && codePoint <= 0x1f))
        return true;
    if (codePoint === 0xa0 || codePoint === 0x2007 || codePoint === 0x202f)
        return false;
    return test(SPACE_SEPARATOR_ETC, codePoint);
}

const UNASSIGNED = /^\p{Cn}$/u;
const OTHER_LETTER = /^\p{Lo}$/u;

/** Character.isDefined(int): the code point is assigned in Unicode. */
export function isDefined(codePoint: number): boolean
{
    return codePoint >= 0 && codePoint <= 0x10ffff && !test(UNASSIGNED, codePoint);
}

/** Character.getType(int) == Character.OTHER_LETTER */
export function isOtherLetter(codePoint: number): boolean
{
    return test(OTHER_LETTER, codePoint);
}

const CURRENCY_SYMBOL = /^\p{Sc}$/u;

/** Character.getType(int) == Character.CURRENCY_SYMBOL */
export function isCurrencySymbol(codePoint: number): boolean
{
    return test(CURRENCY_SYMBOL, codePoint);
}

// Chars whose simple (one-to-one) case mapping, which Java uses, is not their full mapping
// (which JavaScript's toUpperCase/toLowerCase use) and isn't the char itself: the Greek letters
// with ypogegrammeni uppercase to the titlecase letters with prosgegrammeni, and U+0130
// lowercases to plain "i".
const SIMPLE_UPPER_EXCEPTIONS = new Map<number, number>([
    ...[0x1f80, 0x1f90, 0x1fa0].flatMap(base => Array.from({ length: 8 }, (_, i) => [base + i, base + i + 8] as [number, number])),
    [0x1fb3, 0x1fbc], [0x1fc3, 0x1fcc], [0x1ff3, 0x1ffc],
]);
const SIMPLE_LOWER_EXCEPTIONS = new Map<number, number>([[0x130, 0x69]]);

/**
 * Character.toUpperCase(char): the simple (one-to-one) uppercase mapping.  Where Unicode
 * only has a multi-character mapping (e.g. "ß" -> "SS"), Java leaves the char unchanged.
 */
export function charToUpperCase(c: string): string
{
    const exception = SIMPLE_UPPER_EXCEPTIONS.get(c.charCodeAt(0));
    if (exception !== undefined && c.length === 1)
        return String.fromCharCode(exception);
    const upper = c.toUpperCase();
    return upper.length === c.length ? upper : c;
}

/** Character.toLowerCase(char): the simple (one-to-one) lowercase mapping. */
export function charToLowerCase(c: string): string
{
    const exception = SIMPLE_LOWER_EXCEPTIONS.get(c.charCodeAt(0));
    if (exception !== undefined && c.length === 1)
        return String.fromCharCode(exception);
    const lower = c.toLowerCase();
    return lower.length === c.length ? lower : c;
}
