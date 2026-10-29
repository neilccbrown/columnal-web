// Port of the Java original's XSLT stylesheet for the dialog help (xml/src/main/xslt/make-help-indiv.xsl),
// which Gradle ran with Saxon: the .properties file for each help file, which Help reads.  (The
// stylesheet also wrote an HTML page per help item, which the app didn't use.)  The output is checked
// against Saxon's by scripts/golden/funcdoc.sh.  XSLT details as in funcdoc.mjs.
import { basename } from "node:path";
import { children, loadFile, stringValue } from "./funcdoc.mjs";

/** The help file's properties: { "<dialog id>_en.properties": content } */
export function helpProperties(xmlPath)
{
    const dialog = loadFile(xmlPath).documentElement;
    let out = "";
    for (const help of children(dialog, "help"))
    {
        const id = help.getAttribute("id");
        out += `${id}=${children(help, "short").map(stringValue).join(" ")}\n`;
        out += `${id}.title=${help.getAttribute("title")}\n`;
        out += `${id}.full=`;
        for (const full of children(help, "full"))
        {
            for (let n = full.firstChild; n !== null; n = n.nextSibling)
            {
                if (n.nodeType !== 1)
                    continue;
                // replace(text(), '\n', ' '): the element's own text, not its descendants':
                const texts = [];
                for (let t = n.firstChild; t !== null; t = t.nextSibling)
                {
                    if ((t.nodeType === 3 || t.nodeType === 4) && !/^[ \t\r\n]*$/.test(t.data))
                        texts.push(t.data);
                }
                if (texts.length > 1)
                    throw new Error(`${basename(xmlPath)}: ${id}: a paragraph with mixed content (an error in XSLT 2's replace)`);
                out += (texts[0] ?? "").replaceAll("\n", " ") + "£££££";
            }
        }
        out += "\n";
    }
    return { [dialog.getAttribute("id") + "_en.properties"]: out };
}
