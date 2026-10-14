// Port of test.gen.GenZoneId (tests-basic testFixtures).
//
// PORT-NOTE: junit-quickcheck's ZoneIdGenerator chooses from ZoneId.getAvailableZoneIds(), a
// HashSet; here it chooses from the same IDs (Java 21's) in sorted order, so the same random
// numbers pick different zones than in Java.
import { JAVA_ZONE_IDS } from "../../../../../src/engine/java/time/JavaZoneData.js";
import { ZoneId } from "../../../../../src/engine/java/time/JavaTime.js";
import { Generator, type GenerationStatus, type SourceOfRandomness } from "../../../../support/quickcheck.js";

// junit-quickcheck's ZoneIdGenerator
class ZoneIdGenerator extends Generator<ZoneId>
{
    public override generate(random: SourceOfRandomness, _status: GenerationStatus): ZoneId
    {
        return ZoneId.of(random.choose(JAVA_ZONE_IDS));
    }
}

/**
 * Created by neil on 16/12/2016.
 */
export class GenZoneId extends Generator<ZoneId>
{
    public override generate(sourceOfRandomness: SourceOfRandomness, generationStatus: GenerationStatus): ZoneId
    {
        const genZoneId = new ZoneIdGenerator();
        // Don't generate unrecognisable SystemV timezones:
        let zone: ZoneId;
        do
        {
            zone = genZoneId.generate(sourceOfRandomness, generationStatus);
        }
        while (zone.toString().includes("SystemV") || zone.toString().includes("GMT0") || (zone.toString().length === 3 && zone.toString().endsWith("T")));
        return zone;
    }
}
