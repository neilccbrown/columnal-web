// Encoding text as Java does, for tests that write files in a charset (the engine only decodes).
import iconv from "iconv-lite";
import type { Charset } from "../../src/engine/java/JavaCharset.js";

/**
 * Java's String.getBytes(charset) (as FileUtils.writeStringToFile uses): UTF-16 is big-endian
 * with a byte order mark.  Characters the charset can't encode become "?".
 */
export function javaEncode(s: string, charset: Charset): Uint8Array
{
    if (charset.name() === "UTF-16")
        return iconv.encode(s, "utf16-be", { addBOM: true });
    return iconv.encode(s, charset.name());
}

/**
 * Java's charset.newEncoder().canEncode(s).  Only for the charsets the tests use (ISO-8859-1,
 * US-ASCII and the Unicode charsets), where it is exact.
 */
export function canEncode(charset: Charset, s: string): boolean
{
    for (let i = 0; i < s.length; i++)
    {
        const c = s.charCodeAt(i);
        // An unpaired surrogate can't be encoded in any charset:
        if (c >= 0xD800 && c <= 0xDBFF)
        {
            const next = s.charCodeAt(i + 1);
            if (!(next >= 0xDC00 && next <= 0xDFFF))
                return false;
            i++;
            if (!charset.name().startsWith("UTF"))
                return false;
            continue;
        }
        if (c >= 0xDC00 && c <= 0xDFFF)
            return false;
        if (charset.name() === "ISO-8859-1" && c > 0xFF)
            return false;
        if (charset.name() === "US-ASCII" && c > 0x7F)
            return false;
    }
    return true;
}
