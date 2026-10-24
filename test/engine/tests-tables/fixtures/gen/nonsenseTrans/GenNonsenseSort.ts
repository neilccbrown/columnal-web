// Port of test.gen.nonsenseTrans.GenNonsenseSort (tests-tables testFixtures).
import { Table } from "../../../../../../src/engine/data/data/Table.js";
import type { ColumnId } from "../../../../../../src/engine/identifiers/id/ColumnId.js";
import { Sort } from "../../../../../../src/engine/transformations/transformations/Sort.js";
import { Pair } from "../../../../../../src/engine/utility-adt/utility/adt/Pair.js";
import { Generator, type GenerationStatus, type SourceOfRandomness } from "../../../../../support/quickcheck.js";
import { TBasicUtil } from "../../../../tests-basic/fixtures/data/TBasicUtil.js";
import { DummyManager } from "../../../../tests-functions/fixtures/DummyManager.js";
import { Transformation_Mgr } from "../../Transformation_Mgr.js";

/**
 * Created by neil on 16/11/2016.
 */
export class GenNonsenseSort extends Generator<Transformation_Mgr>
{
    public override generate(sourceOfRandomness: SourceOfRandomness, _generationStatus: GenerationStatus): Transformation_Mgr
    {
        const ids = TBasicUtil.generateTableIdPair(sourceOfRandomness);
        const cols = TBasicUtil.makeList(sourceOfRandomness, 1, 10, () => new Pair<ColumnId, Sort.Direction>(TBasicUtil.generateColumnId(sourceOfRandomness), sourceOfRandomness.nextBoolean() ? Sort.Direction.ASCENDING : Sort.Direction.DESCENDING));

        const mgr = new DummyManager();
        return new Transformation_Mgr(mgr, new Sort(mgr, new Table.InitialLoadDetails(ids.getFirst(), null, null, null), ids.getSecond(), cols));
    }
}
