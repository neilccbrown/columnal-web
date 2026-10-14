// Stand-in for java.nio.charset.Charset, for decoding the bytes of text files.
//
// PORT-NOTE: decoding uses the browser's TextDecoder (the WHATWG Encoding Standard), so only the
// charsets that it supports are available, under their Java names.  For most charsets the byte
// mappings are the same as Java's, but not all: for example, WHATWG decodes the five unassigned
// bytes of windows-1252 as C1 control characters where Java gives U+FFFD.  ISO-8859-1, US-ASCII
// and UTF-16 are decoded here as Java does, because WHATWG treats them differently (it reads
// ISO-8859-1 as windows-1252, and UTF-16 as little-endian).  As in Java, a byte order mark is
// kept as a character, except by UTF-16, which uses it to pick the byte order.
// Malformed input is replaced by U+FFFD, as Java's InputStreamReader does.

export class Charset
{
    private constructor(
        private readonly javaName: string,
        // A WHATWG encoding label, or null if decoded by specialDecode
        private readonly whatwgLabel: string | null,
        private readonly specialDecode: ((bytes: Uint8Array) => string) | null)
    {
    }

    public name(): string
    {
        return this.javaName;
    }

    public displayName(): string
    {
        return this.javaName;
    }

    public decode(bytes: Uint8Array): string
    {
        if (this.specialDecode !== null)
            return this.specialDecode(bytes);
        return new TextDecoder(this.whatwgLabel!, { ignoreBOM: true }).decode(bytes);
    }

    public equals(o: unknown): boolean
    {
        return o instanceof Charset && o.javaName === this.javaName;
    }

    public toString(): string
    {
        return this.javaName;
    }

    /** Java: Charset.forName.  Accepts the Java name, ignoring case. */
    public static forName(name: string): Charset
    {
        const c = Charset.ALL.find(c => c.javaName.toLowerCase() === name.toLowerCase());
        if (c === undefined)
            throw new Error("UnsupportedCharsetException: " + name);
        return c;
    }

    /** Java: Charset.availableCharsets(), sorted by name (ignoring case), as Java's is. */
    public static availableCharsets(): ReadonlyMap<string, Charset>
    {
        return new Map([...Charset.ALL]
            .sort((a, b) => a.javaName.toLowerCase() < b.javaName.toLowerCase() ? -1 : 1)
            .map(c => [c.javaName, c] as const));
    }

    private static whatwg(javaName: string, whatwgLabel: string): Charset
    {
        return new Charset(javaName, whatwgLabel, null);
    }

    public static readonly UTF_8 = Charset.whatwg("UTF-8", "utf-8");
    public static readonly ISO_8859_1 = new Charset("ISO-8859-1", null, bytes =>
    {
        let s = "";
        for (const b of bytes)
            s += String.fromCharCode(b);
        return s;
    });
    public static readonly US_ASCII = new Charset("US-ASCII", null, bytes =>
    {
        let s = "";
        for (const b of bytes)
            s += b < 0x80 ? String.fromCharCode(b) : "�";
        return s;
    });
    public static readonly UTF_16BE = Charset.whatwg("UTF-16BE", "utf-16be");
    public static readonly UTF_16LE = Charset.whatwg("UTF-16LE", "utf-16le");
    public static readonly UTF_16 = new Charset("UTF-16", null, bytes =>
    {
        // Java: a byte order mark picks the byte order (and is removed); the default is big-endian.
        if (bytes.length >= 2 && bytes[0] === 0xFF && bytes[1] === 0xFE)
            return Charset.UTF_16LE.decode(bytes.subarray(2));
        if (bytes.length >= 2 && bytes[0] === 0xFE && bytes[1] === 0xFF)
            return Charset.UTF_16BE.decode(bytes.subarray(2));
        return Charset.UTF_16BE.decode(bytes);
    });

    private static readonly ALL: readonly Charset[] = [
        Charset.UTF_8, Charset.ISO_8859_1, Charset.US_ASCII, Charset.UTF_16, Charset.UTF_16BE, Charset.UTF_16LE,
        Charset.whatwg("Big5", "big5"),
        Charset.whatwg("EUC-JP", "euc-jp"),
        Charset.whatwg("EUC-KR", "euc-kr"),
        Charset.whatwg("GB18030", "gb18030"),
        Charset.whatwg("GBK", "gbk"),
        Charset.whatwg("IBM866", "ibm866"),
        Charset.whatwg("ISO-2022-JP", "iso-2022-jp"),
        Charset.whatwg("ISO-8859-2", "iso-8859-2"),
        Charset.whatwg("ISO-8859-3", "iso-8859-3"),
        Charset.whatwg("ISO-8859-4", "iso-8859-4"),
        Charset.whatwg("ISO-8859-5", "iso-8859-5"),
        Charset.whatwg("ISO-8859-6", "iso-8859-6"),
        Charset.whatwg("ISO-8859-7", "iso-8859-7"),
        Charset.whatwg("ISO-8859-8", "iso-8859-8"),
        Charset.whatwg("ISO-8859-13", "iso-8859-13"),
        Charset.whatwg("ISO-8859-15", "iso-8859-15"),
        Charset.whatwg("ISO-8859-16", "iso-8859-16"),
        Charset.whatwg("KOI8-R", "koi8-r"),
        Charset.whatwg("KOI8-U", "koi8-u"),
        Charset.whatwg("Shift_JIS", "shift_jis"),
        Charset.whatwg("windows-1250", "windows-1250"),
        Charset.whatwg("windows-1251", "windows-1251"),
        Charset.whatwg("windows-1252", "windows-1252"),
        Charset.whatwg("windows-1253", "windows-1253"),
        Charset.whatwg("windows-1254", "windows-1254"),
        Charset.whatwg("windows-1255", "windows-1255"),
        Charset.whatwg("windows-1256", "windows-1256"),
        Charset.whatwg("windows-1257", "windows-1257"),
        Charset.whatwg("windows-1258", "windows-1258"),
        Charset.whatwg("x-MacCyrillic", "x-mac-cyrillic"),
        Charset.whatwg("x-MacRoman", "macintosh"),
        Charset.whatwg("x-windows-874", "windows-874"),
    ];
}
