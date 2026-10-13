// Port of xyz.columnal.grammar.GrammarUtility (parsers module).
import { javaParseInt, javaTrim, NumberFormatException } from "../../java/JavaString.js";
import { codePoints, isAlphabetic, isDigit, isLetter, isLetterOrDigit, stringFromCodePoints } from "../../java/JavaCharacter.js";

export class GrammarUtility
{
    /**
     * Processes out all the escapes in a string.  By default the string is quoted,
     * and the first and last characters (the quotes) are dropped.
     */
    public static processEscapes(escaped: string, beginsAndEndsWithQuotes: boolean = true): string
    {
        // Removing escapes always shortens so longest length is original - 2 (the quotes):
        const result: number[] = [];
        // Don't process first and last because they are quotes
        const end = escaped.length - (beginsAndEndsWithQuotes ? 1 : 0);
        for (let i = beginsAndEndsWithQuotes ? 1 : 0; i < end; i++)
        {
            // We can do it using chars not codepoints because non-^ characters
            // will be perfectly preserved:
            let c = escaped.charCodeAt(i);
            if (c === 0x5e /* ^ */)
            {
                if (i + 1 < end)
                {
                    switch (escaped[i + 1])
                    {
                        case "r":
                            c = 0x0d;
                            break;
                        case "n":
                            c = 0x0a;
                            break;
                        case "q":
                            c = 0x22; // "
                            break;
                        case "c":
                            c = 0x5e; // ^
                            break;
                        case "a":
                            c = 0x40; // @
                            break;
                        case "t":
                            c = 0x09;
                            break;
                        case "{":
                        {
                            const close = escaped.indexOf("}", i + 2);
                            if (close !== -1)
                            {
                                const hex = escaped.substring(i + 2, close);
                                try
                                {
                                    c = javaParseInt(javaTrim(hex), 16);
                                    i = close - 1;
                                    break;
                                }
                                catch (e)
                                {
                                    if (!(e instanceof NumberFormatException))
                                        throw e;
                                    // Not a number, invalid
                                }
                            }
                            // If invalid escape:
                            c = escaped.charCodeAt(i + 1);
                            break;
                        }
                        default:
                            // Invalid escape, probably came from user edit.  Best bet
                            // is just to preserve it:
                            c = escaped.charCodeAt(i + 1);
                            break;
                    }
                }
                else
                {
                    // Invalid, but retain it:
                    c = 0x5e;
                }
                i += 1;
            }

            result.push(c);
        }
        return stringFromCodePoints(result);
    }

    /**
     * Things like a00, abcd, random unicode emoji, return true
     * Things like 0aa, a+0, a!0, "a a" return false
     *
     * This method is used both to check for valid variable names and
     * what can be printed without needing quotes (same concept, essentially)
     */
    public static validUnquoted(s: string): boolean
    {
        if (s === "" || s === "true" || s === "false")
            return false;
        const cps = codePoints(s);
        if (!isAlphabetic(cps[0]!))
            return false;
        // Underscore is not letter or digit, so needs special case here:
        return cps.slice(1).every(c => isLetterOrDigit(c) || c === 0x5f /* _ */ || c === 0x20);
    }

    public static validIdentifier(s: string): boolean
    {
        if (s === "")
            return false;
        const cps = codePoints(s);
        if (!isLetter(cps[0]!))
            return false;
        const SPACE_CODEPOINT = 32;
        let lastWasSpace = false;
        for (let i = 1; i < cps.length; i++)
        {
            if (isAlphabetic(cps[i]!) || isDigit(cps[i]!))
            {
                lastWasSpace = false;
            }
            else if (cps[i] === SPACE_CODEPOINT)
            {
                if (lastWasSpace)
                    return false;
                lastWasSpace = true;
            }
            else
                return false;
        }
        return !lastWasSpace;
    }

    public static escapeChars(s: string): string
    {
        // Order matters; must replace ^ first:
        return s.replaceAll("^", "^c").replaceAll("\"", "^q").replaceAll("\n", "^n").replaceAll("\r", "^r").replaceAll("@", "^a");
    }

    /**
     * Gets rid of beginning and trailing spaces, and collapses all other
     * consecutive whitespace into a single space.
     */
    public static collapseSpaces(s: string): string
    {
        // Java's (?U)\s matches the Unicode White_Space property:
        return javaTrim(s.replace(/\p{White_Space}+/gu, " "));
    }
}
