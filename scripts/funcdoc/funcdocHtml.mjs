// Port of the Java original's XSLT stylesheets for the function documentation pages
// (xml/src/main/xslt/funcdoc-indiv-html.xsl, funcdoc-joined-html.xsl and the funcdoc-shared.xsl
// they include), which Gradle ran with Saxon.  The app showed the pages in the expression
// editor's completion popup and in DocWindow.  The output is checked against Saxon's by
// scripts/golden/funcdoc.sh (ignoring whitespace that HTML ignores).  XSLT details as in funcdoc.mjs,
// and also:
//  - Elements without a template (description, guide, ...) are processed by the built-in
//    template, which outputs the templates of their children, and copies text.
//  - Saxon serialises with method="html": text escapes & < >, attributes & > and " (as &#34;).
//    It also copies the namespace declarations of copied source elements (xmlns:xi="..."),
//    which mean nothing in HTML, so they are left out here.
import { basename } from "node:path";
import { children, loadFile, loadWithIncludes, path, stringValue, valueOf } from "./funcdoc.mjs";

// (xmldom gives null for a missing attribute, XPath an empty string)
const get = (node, name) => node.getAttribute(name) ?? "";
const esc = s => s.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
const escAttr = s => s.replaceAll("&", "&amp;").replaceAll(">", "&gt;").replaceAll("\"", "&#34;");

function tag(name, attributes, content)
{
    const attrs = Object.entries(attributes).map(([k, v]) => ` ${k}="${escAttr(v)}"`).join("");
    return `<${name}${attrs}>${content}</${name}>`;
}

const span = (cls, content) => tag("span", { class: cls }, content);
const elements = node => [...node.childNodes].filter(n => n.nodeType === 1);
const has = (node, name) => children(node, name).length > 0;
const isWhitespaceOnly = s => /^[ \t\r\n]*$/.test(s);
// string-join(string-to-codepoints(s), '-')
const codepoints = s => [...s].map(c => c.codePointAt(0)).join("-");

/** <xsl:analyze-string>: the matches go through matching, the text between through nonMatching. */
function analyze(s, regex, matching, nonMatching)
{
    let out = "";
    let last = 0;
    for (const m of s.matchAll(regex))
    {
        if (m.index > last)
            out += nonMatching(s.substring(last, m.index));
        out += matching(m);
        last = m.index + m[0].length;
    }
    if (last < s.length)
        out += nonMatching(s.substring(last));
    return out;
}

const EXAMPLE_ARROW = span("example-arrow", "→");
const EXAMPLES_HEADER = span("examples-header", "Examples") + span("examples-header-hint", "Click an example to insert it");

/** The link template of funcdoc-indiv-html.xsl (pages) or of funcdoc-joined-html.xsl (anchors). */
function makeLink(joined)
{
    return (node, content) =>
    {
        const a = name => get(node, name);
        const link = (href, text, extra = {}) => tag("a", { class: "internal-link", ...extra, href }, text);
        if (node.hasAttribute("function"))
            return link(joined ? `#function-${a("function")}` : `function-${a("namespace")}-${a("function")}.html`, esc(a("function")) + "(..)");
        if (node.hasAttribute("literal"))
            return link(joined ? `#literal-${a("literal")}` : `literal-${a("literal")}.html`, esc(a("literal")) + "{..}");
        if (node.hasAttribute("guide"))
            // Java bug, fixed: the joined stylesheet's link was #guide-{@literal}, which is always #guide-,
            // and the namespace pages don't have the guides anyway, so it goes to the guide's page:
            return link(`guide-${a("guide")}.html`, esc(a("guide")) + " guide");
        if (node.hasAttribute("namespace"))
            return link(joined ? `#namespace-${a("namespace")}` : `${a("namespace")}.html`, esc(a("namespace")));
        if (node.hasAttribute("type"))
        {
            const type = a("type");
            const href = joined ? `#type-${type}` : `type-${type}.html`;
            if (type === "typevar" || type === "List" || type === "unitvar")
                return link(href, content);
            return link(href, esc(type), { alt: `Type ${type}` });
        }
        if (node.hasAttribute("operator"))
            return link(joined ? `#operator-${codepoints(a("operator"))}` : `operator-${codepoints(a("operator"))}.html`, "operator " + esc(a("operator")));
        if (node.hasAttribute("syntax"))
            return link(joined ? `#syntax-${a("syntax")}` : `syntax-${a("syntax")}.html`, esc(a("syntax")));
        return "";
    };
}

/** A fake link element, as processType makes them */
const fakeLink = attributes => ({ hasAttribute: n => n in attributes, getAttribute: n => attributes[n] ?? "" });

class Templates
{
    constructor(joined)
    {
        this.link = makeLink(joined);
    }

    processType(type)
    {
        return analyze(type.replace(/@tagged[ \t\r\n]+/g, ""), /Number|Text|Boolean|DateTimeZoned|DateTime|DateYM|Date|Time/g,
            m => this.link(fakeLink({ type: m[0] })),
            s => analyze(s, /@(type|unit)var[ \t\r\n]+([a-z]+)/g,
                m => span(`${m[1]}-var`, this.link(fakeLink({ type: m[1] + "var" }), esc(m[2]))),
                esc));
    }

    processExpression(expression, insertable = false)
    {
        const munged = expression.replace(/@call[ \t\r\n]+|function\\\\|tag\\\\/g, "");
        // The stylesheet's regex is [\(\)\[\]{}]+, but it is an attribute value template, in which {}
        // is an empty expression, so braces aren't brackets here:
        const processed = analyze(munged, /[()[\]]+/g, m => span("expression-bracket", esc(m[0])), esc);
        return insertable ? tag("span", { "class": "insertable-expression", "data-insert": munged }, processed) : processed;
    }

    /** All the templates for these nodes, in order (xsl:apply-templates) */
    apply(nodes)
    {
        return nodes.map(n => this.applyOne(n)).join("");
    }

    applyOne(node)
    {
        if (node.nodeType === 3 || node.nodeType === 4)
            return isWhitespaceOnly(node.data) ? "" : esc(node.data);
        if (node.nodeType !== 1)
            return "";
        switch (node.nodeName)
        {
            case "function": return this.function(node);
            case "binaryOperator": case "naryOperatorGroup": return this.operator(node);
            case "type": return this.item(node, "type", "type-" + get(node, "name"), esc(get(node, "name")));
            case "variable": return this.item(node, "variable", "type-" + get(node, "name").replaceAll(" ", "-"), esc(get(node, "name")));
            case "literal": return this.literal(node);
            case "syntax": return this.syntax(node);
            case "section": return this.section(node);
            case "title": return span("title", esc(valueOf([...node.childNodes].filter(n => n.nodeType === 1 || n.nodeType === 3 || n.nodeType === 4))));
            case "link": return this.link(node, this.copyOf([...node.childNodes]));
            case "code": return tag("code", {}, this.processExpression(stringValue(node), true));
            case "a": case "p": case "ul": case "li":
                return tag(node.nodeName, Object.fromEntries([...node.attributes].map(a => [a.name, a.value])), this.apply([...node.childNodes]));
            default: return this.apply([...node.childNodes]);
        }
    }

    /** <xsl:copy-of> of text and elements without attributes */
    copyOf(nodes)
    {
        return nodes.map(n => n.nodeType === 1 ? tag(n.nodeName, {}, this.copyOf([...n.childNodes]))
            : (n.nodeType === 3 || n.nodeType === 4) && !isWhitespaceOnly(n.data) ? esc(n.data) : "").join("");
    }

    seeAlso(node)
    {
        return children(node, "seeAlso").map(s => tag("div", { class: "seeAlso" }, span("seeAlsoHeader", "See Also") + this.apply([...s.childNodes]))).join("");
    }

    description(node)
    {
        return tag("div", { class: "description" }, this.apply(children(node, "description")));
    }

    /** One example: the call (from the given input), the arrow, the output, and the description */
    example(example, call, outputPattern = true)
    {
        const output = valueOf(children(example, "output")) + (outputPattern ? valueOf(children(example, "outputPattern")) : "");
        return tag("div", { class: "example" }, span("example-call", call + EXAMPLE_ARROW + this.processExpression(output))
            + (has(example, "description") ? span("example-description", esc(valueOf(children(example, "description")))) : ""));
    }

    typeArgs(node, cls)
    {
        if (!has(node, "typeArg"))
            return "";
        const constraints = children(node, "typeConstraint");
        return span(cls, "For any types " + children(node, "typeArg").map(t => span("type-var", esc(stringValue(t)))).join(", ")
            + (constraints.length > 0 ? " where " + esc(valueOf(constraints, ", ")) : ""));
    }

    function(node)
    {
        const name = get(node, "name");
        const argTypes = children(node, "argType");
        const commas = items => items.map((item, i) => (i > 0 ? span("comma", ", ") : "") + item).join("");
        const header = span("function-header", span("function-name-header", esc(name)) + span("bracket", "(")
            + commas(argTypes.map(a => esc(get(a, "name")))) + span("bracket", ")") + span("function-arrow", "")
            + esc(valueOf(children(node, "returnType").map(r => get(r, "name")))));
        const unitArgs = children(node, "unitArg");
        const type = span("function-type", "\n                Type:\n                "
            + this.typeArgs(node, "function-type-args")
            + (unitArgs.length > 0 ? span("function-type-args", "For any units " + unitArgs.map(u => span("unit-var", esc(stringValue(u)))).join(", ")) : "")
            + span("type", span("bracket", "(") + commas(argTypes.map(a => this.processType(stringValue(a)))) + span("bracket", ")")
                + " -&gt; " + this.processType(valueOf(children(node, "returnType")))));
        const examples = children(node, "example").map(e => this.example(e,
            (has(e, "input") ? this.processExpression(valueOf(children(e, "input")), true) : "")
            + (has(e, "inputArg") ? this.processExpression(name + bracketed(valueOf(children(e, "inputArg"))), true) : "")));
        return tag("div", { class: "function-item", id: `function-${name}` }, header + type + this.description(node)
            + tag("div", { class: "examples" }, EXAMPLES_HEADER + examples.join("")) + this.seeAlso(node));
    }

    operator(node)
    {
        const operators = children(node, "operator");
        const op = operators.length > 0 ? stringValue(operators[0]) : "";
        // operator[2 - (2 mod max((1, count(./operator))))]
        const op2Node = operators[2 - (2 % Math.max(1, operators.length)) - 1];
        const op2 = op2Node !== undefined ? stringValue(op2Node) : "";
        const headers = operators.map(o => tag("span", { class: "operator-name-header", id: `operator-${codepoints(stringValue(o))}` }, "operator " + this.copyOf([o])));
        let type;
        if (node.nodeName === "binaryOperator")
            type = this.processType(bracketed(valueOf(children(node, "argTypeLeft")) + op + valueOf(children(node, "argTypeRight"))));
        else
        {
            const argType = valueOf(children(node, "argType"));
            type = this.processType(bracketed(argType + op + argType + op2 + "..."));
        }
        type += span("function-arrow", "") + this.processType(valueOf(children(node, "resultType")));
        const examples = children(node, "example").map(e => this.example(e,
            (has(e, "input") ? this.processExpression(valueOf(children(e, "input")), true) : "")
            + (has(e, "inputArg") ? this.processExpression(bracketed(valueOf(children(e, "inputArg"))), true) : "")));
        return tag("div", { class: "operator-item" }, headers.join("") + span("operator-type", type) + this.description(node)
            + tag("div", { class: "examples" }, EXAMPLES_HEADER + examples.join("")) + this.seeAlso(node));
    }

    /** The type and variable templates */
    item(node, kind, id, header)
    {
        return tag("div", { class: `${kind}-item` }, tag("span", { class: `${kind}-name-header`, id }, header) + this.description(node) + this.seeAlso(node));
    }

    literal(node)
    {
        const name = get(node, "name");
        const examples = children(node, "example").map(e =>
        {
            let call = has(e, "input") ? this.processExpression(valueOf(children(e, "input")), true) : "";
            if (has(e, "inputArg"))
            {
                const arg = valueOf(children(e, "inputArg"));
                call += tag("span", { "class": "insertable-expression", "data-insert": `${name}{${arg}}` }, `${esc(name)}{${esc(arg)}}`);
            }
            return this.example(e, call);
        });
        return tag("div", { class: "literal-item" }, tag("span", { class: "literal-name-header", id: `literal-${name}` }, esc(name) + "{...}")
            + this.description(node) + tag("div", { class: "examples" }, EXAMPLES_HEADER + examples.join("")) + this.seeAlso(node));
    }

    syntax(node)
    {
        const elems = path(node, "syntaxElements").flatMap(s => elements(s).filter(e => e.nodeName === "keyword" || e.nodeName === "type"));
        const keyword = (cls, k) => tag("span", { "class": cls, "xml:space": "preserve" }, ` ${esc(stringValue(k))} `);
        const header = elems.map(e => e.nodeName === "keyword" ? keyword("syntax-keyword", e) : span("syntax-name", esc(get(e, "name")))).join("");
        const type = elems.map(e => e.nodeName === "keyword" ? keyword("syntax-element-keyword", e) : span("syntax-element-type", this.processType(stringValue(e)))).join("");
        const examples = children(node, "example").map(e => this.example(e, this.processExpression(valueOf(children(e, "input")), true), false));
        return tag("div", { class: "syntax-item", id: `syntax-${get(node, "id")}` }, span("syntax-name-header", header)
            + span("syntax-type", this.typeArgs(node, "syntax-type-args") + span("type", type)) + this.description(node)
            + tag("div", { class: "examples" }, EXAMPLES_HEADER + examples.join("")) + this.seeAlso(node));
    }

    section(node)
    {
        const examples = children(node, "example");
        return tag("div", { class: "section", id: get(node, "id") }, this.apply([...node.childNodes].filter(n => n.nodeName !== "example"))
            + (examples.length === 0 ? "" : tag("div", { class: "examples" }, span("examples-header", "Examples") + examples.map(e =>
                tag("div", { class: "example" }, span("example-call", this.processExpression(valueOf(children(e, "input"))) + EXAMPLE_ARROW
                    + this.processExpression(valueOf(children(e, "output")) + valueOf(children(e, "outputPattern")))))).join(""))));
    }
}

/** The bracketed template: brackets the expression, unless it already is */
function bracketed(expression)
{
    // (An empty string has no matching or non-matching parts)
    return expression === "" || /^\(.*\)$/.test(expression) ? expression : `(${expression})`;
}

/**
 * The pages: { "<file name>.html": { title, bodyClass, body } }, with the body's content as HTML.
 * From funcdoc-indiv-html.xsl applied to _all.xml (a page per item), and funcdoc-joined-html.xsl
 * applied to each other file whose root is functionDocumentation (a page per namespace, to which
 * the namespace links go).
 */
export function funcdocPages(allXmlPath, funcdocXmlPaths)
{
    const pages = {};
    const indiv = new Templates(false);
    const add = (file, title, body) => { pages[file] = { title, bodyClass: "indiv", body }; };
    const all = loadWithIncludes(allXmlPath).documentElement;
    for (const doc of elements(all))
    {
        if (doc.nodeName === "functionDocumentation")
        {
            const namespace = get(doc, "namespace");
            for (const item of elements(doc))
            {
                const name = get(item, "name");
                switch (item.nodeName)
                {
                    case "function": add(`function-${namespace}-${name}.html`, `${namespace}/${name}`, indiv.applyOne(item)); break;
                    case "syntax": add(`syntax-${get(item, "id")}.html`, get(item, "id"), indiv.applyOne(item)); break;
                    case "variable": add(`variable-${name.replaceAll(" ", "-")}.html`, get(item, "id"), indiv.applyOne(item)); break;
                    case "literal": add(`literal-${name}.html`, `${name}{}`, indiv.applyOne(item)); break;
                    case "type": add(`type-${name}.html`, name, indiv.applyOne(item)); break;
                    case "binaryOperator": case "naryOperatorGroup":
                        for (const operator of item.nodeName === "binaryOperator" ? children(item, "operator").slice(0, 1) : children(item, "operator"))
                            add(`operator-${codepoints(stringValue(operator))}.html`, `Operator ${stringValue(operator)}`, indiv.applyOne(item));
                        break;
                }
            }
        }
        else if (doc.nodeName === "guides")
        {
            for (const guide of children(doc, "guide"))
                add(`guide-${get(guide, "id")}.html`, get(guide, "id"), indiv.applyOne(guide));
        }
    }

    const joined = new Templates(true);
    for (const xmlPath of funcdocXmlPaths)
    {
        const doc = loadFile(xmlPath).documentElement;
        if (doc.nodeName !== "functionDocumentation")
            continue;
        const namespace = get(doc, "namespace");
        let index = "";
        if (namespace !== "")
            index += tag("div", { class: "index-namespace" }, tag("h2", {}, esc(namespace) + " functions")
                + children(doc, "function").map(f => tag("a", { class: "index-entry", href: `#function-${get(f, "name")}` }, esc(get(f, "name")))).join(""));
        if (doc.hasAttribute("toc"))
        {
            const entry = (href, text) => tag("a", { class: "index-entry", href }, text);
            const operatorEntries = item => children(item, "operator").map(o => entry(`#operator-${codepoints(stringValue(o))}`, "Operator " + esc(stringValue(o)))).join("");
            index += tag("div", { class: "index-toc" }, tag("h2", {}, esc(get(doc, "toc"))) + elements(doc).map(item =>
            {
                const name = get(item, "name");
                switch (item.nodeName)
                {
                    case "type": return entry(`#type-${name}`, esc(name) + " type");
                    case "literal": return entry(`#literal-${name}`, esc(name) + "{..} literal");
                    case "syntax": return entry(`#syntax-${get(item, "id")}`, esc(get(item, "title")));
                    case "binaryOperator": case "naryOperatorGroup": return operatorEntries(item);
                    default: return "";
                }
            }).join(""));
        }
        const body = tag("h1", {}, "Columnal Documentation: Table of Contents") + tag("div", { class: "index" }, index)
            + tag("div", { class: "namespace", id: `namespace-${namespace}` }, joined.apply(children(doc, "function")))
            + joined.apply(elements(doc).filter(e => ["binaryOperator", "naryOperatorGroup", "type", "literal", "syntax", "variable"].includes(e.nodeName)));
        pages[basename(xmlPath, ".xml") + ".html"] = { title: "Function Documentation", bodyClass: null, body };
    }
    return pages;
}

/**
 * The links in the pages that go nowhere: [page, href] pairs, sorted.  Errors in the Java original
 * (missing pages, a missing namespace or a typo in the XML; and, in the namespace pages, which each
 * have one namespace, anchors for items in other namespaces), which the build reports.
 */
export function brokenLinks(pages)
{
    const hasId = (page, id) => page.body.includes(` id="${escAttr(id)}"`);
    const broken = [];
    for (const [file, page] of Object.entries(pages))
    {
        for (const m of page.body.matchAll(/<a [^>]*href="([^"]*)"/g))
        {
            const href = m[1].replaceAll("&amp;", "&").replaceAll("&gt;", ">").replaceAll("&#34;", "\"");
            if (/^[a-z]+:/.test(href))
                continue;
            const [target, anchor] = href.split("#", 2);
            const targetPage = target === "" ? page : pages[target];
            if (targetPage === undefined || (anchor !== undefined && !hasId(targetPage, anchor)))
                broken.push([file, href]);
        }
    }
    const unique = [...new Map(broken.map(b => [b.join(" "), b])).values()];
    return unique.sort((a, b) => a[0] === b[0] ? (a[1] < b[1] ? -1 : 1) : (a[0] < b[0] ? -1 : 1));
}
