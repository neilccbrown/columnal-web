// Port of test.gen.nonsenseTrans.GenNonsenseJoin (tests-tables testFixtures).
import { Table } from "../../../../../../src/engine/data/data/Table.js";
import type { ColumnId } from "../../../../../../src/engine/identifiers/id/ColumnId.js";
import { Join } from "../../../../../../src/engine/transformations/transformations/Join.js";
import { Pair } from "../../../../../../src/engine/utility-adt/utility/adt/Pair.js";
import type { GenerationStatus, SourceOfRandomness } from "../../../../../support/quickcheck.js";
import { TBasicUtil } from "../../../../tests-basic/fixtures/data/TBasicUtil.js";
import { TFunctionUtil } from "../../../../tests-functions/fixtures/functions/TFunctionUtil.js";
import { GenValueBase } from "../../../../tests-functions/fixtures/gen/GenValueBase.js";
import { Transformation_Mgr } from "../../Transformation_Mgr.js";

/**
 * Created by neil on 02/02/2017.
 */
export class GenNonsenseJoin extends GenValueBase<Transformation_Mgr>
{
    public override generate(sourceOfRandomness: SourceOfRandomness, generationStatus: GenerationStatus): Transformation_Mgr
    {
        this.r = sourceOfRandomness;
        this.gs = generationStatus;
        const mgr = TFunctionUtil.managerWithTestTypes().getFirst();
        const ourId = TBasicUtil.generateTableId(sourceOfRandomness);
        const srcIdA = TBasicUtil.generateTableId(sourceOfRandomness);
        const srcIdB = TBasicUtil.generateTableId(sourceOfRandomness);
        const columns = TBasicUtil.makeList(this.r, 0, 5, () => new Pair<ColumnId, ColumnId>(TBasicUtil.generateColumnId(this.r), TBasicUtil.generateColumnId(this.r)));
        return new Transformation_Mgr(mgr, new Join(mgr, new Table.InitialLoadDetails(ourId, null, null, null), srcIdA, srcIdB, this.r.nextBoolean(), columns));
    }
}
