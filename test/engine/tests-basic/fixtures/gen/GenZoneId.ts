// Port of test.gen.GenZoneId (tests-basic testFixtures).
//
// PORT-NOTE: junit-quickcheck's ZoneIdGenerator chooses from ZoneId.getAvailableZoneIds(), a
// HashSet; here it chooses from the same IDs (Java 21's) in sorted order, so the same random
// numbers pick different zones than in Java.  js-joda lacks the SystemV zones, which GenZoneId
// rejects anyway, so the ID is checked before the ZoneId is made (using the same randomness).
import { JAVA_ZONE_IDS } from "../../../../../src/engine/java/time/JavaZoneData.js";
import { ZoneId } from "../../../../../src/engine/java/time/JavaTime.js";
import { Generator, type GenerationStatus, type SourceOfRandomness } from "../../../../support/quickcheck.js";

// junit-quickcheck's ZoneIdGenerator, giving the ID (see the PORT-NOTE above)
class ZoneIdGenerator extends Generator<string>
{
    public override generate(random: SourceOfRandomness, _status: GenerationStatus): string
    {
        return random.choose(JAVA_ZONE_IDS);
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
        let zone: string;
        do
        {
            zone = genZoneId.generate(sourceOfRandomness, generationStatus);
        }
        while (zone.includes("SystemV") || zone.includes("GMT0") || (zone.length === 3 && zone.endsWith("T")));
        return ZoneId.of(zone);
    }
}
