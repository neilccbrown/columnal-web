// Port of test.gen.GenDate (tests-basic testFixtures).
import type { LocalDate } from "../../../../../src/engine/java/time/JavaTime.js";
import { Generator, type GenerationStatus, type SourceOfRandomness } from "../../../../support/quickcheck.js";
import { TBasicUtil } from "../data/TBasicUtil.js";

/**
 * Created by neil on 15/12/2016.
 */
export class GenDate extends Generator<LocalDate>
{
    public override generate(sourceOfRandomness: SourceOfRandomness, generationStatus: GenerationStatus): LocalDate
    {
        return TBasicUtil.generateDate(sourceOfRandomness, generationStatus);
    }
}
