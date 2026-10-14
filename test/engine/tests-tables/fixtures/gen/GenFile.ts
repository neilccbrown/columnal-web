// Port of test.gen.GenFile (tests-tables testFixtures).
//
// PORT-NOTE: Java writes a temporary file; here the file's bytes are held in memory (see
// JavaFile).  Java chooses from all the JVM's charsets; here the choice is from the charsets
// the engine can read (JavaCharset.ts), encoded with iconv-lite.  As in Java, a value which does
// not survive encoding and decoding is replaced.
import iconv from "iconv-lite";
import { Charset } from "../../../../../src/engine/java/JavaCharset.js";
import { javaDoubleToString } from "../../../../../src/engine/java/JavaDouble.js";
import { JavaFile } from "../../../../../src/engine/java/JavaFile.js";
import { DataType } from "../../../../../src/engine/types/data/datatype/DataType.js";
import { DataTypeUtility } from "../../../../../src/engine/types/data/datatype/DataTypeUtility.js";
import type { Value } from "../../../../../src/engine/utility/utility/Value.js";
import { Generator, type GenerationStatus, type SourceOfRandomness } from "../../../../support/quickcheck.js";
import { GenTypeAndValueGen } from "../../../tests-functions/fixtures/gen/type/GenTypeAndValueGen.js";
import { GeneratedTextFile } from "../data/GeneratedTextFile.js";

// iconv-lite's names for the charsets whose Java names it does not know:
const ICONV_NAMES: Readonly<Record<string, string>> = {
    "x-MacCyrillic": "maccyrillic",
    "x-MacRoman": "macroman",
    "x-windows-874": "windows-874",
};

function encode(s: string, charset: Charset): Uint8Array
{
    return iconv.encode(s, ICONV_NAMES[charset.name()] ?? charset.name());
}

// Java: charset.newEncoder().canEncode(s), plus the round-trip check that Java's GenFile does for text
function canEncDec(s: string, charset: Charset): boolean
{
    return charset.decode(encode(s, charset)) === s;
}

let tempFileCount = 0;

/**
 * Created by neil on 26/10/2016.
 */
export class GenFile extends Generator<GeneratedTextFile>
{
    public override generate(rnd: SourceOfRandomness, generationStatus: GenerationStatus): GeneratedTextFile
    {
        // We include a multibyte delimiter to stress test:
        const sep = rnd.choose([",", ";", "\t", String.fromCodePoint(0x1F806)]);
        const quot = rnd.choose(["\"", "'", String.fromCodePoint(0x1F962)]);

        let charset = rnd.choose([...Charset.availableCharsets().values()].filter(c =>
            !c.displayName().includes("JIS") &&
            !c.displayName().includes("2022") &&
            !c.displayName().includes("IBM") &&
            !c.displayName().includes("COMPOUND_TEXT") &&
            canEncDec(sep, c) && canEncDec(quot, c)
        ));

        // Make most common case more likely to come up:
        if (rnd.nextInt(5) === 1)
            charset = Charset.UTF_8;

        let w = "";

        const columnCount = rnd.nextInt(1, 6);
        const lineCount = rnd.nextInt(0, 10000);

        const columnTypes: GenTypeAndValueGen.TypeAndValueGen[] = [];
        const typeGen = new GenTypeAndValueGen(true);
        const columnValues: Value[][] = [];
        for (let i = 0; i < columnCount; i++)
        {
            columnTypes.push(typeGen.generate(rnd, generationStatus));
            columnValues.push([]);
        }


        for (let line = 0; line < lineCount; line++)
        {
            for (let column = 0; column < columnTypes.length; column++)
            {
                let value = columnTypes[column]!.makeValue();
                // We don't want quoting and escaping of strings, so treat them different
                let string: string;
                if (columnTypes[column]!.getType().equals(DataType.TEXT))
                {
                    string = value as string;

                    if (!canEncDec(string, charset))
                    {
                        string = "" + javaDoubleToString(rnd.nextDouble());
                        value = DataTypeUtility.value(string);
                    }
                }
                else
                {
                    string = DataTypeUtility.valueToString(value);
                }

                const quote = string.includes(sep) || string.includes(quot) || rnd.nextInt(3) === 1;

                if (quote)
                {
                    string = quot + string.split(quot).join(quot + quot) + quot;
                }

                w += (column > 0 ? sep : "") + string;
                columnValues[column]!.push(value);
            }
            w += "\n";
        }

        const file = new JavaFile("/tmp/aaa" + (tempFileCount++) + "bbb", encode(w, charset));

        return new GeneratedTextFile(file, charset, lineCount, sep, quot,
            columnTypes.map(t => t.getType()),
            columnValues);
    }
}
