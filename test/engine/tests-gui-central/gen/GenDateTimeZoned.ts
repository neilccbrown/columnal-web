// Port of test.gen.GenDateTimeZoned (tests-gui-central).
import type { ZonedDateTime } from "../../../../src/engine/java/time/JavaTime.js";
import { Generator, type GenerationStatus, type SourceOfRandomness } from "../../../support/quickcheck.js";
import { TBasicUtil } from "../../tests-basic/fixtures/data/TBasicUtil.js";

/**
 * Created by neil on 15/12/2016.
 */
export class GenDateTimeZoned extends Generator<ZonedDateTime>
{
    public override generate(sourceOfRandomness: SourceOfRandomness, generationStatus: GenerationStatus): ZonedDateTime
    {
        return TBasicUtil.generateDateTimeZoned(sourceOfRandomness, generationStatus);
    }
}
