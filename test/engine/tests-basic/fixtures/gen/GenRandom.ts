// Port of test.gen.GenRandom (tests-basic testFixtures).
import { JavaRandom } from "../../../../../src/engine/java/JavaRandom.js";
import { Generator, type GenerationStatus, type SourceOfRandomness } from "../../../../support/quickcheck.js";

/**
 * Created by neil on 29/11/2016.
 */
export class GenRandom extends Generator<JavaRandom>
{
    public override generate(sourceOfRandomness: SourceOfRandomness, _generationStatus: GenerationStatus): JavaRandom
    {
        return new JavaRandom(sourceOfRandomness.nextLong());
    }
}
