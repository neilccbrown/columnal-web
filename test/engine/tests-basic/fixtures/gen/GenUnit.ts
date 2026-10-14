// Port of test.gen.GenUnit (tests-basic testFixtures).
import type { SingleUnit } from "../../../../../src/engine/types/data/unit/SingleUnit.js";
import { Unit } from "../../../../../src/engine/types/data/unit/Unit.js";
import { UnitManager } from "../../../../../src/engine/types/data/unit/UnitManager.js";
import { Generator, type GenerationStatus, type SourceOfRandomness } from "../../../../support/quickcheck.js";

/**
 * Created by neil on 13/12/2016.
 */
export class GenUnit extends Generator<Unit>
{
    private units: SingleUnit[] | null = null;

    public override generate(r: SourceOfRandomness, _generationStatus: GenerationStatus): Unit
    {
        if (this.units === null)
        {
            const mgr = new UnitManager();
            this.units = mgr.getAllDeclared();
        }
        let u = Unit.SCALAR;
        const numUnits = r.nextInt(0, 5);
        for (let i = 0; i < numUnits; i++)
        {
            let power = r.nextInt(1, 10);
            if (r.nextBoolean())
                power = -power;
            u = u.times(new Unit(r.choose(this.units)).raisedTo(power));
        }
        return u;
    }
}
