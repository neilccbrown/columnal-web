// Port of test.gen.GenDateTime (tests-gui-central).
import type { LocalDateTime } from "../../../../src/engine/java/time/JavaTime.js";
import { Generator, type GenerationStatus, type SourceOfRandomness } from "../../../support/quickcheck.js";
import { TBasicUtil } from "../../tests-basic/fixtures/data/TBasicUtil.js";

/**
 * Created by neil on 15/12/2016.
 */
export class GenDateTime extends Generator<LocalDateTime>
{
    public override generate(sourceOfRandomness: SourceOfRandomness, generationStatus: GenerationStatus): LocalDateTime
    {
        return TBasicUtil.generateDateTime(sourceOfRandomness, generationStatus);
    }
}
