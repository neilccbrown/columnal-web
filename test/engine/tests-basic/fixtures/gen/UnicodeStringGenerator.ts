// Port of test.gen.UnicodeStringGenerator (tests-basic testFixtures).
import { AbstractStringGenerator, type SourceOfRandomness } from "../../../../support/quickcheck.js";

export class UnicodeStringGenerator extends AbstractStringGenerator
{
    protected override nextCodePoint(random: SourceOfRandomness): number
    {
        return random.nextInt(0, 0x10FFFF);
    }

    protected override codePointInRange(codePoint: number): boolean
    {
        return codePoint >= 0 && codePoint < 0x10FFFF;
    }
}
