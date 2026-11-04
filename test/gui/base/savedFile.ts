// Reading a section of a saved file (Java: the GUI tests' getUnitSrcFromFile and getTypeSrcFromFile).
import { MainLexer2 } from "../../../src/engine/parsers/generated/MainLexer2.js";
import { MainParser2 } from "../../../src/engine/parsers/generated/MainParser2.js";
import { Utility } from "../../../src/engine/utility/utility/Utility.js";

/** The detail of the file's section with the given name (e.g. "UNITS", "TYPES"). */
export function fileSection(fileContent: string, name: string): string
{
    const file = Utility.parseAsOne(fileContent, s => new MainLexer2(s), t => new MainParser2(t), p => p.file());
    const section = file.content().find(c => c.ATOM(0)?.getText() === name);
    if (section === undefined)
        throw new Error("No " + name + " section");
    return Utility.getDetail(section.detail());
}
