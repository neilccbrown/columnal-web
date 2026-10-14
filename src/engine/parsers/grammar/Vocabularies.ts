// Java's generated recognizers have a public static VOCABULARY; antlr-ng's keep theirs
// private, so ported code gets one from the public literal and symbolic names instead:
//   Java: UnitParser.VOCABULARY    TypeScript: vocabularyOf(UnitParser)
import { Vocabulary } from "antlr4ng";

interface Recognizer
{
    readonly literalNames: readonly (string | null)[];
    readonly symbolicNames: readonly (string | null)[];
}

const cache = new WeakMap<Recognizer, Vocabulary>();

export function vocabularyOf(recognizer: Recognizer): Vocabulary
{
    let v = cache.get(recognizer);
    if (v === undefined)
    {
        v = new Vocabulary([...recognizer.literalNames], [...recognizer.symbolicNames], []);
        cache.set(recognizer, v);
    }
    return v;
}
