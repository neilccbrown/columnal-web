// Tests JavaLexer, the base class of the generated lexers, which keeps a token text that a lexer
// action sets to "" (antlr4ng would otherwise use the whole matched text; Java's ANTLR does not).
import { describe, expect, test } from "vitest";
import { CharStream } from "antlr4ng";
import { DataLexer2 } from "../../../src/engine/parsers/generated/DataLexer2.js";
import { MainLexer2 } from "../../../src/engine/parsers/generated/MainLexer2.js";
import { DataType } from "../../../src/engine/types/data/datatype/DataType.js";

function tokenTexts(lexer: DataLexer2 | MainLexer2): string[]
{
    return lexer.getAllTokens().map(t => t.text ?? "");
}

describe("JavaLexer", () =>
{
    test("An empty string literal has empty text", () =>
    {
        expect(tokenTexts(new DataLexer2(CharStream.fromString("\"\""))).filter(t => t.trim() !== "")).toEqual([]);
        expect(DataType.TEXT.loadSingleItem("\"\"").getRight("valid")).toEqual("");
        expect(DataType.TEXT.loadSingleItem("\"a\"").getRight("valid")).toEqual("a");
    });

    test("A detail line with only the prefix has empty text", () =>
    {
        const texts = tokenTexts(new MainLexer2(CharStream.fromString("COMMENT @BEGIN WDL\nWDL CONTENT\nWDL \nWDL x\n@END WDL COMMENT\n")));
        expect(texts).toContain("");
        expect(texts).toContain("CONTENT");
        expect(texts).toContain("x");
        expect(texts.some(t => t.includes("WDL") && !t.startsWith("@"))).toBe(false);
    });
});
