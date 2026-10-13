// A port of the .properties file format as read by java.util.Properties.load(Reader)
// (and so by PropertyResourceBundle): comments, line continuations, separators and escapes.

// Reads the logical lines of a properties file, as Properties.LineReader does.
function* logicalLines(text: string): Generator<string>
{
    let off = 0;
    const limit = text.length;
    let skipLF = false;
    while (true)
    {
        let line = "";
        let skipWhiteSpace = true;
        let appendedLineBegin = false;
        let precedingBackslash = false;
        let returned = false;
        while (off < limit)
        {
            const c = text[off++]!;
            if (skipLF)
            {
                skipLF = false;
                if (c === "\n")
                    continue;
            }
            if (skipWhiteSpace)
            {
                if (c === " " || c === "\t" || c === "\f")
                    continue;
                if (!appendedLineBegin && (c === "\r" || c === "\n"))
                    continue;
                skipWhiteSpace = false;
                appendedLineBegin = false;
            }
            if (line.length === 0) // Still on a new logical line
            {
                if (c === "#" || c === "!")
                {
                    // Comment, consume the rest of the line (a trailing backslash does not continue it)
                    while (off < limit)
                    {
                        const d = text[off++]!;
                        if (d === "\n")
                            break;
                        if (d === "\r")
                        {
                            skipLF = true;
                            break;
                        }
                    }
                    skipWhiteSpace = true;
                    continue;
                }
            }
            if (c !== "\n" && c !== "\r")
            {
                line += c;
                // flip the preceding backslash flag
                precedingBackslash = c === "\\" ? !precedingBackslash : false;
            }
            else
            {
                // reached EOL
                if (line.length === 0)
                {
                    skipWhiteSpace = true;
                    continue;
                }
                if (precedingBackslash)
                {
                    // backslash at EOL is not part of the line
                    line = line.substring(0, line.length - 1);
                    // skip leading whitespace characters in the following line
                    skipWhiteSpace = true;
                    appendedLineBegin = true;
                    precedingBackslash = false;
                    // take care not to include any subsequent \n
                    if (c === "\r")
                        skipLF = true;
                }
                else
                {
                    returned = true;
                    break;
                }
            }
        }
        if (returned)
        {
            yield line;
            continue;
        }
        // End of input:
        if (line.length === 0)
            return;
        yield precedingBackslash ? line.substring(0, line.length - 1) : line;
        return;
    }
}

// Properties.loadConvert: processes escapes.
function loadConvert(s: string): string
{
    let out = "";
    let off = 0;
    while (off < s.length)
    {
        let c = s[off++]!;
        if (c === "\\" && off < s.length)
        {
            c = s[off++]!;
            if (c === "u")
            {
                // Read the xxxx
                if (off > s.length - 4)
                    throw new RangeError("Malformed \\uxxxx encoding."); // Java: IllegalArgumentException
                const hex = s.substring(off, off + 4);
                if (!/^[0-9a-fA-F]{4}$/.test(hex))
                    throw new RangeError("Malformed \\uxxxx encoding.");
                out += String.fromCharCode(parseInt(hex, 16));
                off += 4;
            }
            else
            {
                if (c === "t") c = "\t";
                else if (c === "r") c = "\r";
                else if (c === "n") c = "\n";
                else if (c === "f") c = "\f";
                out += c;
            }
        }
        else
        {
            out += c;
        }
    }
    return out;
}

/** Parses the text of a .properties file into its key/value pairs (later keys replace earlier ones). */
export function loadProperties(text: string): Map<string, string>
{
    const result = new Map<string, string>();
    for (const line of logicalLines(text))
    {
        const limit = line.length;
        let keyLen = 0;
        let valueStart = limit;
        let hasSep = false;
        let precedingBackslash = false;
        while (keyLen < limit)
        {
            const c = line[keyLen]!;
            // need check if escaped.
            if ((c === "=" || c === ":") && !precedingBackslash)
            {
                valueStart = keyLen + 1;
                hasSep = true;
                break;
            }
            else if ((c === " " || c === "\t" || c === "\f") && !precedingBackslash)
            {
                valueStart = keyLen + 1;
                break;
            }
            if (c === "\\")
                precedingBackslash = !precedingBackslash;
            else
                precedingBackslash = false;
            keyLen++;
        }
        while (valueStart < limit)
        {
            const c = line[valueStart]!;
            if (c !== " " && c !== "\t" && c !== "\f")
            {
                if (!hasSep && (c === "=" || c === ":"))
                    hasSep = true;
                else
                    break;
            }
            valueStart++;
        }
        result.set(loadConvert(line.substring(0, keyLen)), loadConvert(line.substring(valueStart)));
    }
    return result;
}
