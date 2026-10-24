// Port of test.gen.nonsenseTrans.GenNonsenseHideColumns (tests-tables testFixtures).
import { Table } from "../../../../../../src/engine/data/data/Table.js";
import { HideColumns } from "../../../../../../src/engine/transformations/transformations/HideColumns.js";
import { Generator, type GenerationStatus, type SourceOfRandomness } from "../../../../../support/quickcheck.js";
import { TBasicUtil } from "../../../../tests-basic/fixtures/data/TBasicUtil.js";
import { DummyManager } from "../../../../tests-functions/fixtures/DummyManager.js";
import { Transformation_Mgr } from "../../Transformation_Mgr.js";

/**
 * Created by neil on 02/02/2017.
 */
export class GenNonsenseHideColumns extends Generator<Transformation_Mgr>
{
    public override generate(sourceOfRandomness: SourceOfRandomness, _generationStatus: GenerationStatus): Transformation_Mgr
    {
        const ids = TBasicUtil.generateTableIdPair(sourceOfRandomness);
        const cols = TBasicUtil.makeList(sourceOfRandomness, 0, 10, () => TBasicUtil.generateColumnId(sourceOfRandomness));

        const mgr = new DummyManager();
        return new Transformation_Mgr(mgr, new HideColumns(mgr, new Table.InitialLoadDetails(ids.getFirst(), null, null, null), ids.getSecond(), [...cols]));
    }
}
