// Port of test.gen.GenNumbers (tests-basic testFixtures).
import type { Decimal } from "../../../../../src/engine/java/JavaBigDecimal.js";
import { Generator, type GenerationStatus, type SourceOfRandomness } from "../../../../support/quickcheck.js";
import { TBasicUtil } from "../data/TBasicUtil.js";
import { GenNumber } from "./GenNumber.js";

/**
 * Created by neil on 09/12/2016.
 */
export class GenNumbers extends Generator<Decimal[]>
{
    public override generate(sourceOfRandomness: SourceOfRandomness, generationStatus: GenerationStatus): Decimal[]
    {
        const length = sourceOfRandomness.nextInt(0, 100);
        return TBasicUtil.makeList(length, new GenNumber(true), sourceOfRandomness, generationStatus);
    }
}
