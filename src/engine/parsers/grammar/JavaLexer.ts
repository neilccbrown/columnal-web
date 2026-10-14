// The base class of every generated lexer (scripts/gen-parsers.mjs makes them extend it), which
// makes antlr4ng's Lexer behave like Java's ANTLR runtime when an action sets a token's text to "".
//
// antlr4ng ignores an empty text override: its Lexer.text getter and CommonTokenFactory both test
// `if (text)`, where Java's runtime tests `text != null`.  So in antlr4ng, a lexer action that
// sets the text to "" (for example, the empty string literal "" in StringLexerShared, or a blank
// line in a saved file's detail block in MainLexer2) gives a token with the whole matched text
// instead.  This class remembers an empty text override and applies it to the emitted token.
import { Lexer, type Token } from "antlr4ng";

export abstract class JavaLexer extends Lexer
{
    // Whether an action set the current token's text to "".
    private emptyTextOverride = false;

    public override get text(): string
    {
        return this.emptyTextOverride ? "" : super.text;
    }

    public override set text(text: string)
    {
        super.text = text;
        this.emptyTextOverride = text === "";
    }

    public override emit(): Token
    {
        const t = super.emit();
        if (this.emptyTextOverride)
            t.text = "";
        this.emptyTextOverride = false;
        return t;
    }

    public override nextToken(): Token
    {
        this.emptyTextOverride = false;
        return super.nextToken();
    }

    // A skipped token is not emitted, so forget its text override here:
    public override skip(): void
    {
        this.emptyTextOverride = false;
        super.skip();
    }
}
