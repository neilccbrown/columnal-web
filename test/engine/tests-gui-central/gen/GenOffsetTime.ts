// Port of test.gen.GenOffsetTime (tests-gui-central).
import { OffsetTime } from "../../../../src/engine/java/time/JavaTime.js";
import { Generator, type GenerationStatus, type SourceOfRandomness } from "../../../support/quickcheck.js";
import { TBasicUtil } from "../../tests-basic/fixtures/data/TBasicUtil.js";

/**
 * Created by neil on 15/12/2016.
 */
export class GenOffsetTime extends Generator<OffsetTime>
{
    public override generate(r: SourceOfRandomness, generationStatus: GenerationStatus): OffsetTime
    {
        return OffsetTime.of(r.nextInt(24), r.nextInt(60), r.nextInt(60), r.nextInt(1000000000), TBasicUtil.generateZoneOffset(r, generationStatus));
    }
}
