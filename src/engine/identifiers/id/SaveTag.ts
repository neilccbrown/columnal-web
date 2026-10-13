// Port of xyz.columnal.id.SaveTag (identifiers module).
import { JavaRandom } from "../../java/JavaRandom.js";
import { javaTrim } from "../../java/JavaString.js";
import type { DetailContext } from "../../parsers/generated/MainParser2.js";

/**
 * A several-letter always-capitalised save tag, to help distinguish
 * tables in the saved files and prevent diff from seeing common lines
 * in different tables.
 */
export class SaveTag
{
    private static RANDOM = new JavaRandom();
    private readonly tag: string;

    // Java: SaveTag(String) and SaveTag(MainParser2.DetailContext)
    public constructor(tag: string | DetailContext)
    {
        this.tag = typeof tag === "string" ? tag : javaTrim(tag.DETAIL_BEGIN().getText().substring("@BEGIN".length));
    }

    public static generateRandom(): SaveTag
    {
        let index = SaveTag.RANDOM.nextInt(26 * 26 * 26);
        let cs = "";
        for (let i = 0; i < 3; i++)
        {
            cs += String.fromCharCode((index % 26) + 0x41 /* 'A' */);
            index = Math.trunc(index / 26);
        }
        return new SaveTag(cs);
    }

    public getTag(): string
    {
        return this.tag;
    }
}
