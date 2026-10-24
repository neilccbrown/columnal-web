// Port of test.gen.nonsenseTrans.GenNonsenseConcatenate (tests-tables testFixtures).
import { Table } from "../../../../../../src/engine/data/data/Table.js";
import { javaEnumValues } from "../../../../../../src/engine/java/JavaEnum.js";
import { Concatenate } from "../../../../../../src/engine/transformations/transformations/Concatenate.js";
import type { GenerationStatus, SourceOfRandomness } from "../../../../../support/quickcheck.js";
import { TBasicUtil } from "../../../../tests-basic/fixtures/data/TBasicUtil.js";
import { TFunctionUtil } from "../../../../tests-functions/fixtures/functions/TFunctionUtil.js";
import { GenValueBase } from "../../../../tests-functions/fixtures/gen/GenValueBase.js";
import { Transformation_Mgr } from "../../Transformation_Mgr.js";

import IncompleteColumnHandling = Concatenate.IncompleteColumnHandling;

/**
 * Created by neil on 02/02/2017.
 */
export class GenNonsenseConcatenate extends GenValueBase<Transformation_Mgr>
{
    public override generate(sourceOfRandomness: SourceOfRandomness, generationStatus: GenerationStatus): Transformation_Mgr
    {
        this.r = sourceOfRandomness;
        this.gs = generationStatus;
        const mgr = TFunctionUtil.managerWithTestTypes().getFirst();
        const ourId = TBasicUtil.generateTableId(sourceOfRandomness);
        const srcIds = TBasicUtil.makeList(sourceOfRandomness, 1, 5, () => TBasicUtil.generateTableId(sourceOfRandomness));
        const values = javaEnumValues<IncompleteColumnHandling>(IncompleteColumnHandling);
        const incompleteColumnHandling = values[sourceOfRandomness.nextInt(values.length)]!;
        return new Transformation_Mgr(mgr, new Concatenate(mgr, new Table.InitialLoadDetails(ourId, null, null, null), srcIds, incompleteColumnHandling, this.r.nextBoolean()));
    }
}
