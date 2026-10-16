// Ports of the Java original's XSLT stylesheets for the function documentation
// (xml/src/main/xslt/funcdoc-types-and-mini.xsl and extract-tests.xsl), which Gradle ran with
// Saxon.  Their output is checked against Saxon's by scripts/golden/funcdoc.sh.
//
// XSLT details that matter here:
//  - <xsl:strip-space elements="*"/> removes whitespace-only text nodes from the source
//    documents, so they are skipped when taking an element's string value.
//  - <xsl:value-of select="x"/> of several nodes joins their string values with a space
//    (or with the given separator).
//  - Text in a template is output as written, but whitespace-only text is dropped.
import { DOMParser } from "@xmldom/xmldom";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";

const XINCLUDE_NS = "http://www.w3.org/2001/XInclude";

function parse(path)
{
    return new DOMParser().parseFromString(readFileSync(path, "utf8"), "text/xml");
}

/** Parses an XML file, replacing each xi:include with the root element of the included file. */
export function loadWithIncludes(path)
{
    const doc = parse(path);
    const includes = [...elementsByNameNS(doc.documentElement, XINCLUDE_NS, "include")];
    for (const include of includes)
    {
        const included = loadWithIncludes(join(dirname(path), include.getAttribute("href")));
        include.parentNode.replaceChild(doc.importNode(included.documentElement, true), include);
    }
    return doc;
}

export function loadFile(path)
{
    return parse(path);
}

function* elementsByNameNS(root, ns, localName)
{
    for (let n = root.firstChild; n !== null; n = n.nextSibling)
    {
        if (n.nodeType === 1)
        {
            if (n.namespaceURI === ns && n.localName === localName)
                yield n;
            yield* elementsByNameNS(n, ns, localName);
        }
    }
}

const isWhitespaceOnly = s => /^[ \t\r\n]*$/.test(s);

/** XPath string value, after xsl:strip-space elements="*" */
function stringValue(node)
{
    if (node.nodeType === 2)
        return node.value;
    if (node.nodeType === 3 || node.nodeType === 4)
        return isWhitespaceOnly(node.data) ? "" : node.data;
    let s = "";
    for (let n = node.firstChild; n !== null; n = n.nextSibling)
    {
        if (n.nodeType === 1 || ((n.nodeType === 3 || n.nodeType === 4)))
            s += stringValue(n);
    }
    return s;
}

/** The child elements of node with the given name (XPath: name) */
function children(node, name)
{
    const r = [];
    for (let n = node.firstChild; n !== null; n = n.nextSibling)
    {
        if (n.nodeType === 1 && n.nodeName === name)
            r.push(n);
    }
    return r;
}

/** XPath: a/b/c (child steps) */
function path(node, ...names)
{
    let nodes = [node];
    for (const name of names)
        nodes = nodes.flatMap(n => children(n, name));
    return nodes;
}

/** XPath: .//name (descendants in document order) */
function descendants(node, name)
{
    const r = [];
    for (let n = node.firstChild; n !== null; n = n.nextSibling)
    {
        if (n.nodeType === 1)
        {
            if (n.nodeName === name)
                r.push(n);
            r.push(...descendants(n, name));
        }
    }
    return r;
}

/** XPath: @name, as a sequence of zero or one attribute values */
function attr(node, name)
{
    return node.hasAttribute(name) ? [node.getAttribute(name)] : [];
}

/** <xsl:value-of select="..." separator="..."/> */
function valueOf(items, separator = " ")
{
    return items.map(i => typeof i === "string" ? i : stringValue(i)).join(separator);
}

/**
 * funcdoc-types-and-mini.xsl applied to _all.xml: returns the six .properties files it writes,
 * keyed by file name.
 */
export function typesAndMini(allXmlPath)
{
    const all = loadWithIncludes(allXmlPath).documentElement;
    const files = {
        "function_minis_en.properties": "",
        "function_unitargs_en.properties": "",
        "function_typeargs_en.properties": "",
        "function_synonyms_en.properties": "",
        "function_constraints_en.properties": "",
        "function_types_en.properties": "",
    };
    const forEachFunction = (file, process) =>
    {
        for (const functionDocumentation of descendants(all, "functionDocumentation"))
        {
            const namespace = valueOf(attr(functionDocumentation, "namespace"));
            for (const f of descendants(functionDocumentation, "function"))
                files[file] += process(namespace, f);
        }
    };
    // replace(@name,' ','\\ ')
    const key = (namespace, f) => namespace + "\\:" + valueOf(attr(f, "name")).replaceAll(" ", "\\ ");
    forEachFunction("function_minis_en.properties", (ns, f) => key(ns, f) + "=" + valueOf(children(f, "mini")) + "\n");
    forEachFunction("function_unitargs_en.properties", (ns, f) => key(ns, f) + "=" + valueOf(children(f, "unitArg"), ";") + "\n");
    forEachFunction("function_typeargs_en.properties", (ns, f) => key(ns, f) + "=" + valueOf(children(f, "typeArg"), ";") + "\n");
    forEachFunction("function_synonyms_en.properties", (ns, f) => key(ns, f) + "=" + valueOf(children(f, "synonym"), ";") + "\n");
    forEachFunction("function_constraints_en.properties", (ns, f) => key(ns, f) + "=" + valueOf(children(f, "typeConstraint"), ";") + "\n");
    forEachFunction("function_types_en.properties", (ns, f) =>
        key(ns, f) + "=((" + valueOf(children(f, "argType"), ",") + ") -> " + valueOf(children(f, "returnType")) + ")  \n        " + "\n"
        + key(ns, f) + "\\:sig=" + valueOf(children(f, "argType").flatMap(a => attr(a, "name")), ";") + "\n");
    return files;
}

/** extract-tests.xsl applied to one funcdoc file: the text of its .test file. */
export function extractTests(xmlPath)
{
    const root = loadFile(xmlPath).documentElement;
    // Skip other nodes (e.g. guides)
    if (root.nodeName !== "functionDocumentation")
        return "";

    let out = "";

    const bracketed = expression =>
    {
        // xsl:analyze-string gives nothing for an empty string; "." does not match a newline
        if (expression === "")
            return "";
        return /^\(.*\)$/.test(expression) ? expression : "(" + expression + ")";
    };

    const processExamples = (context, functionName, literalName) =>
    {
        for (const example of children(context, "example"))
        {
            const outputs = children(example, "output");
            const isError = outputs.some(o => stringValue(o) === "error");
            if (isError)
                out += "!!! ";
            if (children(example, "input").length !== 0)
                out += "(" + valueOf(children(example, "input")) + ")";
            else if (literalName !== null)
                out += literalName + "{" + valueOf(children(example, "inputArg")) + "}";
            else
                out += " @call function\\\\" + functionName + bracketed(valueOf(children(example, "inputArg")));
            if (!isError)
            {
                if (outputs.length !== 0)
                    out += " = (" + valueOf(outputs) + ")";
                else
                    out += " =~ (" + valueOf(children(example, "outputPattern")) + ")";
            }
            out += "\n";
        }
    };

    const processEquivalence = equivalence =>
    {
        for (const foranytype of children(equivalence, "foranytype"))
            out += "\n==* " + valueOf(attr(foranytype, "name")) + "//" + valueOf(children(foranytype, "typeConstraint"), "//");
        for (const forany of children(equivalence, "forany"))
        {
            out += "\n== " + valueOf(attr(forany, "name")) + "//" + stringValue(forany);
            if (forany.hasAttribute("min"))
                out += "//" + valueOf(attr(forany, "min")) + "//" + valueOf(attr(forany, "max"));
        }
        out += "\n==== " + valueOf(children(equivalence, "lhs"));
        out += "\n==== " + valueOf(children(equivalence, "rhs"));
        out += "\n";
    };

    const processFunction = f =>
    {
        const functionName = valueOf(attr(f, "name"));
        processExamples(f, functionName, null);
        for (const exampleGroup of children(f, "exampleGroup"))
        {
            for (const table of children(exampleGroup, "table"))
            {
                out += "\n## " + valueOf(attr(table, "name"));
                out += "\n## " + valueOf(path(table, "columns", "column").flatMap(c => attr(c, "name")), "//");
                out += "\n## " + valueOf(path(table, "columns", "column").flatMap(c => attr(c, "type")), "//");
                for (const row of path(table, "data", "row"))
                    out += "\n#### " + valueOf(children(row, "d"), "//");
                out += "\n";
            }
            processExamples(exampleGroup, functionName, null);
        }
        for (const equivalence of children(f, "equivalence"))
            processEquivalence(equivalence);
    };

    // Operators select the (absent) OPERATOR_NO_INPUTARG_ALLOWED element as the function name:
    const processOperator = op =>
    {
        processExamples(op, "", null);
        for (const equivalence of children(op, "equivalence"))
            processEquivalence(equivalence);
    };

    for (const f of children(root, "function"))
        processFunction(f);
    for (const op of children(root, "binaryOperator"))
        processOperator(op);
    for (const op of children(root, "naryOperatorGroup"))
        processOperator(op);
    for (const literal of children(root, "literal"))
    {
        // test="$literalName" (the @name attribute) is true if the attribute is present, even if empty
        processExamples(literal, "", literal.hasAttribute("name") ? literal.getAttribute("name") : null);
        for (const equivalence of children(literal, "equivalence"))
            processEquivalence(equivalence);
    }
    for (const syntax of children(root, "syntax"))
        processExamples(syntax, "", null);
    return out;
}
