// Stand-ins for the parts of jsoup 1.15.3 (MIT licence, https://jsoup.org) that the HTML
// importer uses, over the browser's DOM: parsing an HTML file (with jsoup's charset detection),
// and Element.text() and Element.wholeText(), whose results differ from the DOM's textContent.
// The text methods are ported from jsoup's Element, Tag and StringUtil.
//
// PORT-NOTE: parsing uses the browser's DOMParser (HTML5 parsing, as jsoup's parser also
// follows), so a document can be parsed into a slightly different tree in unusual cases.  In
// jsoup the contents of <script> and <style> are data, not text; here those Text nodes are
// skipped for the same effect.
import { Charset } from "./JavaCharset.js";
import { javaTrim } from "./JavaString.js";

// jsoup's Tag.blockTags: every other known tag, and any unknown tag, is inline.
const BLOCK_TAGS = new Set([
    "html", "head", "body", "frameset", "script", "noscript", "style", "meta", "link", "title", "frame",
    "noframes", "section", "nav", "aside", "hgroup", "header", "footer", "p", "h1", "h2", "h3", "h4", "h5", "h6",
    "ul", "ol", "pre", "div", "blockquote", "hr", "address", "figure", "figcaption", "form", "fieldset", "ins",
    "del", "dl", "dt", "dd", "li", "table", "caption", "thead", "tfoot", "tbody", "colgroup", "col", "tr", "th",
    "td", "video", "audio", "canvas", "details", "menu", "plaintext", "template", "article", "main",
    "svg", "math", "center", "template",
    "dir", "applet", "marquee", "listing",
]);
// jsoup's Tag.preserveWhitespaceTags
const PRESERVE_WHITESPACE_TAGS = new Set(["pre", "plaintext", "title", "textarea"]);
// Elements whose contents jsoup parses as data nodes rather than text:
const DATA_TAGS = new Set(["script", "style"]);

const ELEMENT_NODE = 1;
const TEXT_NODE = 3;
const CDATA_SECTION_NODE = 4;

function normalName(element: Element): string
{
    return element.localName.toLowerCase();
}

function isBlock(element: Element): boolean
{
    return BLOCK_TAGS.has(normalName(element));
}

// A text node as jsoup would see it (not data inside a script or style element):
function isTextNode(node: Node): node is CharacterData
{
    if (node.nodeType !== TEXT_NODE && node.nodeType !== CDATA_SECTION_NODE)
        return false;
    const parent = node.parentNode;
    return !(parent !== null && parent.nodeType === ELEMENT_NODE && DATA_TAGS.has(normalName(parent as Element)));
}

// jsoup's NodeTraversor.traverse: depth-first, calling head on entering and tail on leaving each node.
function traverse(root: Node, head: (node: Node) => void, tail: (node: Node) => void): void
{
    head(root);
    for (let child = root.firstChild; child !== null; child = child.nextSibling)
        traverse(child, head, tail);
    tail(root);
}

// jsoup's TextNode.lastCharIsWhitespace
function lastCharIsWhitespace(accum: string): boolean
{
    return accum.length !== 0 && accum.charAt(accum.length - 1) === " ";
}

// jsoup's Element.preserveWhitespace: looks only at this element and five levels up
function preserveWhitespace(node: Node | null): boolean
{
    if (node !== null && node.nodeType === ELEMENT_NODE)
    {
        let el: Element | null = node as Element;
        let i = 0;
        do
        {
            if (PRESERVE_WHITESPACE_TAGS.has(normalName(el)))
                return true;
            el = el.parentElement;
            i++;
        } while (i < 6 && el !== null);
    }
    return false;
}

// jsoup's StringUtil.isActuallyWhitespace
function isActuallyWhitespace(c: number): boolean
{
    return c === 0x20 || c === 0x09 || c === 0x0A || c === 0x0C || c === 0x0D || c === 160;
}

// jsoup's StringUtil.isInvisibleChar: zero width space, soft hyphen
function isInvisibleChar(c: number): boolean
{
    return c === 8203 || c === 173;
}

// jsoup's StringUtil.appendNormalisedWhitespace, returning the new accumulated string
function appendNormalisedWhitespace(accum: string, s: string, stripLeading: boolean): string
{
    let lastWasWhite = false;
    let reachedNonWhite = false;
    for (const ch of s)
    {
        const c = ch.codePointAt(0)!;
        if (isActuallyWhitespace(c))
        {
            if ((stripLeading && !reachedNonWhite) || lastWasWhite)
                continue;
            accum += " ";
            lastWasWhite = true;
        }
        else if (!isInvisibleChar(c))
        {
            accum += ch;
            lastWasWhite = false;
            reachedNonWhite = true;
        }
    }
    return accum;
}

/** jsoup's Element.text(): the normalised, combined text of the element and its children. */
export function jsoupText(element: Element): string
{
    let accum = "";
    traverse(element, node =>
    {
        if (isTextNode(node))
        {
            const text = node.data;
            if (preserveWhitespace(node.parentNode) || node.nodeType === CDATA_SECTION_NODE)
                accum += text;
            else
                accum = appendNormalisedWhitespace(accum, text, lastCharIsWhitespace(accum));
        }
        else if (node.nodeType === ELEMENT_NODE)
        {
            const el = node as Element;
            if (accum.length > 0 &&
                (isBlock(el) || normalName(el) === "br") &&
                !lastCharIsWhitespace(accum))
                accum += " ";
        }
    }, node =>
    {
        // make sure there is a space between block tags and immediately following text nodes <div>One</div>Two should be "One Two".
        if (node.nodeType === ELEMENT_NODE)
        {
            const el = node as Element;
            const next = node.nextSibling;
            if (isBlock(el) && next !== null && isTextNode(next) && !lastCharIsWhitespace(accum))
                accum += " ";
        }
    });
    return javaTrim(accum);
}

/** jsoup's Element.wholeText(): the text of the element and its children, unnormalised, with <br> as a newline. */
export function jsoupWholeText(element: Element): string
{
    let accum = "";
    traverse(element, node =>
    {
        if (isTextNode(node))
            accum += node.data;
        else if (node.nodeType === ELEMENT_NODE && normalName(node as Element) === "br")
            accum += "\n";
    }, () => {});
    return accum;
}

/**
 * jsoup's Jsoup.parse(File, null): decodes the file, then parses it as HTML.  The charset comes from
 * a byte order mark, else from a <meta> charset or http-equiv Content-Type (or an XML declaration)
 * in the document as first decoded as UTF-8, else is UTF-8.
 */
export function jsoupParse(bytes: Uint8Array): Document
{
    const parse = (text: string): Document => new DOMParser().parseFromString(text, "text/html");

    const bom = detectBOM(bytes);
    if (bom !== null)
        return parse(bom.charset.decode(bytes.subarray(bom.length)));

    let doc = parse(Charset.UTF_8.decode(bytes));
    let foundCharset: string | null = null;
    for (const meta of Array.from(doc.querySelectorAll("meta[http-equiv=content-type], meta[charset]")))
    {
        if (meta.hasAttribute("http-equiv"))
            foundCharset = getCharsetFromContentType(meta.getAttribute("content") ?? "");
        if (foundCharset === null && meta.hasAttribute("charset"))
            foundCharset = meta.getAttribute("charset");
        if (foundCharset !== null)
            break;
    }
    if (foundCharset === null)
    {
        // An XML declaration, which the HTML parser turns into a comment:
        const first = doc.firstChild;
        if (first !== null && first.nodeType === 8 /* COMMENT_NODE */)
        {
            const m = /^\?xml.*encoding\s*=\s*["']?([^"'\s?]+)/i.exec((first as Comment).data);
            if (m !== null)
                foundCharset = m[1]!;
        }
    }
    foundCharset = validateCharset(foundCharset);
    if (foundCharset !== null && foundCharset.toLowerCase() !== "utf-8")
    {
        const charset = Charset.forName(javaTrim(foundCharset).replace(/["']/g, ""));
        doc = parse(charset.decode(bytes));
    }
    return doc;
}

function detectBOM(bytes: Uint8Array): { charset: Charset, length: number } | null
{
    const b = (i: number): number => bytes[i] ?? -1;
    if ((b(0) === 0x00 && b(1) === 0x00 && b(2) === 0xFE && b(3) === 0xFF) || (b(0) === 0xFF && b(1) === 0xFE && b(2) === 0x00 && b(3) === 0x00))
        return null; // UTF-32, which TextDecoder can't decode (jsoup would use it)
    if ((b(0) === 0xFE && b(1) === 0xFF) || (b(0) === 0xFF && b(1) === 0xFE))
        return { charset: Charset.UTF_16, length: 0 }; // UTF-16 uses the BOM to pick the byte order, then drops it
    if (b(0) === 0xEF && b(1) === 0xBB && b(2) === 0xBF)
        return { charset: Charset.UTF_8, length: 3 };
    return null;
}

// jsoup's DataUtil.getCharsetFromContentType
function getCharsetFromContentType(contentType: string): string | null
{
    const m = /(?:charset|encoding)\s*=\s*["']?([^\s,;"']*)/i.exec(contentType);
    if (m !== null)
        return validateCharset(javaTrim(m[1]!).replace("charset=", ""));
    return null;
}

// jsoup's DataUtil.validateCharset: null unless the charset is supported
function validateCharset(cs: string | null): string | null
{
    if (cs === null || cs.length === 0)
        return null;
    cs = javaTrim(cs).replace(/["']/g, "");
    try
    {
        Charset.forName(cs);
        return cs;
    }
    catch (_e)
    {
        try
        {
            Charset.forName(cs.toUpperCase());
            return cs.toUpperCase();
        }
        catch (_e2)
        {
            return null;
        }
    }
}
