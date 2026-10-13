// Smoke test for the generated save-file parsers, exercising the TypeScript actions and
// predicates translated from the Java grammar (MainLexer2's @BEGIN/@END prefix handling,
// and MainParser2's check that a block ends with the same keyword it started with).
import { describe, expect, test } from "vitest";
import { BaseErrorListener, CharStream, CommonTokenStream, type ATNSimulator, type RecognitionException, type Recognizer, type Token } from "antlr4ng";
import { MainLexer2 } from "../../../src/engine/parsers/generated/MainLexer2.js";
import { MainParser2, type FileContext } from "../../../src/engine/parsers/generated/MainParser2.js";

class CollectErrors extends BaseErrorListener
{
    public readonly errors: string[] = [];

    public override syntaxError<S extends Token, T extends ATNSimulator>(_recognizer: Recognizer<T>, _offendingSymbol: S | null, line: number, column: number, msg: string, _e: RecognitionException | null): void
    {
        this.errors.push(`${line}:${column} ${msg}`);
    }
}

function parse(text: string): { file: FileContext; errors: string[] }
{
    const errors = new CollectErrors();
    const lexer = new MainLexer2(CharStream.fromString(text));
    lexer.removeErrorListeners();
    lexer.addErrorListener(errors);
    const parser = new MainParser2(new CommonTokenStream(lexer));
    parser.removeErrorListeners();
    parser.addErrorListener(errors);
    const file = parser.file();
    return { file, errors: errors.errors };
}

// The shape written by the Java Table/TableManager save code.
const SAMPLE = `COLUMNAL
VERSION 3

UNITS @BEGIN UU
UU UNIT m "metre"
UU   UNIT s "second"
@END UU UNITS

TYPES @BEGIN TT
@END TT TYPES
`;

describe("MainParser2", () =>
{
    test("parses blocks and strips the line prefixes", () =>
    {
        const { file, errors } = parse(SAMPLE);
        expect(errors).toEqual([]);
        expect(file.item().getText()).toBe("3");
        const contents = file.content();
        expect(contents.map(c => c.ATOM(0)?.getText())).toEqual(["UNITS", "TYPES"]);
        // The lexer action removes the prefix and trims each line (Java's trim semantics):
        expect(contents[0]!.detail().detailLine().map(l => l.getText())).toEqual(["UNIT m \"metre\"", "UNIT s \"second\""]);
        expect(contents[1]!.detail().detailLine()).toEqual([]);
    });

    test("rejects a block that ends with a different keyword", () =>
    {
        const { errors } = parse(SAMPLE.replace("@END TT TYPES", "@END TT UNITS"));
        expect(errors.length).toBeGreaterThan(0);
    });

    test("rejects a detail line without the block's prefix", () =>
    {
        const { errors } = parse(SAMPLE.replace("UU UNIT m", "XX UNIT m"));
        expect(errors.length).toBeGreaterThan(0);
    });
});
