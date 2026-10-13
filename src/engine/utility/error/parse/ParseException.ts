// Port of xyz.columnal.error.parse.ParseException (utility module).
import { ParseCancellationException, ParserRuleContext, type Parser, type RecognitionException } from "antlr4ng";
import { UserException } from "../../../utility-error/error/UserException.js";
import { Utility } from "../../utility/Utility.js";

/**
 * Created by neil on 14/01/2017.
 */
export class ParseException extends UserException
{
    // Java has four constructors:
    //   ParseException(ParserRuleContext problemItem, String explanation)
    //   ParseException(String expectedItem, Parser p)
    //   ParseException(String input, Parser p, ParseCancellationException e)
    //   ParseException(String input, Parser p, RecognitionException e)
    public constructor(problemItem: ParserRuleContext, explanation: string);
    public constructor(expectedItem: string, p: Parser);
    public constructor(input: string, p: Parser, e: ParseCancellationException | RecognitionException);
    public constructor(a: ParserRuleContext | string, b: string | Parser, e?: ParseCancellationException | RecognitionException)
    {
        if (a instanceof ParserRuleContext)
            super(ParseException.formatLocation(a) + " " + (b as string) + ": \"" + a.getText() + "\"");
        else if (e === undefined)
            super(ParseException.expected(a, b as Parser));
        else
            super(ParseException.whileParsing(a, b as Parser, e), e);
    }

    private static tokenName(p: Parser, type: number): string
    {
        return p.vocabulary.getDisplayName(type) ?? String(type);
    }

    private static expected(expectedItem: string, p: Parser): string
    {
        const t = p.getCurrentToken();
        return "Expected " + expectedItem + " found: {" + (t.text ?? "") + "} at " + t.line + ":" + t.column + " " + (t.type >= 0 ? ParseException.tokenName(p, t.type) : "UNKNOWN") + " " + t.start;
    }

    private static whileParsing(input: string, p: Parser, e: ParseCancellationException | RecognitionException): string
    {
        const current = p.getCurrentToken();
        if (e instanceof ParseCancellationException)
        {
            return "Error while parsing on line " + current.line + ":\n" + ParseException.highlightPosition(input, current.line, current.column) + "\n" +
                "Found: {" + (current.text ?? "") + "} " + (current.type < 0 ? "EOF" : ParseException.tokenName(p, current.type)) + " [" + current.type + "] " + current.start;
        }
        const offending = e.offendingToken ?? current;
        return "Error while parsing on line " + offending.line + ":\n" + ParseException.highlightPosition(input, offending.line, offending.column) + "\n" +
            "Found: {" + (offending.text ?? "") + "} " + (offending.type < 0 ? "EOF" : ParseException.tokenName(p, offending.type)) + " [" + current.type + "] " + offending.start;
    }

    private static highlightPosition(input: string, line: number, charPositionInLine: number): string
    {
        // Line starts at 1, so rebase to zero:
        line -= 1;

        const lines = Utility.splitLines(input);
        if (line < lines.length && charPositionInLine <= lines[line]!.length)
        {
            // Position is valid.
            return lines[line] + "\n" + " ".repeat(charPositionInLine) + "^-- Unexpected\n";
        }
        else
        {
            return "Internal error: parse error position invalid: " + line + ":" + charPositionInLine + " in {{{" + input + "}}}";
        }
    }

    private static formatLocation(problemItem: ParserRuleContext): string
    {
        const start = problemItem.start!;
        const stop = problemItem.stop!;
        if (start.line === stop.line)
            return "Line " + start.line + ", Columns " + start.column + " to " + stop.column;
        else
            return "Line " + start.line + " Column" + start.column + " to line " + stop.line + " Column " + stop.column;
    }
}
