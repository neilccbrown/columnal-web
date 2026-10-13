// Port of test.gen.GenNumbersAsString (tests-basic testFixtures).
import { Generator, type GenerationStatus, type SourceOfRandomness } from "../../../../support/quickcheck.js";
import { TBasicUtil } from "../data/TBasicUtil.js";
import { GenNumberAsString } from "./GenNumberAsString.js";

/**
 * Created by neil on 09/12/2016.
 */
export class GenNumbersAsString extends Generator<string[]>
{
    public override generate(sourceOfRandomness: SourceOfRandomness, generationStatus: GenerationStatus): string[]
    {
        const length = sourceOfRandomness.nextInt(0, 100);
        return TBasicUtil.makeList(length, new GenNumberAsString(true), sourceOfRandomness, generationStatus);
    }
}
