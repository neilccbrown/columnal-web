// Port of xyz.columnal.utility.IdentifierUtility (utility module).
import { CharStream, ParserRuleContext } from "antlr4ng";
import type { ExpressionIdentifier, RawInputLocation, UnitIdentifier } from "../../anns/Annotations.js";
import { codePoints, isAlphabetic, isDigit, isOtherLetter, isWhitespace } from "../../java/JavaCharacter.js";
import { javaTrim } from "../../java/JavaString.js";
import { LabelContext as DataParserLabelContext } from "../../parsers/generated/DataParser.js";
import { LabelContext as DataParser2LabelContext } from "../../parsers/generated/DataParser2.js";
import { ExpressionLexer } from "../../parsers/generated/ExpressionLexer.js";
import { UnitLexer } from "../../parsers/generated/UnitLexer.js";
import { SingleUnitContext } from "../../parsers/generated/UnitParser.js";
import { Pair } from "../../utility-adt/utility/adt/Pair.js";
import { DescriptiveErrorListener, Utility } from "./Utility.js";

enum Last { START, SPACE, VALID }

export class IdentifierUtility
{
    public static asUnitIdentifier(src: string): UnitIdentifier | null
    {
        if (Utility.lexesAs(src, s => new UnitLexer(s), UnitLexer.IDENT))
            return src;
        else
            return null;
    }

    public static asExpressionIdentifier(src: string): ExpressionIdentifier | null
    {
        if (Utility.lexesAs(src, s => new ExpressionLexer(s), ExpressionLexer.IDENT))
            return src;
        else
            return null;
    }

    /**
     * Java has overloads for ExpressionParser.IdentContext, ExpressionParser2.SingleIdentContext,
     * FormatParser.IdentContext and FormatParser.ColumnNameContext (which return the text),
     * DataParser(2).LabelContext (which check the label name) and UnitParser.SingleUnitContext
     * (which returns the IDENT).
     */
    public static fromParsed(parsedIdent: DataParserLabelContext | DataParser2LabelContext): ExpressionIdentifier | null;
    public static fromParsed(parsedIdent: SingleUnitContext): UnitIdentifier;
    public static fromParsed(parsedIdent: ParserRuleContext): ExpressionIdentifier;
    public static fromParsed(parsedIdent: ParserRuleContext): string | null
    {
        if (parsedIdent instanceof DataParserLabelContext || parsedIdent instanceof DataParser2LabelContext)
            return IdentifierUtility.asExpressionIdentifier(parsedIdent.labelName().getText());
        if (parsedIdent instanceof SingleUnitContext)
            return parsedIdent.IDENT().getText();
        return parsedIdent.getText();
    }

    // If all parts are valid, joining them spaces is also valid
    // (Java: spaceSeparated(String...) and spaceSeparated(ImmutableList<String>))
    public static spaceSeparated(...parts: (ExpressionIdentifier | readonly ExpressionIdentifier[])[]): ExpressionIdentifier
    {
        return parts.flat().join(" ");
    }

    public static shorten(raw: ExpressionIdentifier): ExpressionIdentifier
    {
        const THRESHOLD = 8;
        if (raw.length <= THRESHOLD)
            return raw;
        return IdentifierUtility.fixExpressionIdentifier(javaTrim(raw.substring(0, THRESHOLD)), raw);
    }

    public static consumeExpressionIdentifier(content: string, startFrom: RawInputLocation, caretPos: RawInputLocation): IdentifierUtility.Consumed<ExpressionIdentifier> | null
    {
        const inputStream = CharStream.fromString(content.substring(startFrom));
        const lexer = new ExpressionLexer(inputStream);
        const errorListener = new DescriptiveErrorListener();
        // PORT-NOTE: Java leaves the default console error listener in place too, which only prints.
        lexer.removeErrorListeners();
        lexer.addErrorListener(errorListener);
        const token = lexer.nextToken();
        // If there any errors, abort:
        if (errorListener.errors.length !== 0)
            return null;
        else if (token.type === ExpressionLexer.IDENT)
        {
            const tokenText = token.text!;
            const end = startFrom + token.stop + 1;
            // Find all the consecutive spaces:
            let posAfterLastSpace = end;
            while (posAfterLastSpace < content.length && content[posAfterLastSpace] === " ")
            {
                posAfterLastSpace += 1;
            }

            // Is it followed by at least one space?
            if (posAfterLastSpace > end)
            {
                // Here's the options:
                // 1: there are one or more spaces, the caret is somewhere in them, preserve one before (if present), and one after (if present), delete rest.
                //    If followed by identifier, glue together
                // 2: there are one or more spaces, the caret doesn't touch any of them, and
                //   (a) there is an identifier following: delete down to one space and glue
                //   (b) there is not an identifier following: delete all

                const identAfter = IdentifierUtility.consumeExpressionIdentifier(content, posAfterLastSpace, caretPos);

                // Is the caret in there?
                if (end <= caretPos && caretPos <= posAfterLastSpace)
                {
                    // It is -- preserve at most one space before and one after:
                    const removed = new Set<RawInputLocation>();
                    for (let i = end + 1; i < caretPos; i++)
                    {
                        removed.add(i);
                    }
                    for (let i = caretPos + 1; i < posAfterLastSpace; i++)
                    {
                        removed.add(i);
                    }
                    const spaces = (end < caretPos ? " " : "") + (caretPos < posAfterLastSpace ? " " : "");
                    if (identAfter !== null)
                    {
                        const withSpaces = tokenText + spaces + identAfter.item;
                        return new IdentifierUtility.Consumed(withSpaces, identAfter.positionAfter, new Set([...removed, ...identAfter.removedCharacters]));
                    }
                    else
                    {
                        const withSpaces = tokenText + spaces;
                        return new IdentifierUtility.Consumed(withSpaces, posAfterLastSpace, removed);
                    }
                }
                else
                {
                    // Caret not in there:
                    const removed = new Set<RawInputLocation>();
                    for (let i = end + (identAfter !== null ? 1 : 0); i < posAfterLastSpace; i++)
                    {
                        removed.add(i);
                    }
                    if (identAfter !== null)
                    {
                        const glued = tokenText + " " + identAfter.item;
                        return new IdentifierUtility.Consumed(glued, identAfter.positionAfter, new Set([...removed, ...identAfter.removedCharacters]));
                    }
                    else
                    {
                        return new IdentifierUtility.Consumed(tokenText, posAfterLastSpace, removed);
                    }
                }
            }
            return new IdentifierUtility.Consumed(tokenText, end, new Set());
        }
        else
            return null;
    }

    public static consumePossiblyScopedExpressionIdentifier(content: string, startFrom: RawInputLocation, includeTrailingSpaceOrDoubleSpaceIfEndsAt: RawInputLocation): IdentifierUtility.Consumed<Pair<ExpressionIdentifier | null, ExpressionIdentifier[]>> | null
    {
        const items: IdentifierUtility.Consumed<ExpressionIdentifier>[] = [];
        let firstHadDouble = false;
        let nextPos = startFrom;
        do
        {
            if (items.length !== 0)
                nextPos = items[items.length - 1]!.positionAfter + 1;
            if (items.length === 1 && nextPos < content.length && content[nextPos] === "\\")
            {
                firstHadDouble = true;
                nextPos += 1;
            }

            const next = IdentifierUtility.consumeExpressionIdentifier(content, nextPos, includeTrailingSpaceOrDoubleSpaceIfEndsAt);
            if (next === null)
                break;
            else
                items.push(next);
        }
        while (items[items.length - 1]!.positionAfter < content.length && content[items[items.length - 1]!.positionAfter] === "\\");

        if (items.length === 0)
            return null;
        else
        {
            let first: ExpressionIdentifier | null = null;
            const parts: ExpressionIdentifier[] = [];
            const removed = new Set<RawInputLocation>();
            if (firstHadDouble && items.length >= 2)
            {
                first = items[0]!.item;
                for (const r of items[0]!.removedCharacters)
                    removed.add(r);
                items.shift();
            }
            for (const item of items)
            {
                parts.push(item.item);
                for (const r of item.removedCharacters)
                    removed.add(r);
            }

            return new IdentifierUtility.Consumed(new Pair<ExpressionIdentifier | null, ExpressionIdentifier[]>(first, parts), items[items.length - 1]!.positionAfter, removed);
        }
    }

    public static consumeUnitIdentifier(content: string, startFrom: number): Pair<UnitIdentifier, RawInputLocation> | null
    {
        const inputStream = CharStream.fromString(content.substring(startFrom));
        const lexer = new UnitLexer(inputStream);
        const errorListener = new DescriptiveErrorListener();
        // PORT-NOTE: Java leaves the default console error listener in place too, which only prints.
        lexer.removeErrorListeners();
        lexer.addErrorListener(errorListener);
        const token = lexer.nextToken();
        // If there any errors, abort:
        if (errorListener.errors.length !== 0)
            return null;
        else if (token.type === UnitLexer.IDENT)
            return new Pair(token.text!, startFrom + token.stop + 1);
        else
            return null;
    }

    // Finds closest valid expression identifier
    public static fixExpressionIdentifier(original: string, hint: ExpressionIdentifier): ExpressionIdentifier
    {
        let processed = "";
        let last = Last.START;
        for (const c of codePoints(original))
        {
            if (last === Last.START && isAlphabetic(c))
            {
                processed += String.fromCodePoint(c);
                last = Last.VALID;
            }
            else if (last === Last.START && isDigit(c))
            {
                // Stick an N on the front:
                processed += "N" + String.fromCodePoint(c);
                last = Last.VALID;
            }
            else if (last !== Last.START && (isAlphabetic(c) || isOtherLetter(c) || isDigit(c)))
            {
                processed += String.fromCodePoint(c);
                last = Last.VALID;
            }
            else if (last !== Last.SPACE && (c === 0x5f /* _ */ || isWhitespace(c)))
            {
                processed += c === 0x5f ? "_" : " ";
                last = Last.SPACE;
            }
            // Swap others to space:
            else if (last !== Last.SPACE)
            {
                processed += " ";
                last = Last.SPACE;
            }
        }

        const r = IdentifierUtility.asExpressionIdentifier(javaTrim(processed));
        if (r !== null)
            return r;
        else
            return hint;
    }

    public static identNum(stem: ExpressionIdentifier, num: number): ExpressionIdentifier
    {
        return IdentifierUtility.fixExpressionIdentifier(stem + " " + num, stem);
    }
}

export namespace IdentifierUtility
{
    export class Consumed<T>
    {
        public constructor(
            public readonly item: T,
            public readonly positionAfter: RawInputLocation,
            public readonly removedCharacters: ReadonlySet<RawInputLocation>)
        {
        }
    }
}
