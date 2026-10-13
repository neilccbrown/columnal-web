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
