// Port of test.gen.GenString (tests-basic testFixtures).
import { isDefined } from "../../../../../src/engine/java/JavaCharacter.js";
import { AbstractStringGenerator, type SourceOfRandomness } from "../../../../support/quickcheck.js";

export class GenString extends AbstractStringGenerator
{
    protected override nextCodePoint(random: SourceOfRandomness): number
    {
        let n = random.nextInt(0x20, 0x10FFFF);
        if (n === 0x7F || !isDefined(n) || (n >= 0xD800 && n < 0xE000))
            n = random.nextInt(0x20, 0x7E);
        return n;
    }

    protected override codePointInRange(codePoint: number): boolean
    {
        return codePoint >= 0x20 && codePoint < 0x10FFFF && codePoint !== 0x7F && isDefined(codePoint);
    }
}
