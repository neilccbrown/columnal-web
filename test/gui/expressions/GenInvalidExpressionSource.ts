// Port of test.gen.GenInvalidExpressionSource (tests-gui-expression-editor-further): up to 19 tokens
// (keywords, operators other than +, names and numbers) run together, mostly not a valid expression.
import { ExpressionLexer } from "../../../src/gui-logic/lex-editor/gui/lexeditor/ExpressionLexer.js";
import { Generator, type GenerationStatus, type SourceOfRandomness } from "../../support/quickcheck.js";

export class GenInvalidExpressionSource extends Generator<string>
{
    public override generate(random: SourceOfRandomness, _status: GenerationStatus): string
    {
        const tokenMakers: (() => string)[] = [
            ts(random, ...ExpressionLexer.Keyword.values().map(o => o.getContent())),
            ts(random, ...ExpressionLexer.Op.values().filter(o => o !== ExpressionLexer.Op.ADD).map(o => o.getContent())),
            ts(random, "a", "z"),
            ts(random, "1", "9", "1.2"),
        ];

        const totalTokens = random.nextInt(20);
        let r = "";
        for (let i = 0; i < totalTokens; i++)
        {
            r += tokenMakers[random.nextInt(tokenMakers.length)]!();
        }

        return r;
    }
}

function ts(r: SourceOfRandomness, ...options: string[]): () => string
{
    return () => options[r.nextInt(options.length)]!;
}
