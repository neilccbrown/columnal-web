// Port of test.gen.nonsenseTrans.GenNonsenseCheck (tests-tables testFixtures).
import { Table } from "../../../../../../src/engine/data/data/Table.js";
import { Check } from "../../../../../../src/engine/transformations/transformations/Check.js";
import { Generator, type GenerationStatus, type SourceOfRandomness } from "../../../../../support/quickcheck.js";
import { TBasicUtil } from "../../../../tests-basic/fixtures/data/TBasicUtil.js";
import { TFunctionUtil } from "../../../../tests-functions/fixtures/functions/TFunctionUtil.js";
import { Transformation_Mgr } from "../../Transformation_Mgr.js";
import { GenNonsenseExpression } from "./GenNonsenseExpression.js";

/**
 * Created by neil on 27/11/2016.
 */
export class GenNonsenseCheck extends Generator<Transformation_Mgr>
{
    public override generate(sourceOfRandomness: SourceOfRandomness, generationStatus: GenerationStatus): Transformation_Mgr
    {
        const ids = TBasicUtil.generateTableIdPair(sourceOfRandomness);
        const mgr = TFunctionUtil.managerWithTestTypes().getFirst();
        const genNonsenseExpression = new GenNonsenseExpression();
        genNonsenseExpression.setTableManager(mgr);
        const nonsenseExpression = genNonsenseExpression.generate(sourceOfRandomness, generationStatus);
        return new Transformation_Mgr(mgr, new Check(mgr, new Table.InitialLoadDetails(ids.getFirst(), null, null, null), ids.getSecond(), Check.CheckType.values()[sourceOfRandomness.nextInt(Check.CheckType.values().length)]!, nonsenseExpression));
    }
}
