// Port of test.gen.GenYearMonth (tests-gui-central).
import { YearMonth } from "../../../../src/engine/java/time/JavaTime.js";
import { Generator, type GenerationStatus, type SourceOfRandomness } from "../../../support/quickcheck.js";

/**
 * Created by neil on 15/12/2016.
 */
export class GenYearMonth extends Generator<YearMonth>
{
    public override generate(r: SourceOfRandomness, _generationStatus: GenerationStatus): YearMonth
    {
        return YearMonth.of(r.nextInt(1900, 2200), r.nextInt(12) + 1);
    }
}
