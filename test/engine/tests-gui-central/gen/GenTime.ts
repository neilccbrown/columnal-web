// Port of test.gen.GenTime (tests-gui-central).
import { LocalTime } from "../../../../src/engine/java/time/JavaTime.js";
import { Generator, type GenerationStatus, type SourceOfRandomness } from "../../../support/quickcheck.js";

/**
 * Created by neil on 15/12/2016.
 */
export class GenTime extends Generator<LocalTime>
{
    public override generate(r: SourceOfRandomness, _generationStatus: GenerationStatus): LocalTime
    {
        return LocalTime.of(r.nextInt(24), r.nextInt(60), r.nextInt(60), r.nextInt(1000000000));
    }
}
