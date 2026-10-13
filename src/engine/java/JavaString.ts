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

// Character.digit(char, radix), restricted to ASCII.  Java additionally accepts
// non-ASCII Unicode decimal digits and fullwidth Latin letters; Columnal never
// relies on that (it parses hex escapes and file-format numbers), so we don't.
function javaDigit(code: number, radix: number): number
{
    let value = -1;
    if (code >= 0x30 && code <= 0x39)
        value = code - 0x30;
    else if (code >= 0x61 && code <= 0x7a)
        value = code - 0x61 + 10;
    else if (code >= 0x41 && code <= 0x5a)
        value = code - 0x41 + 10;
    return value < radix ? value : -1;
}
