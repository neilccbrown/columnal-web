// Port of test.gen.nonsenseTrans.GenNonsenseRTransform (tests-tables testFixtures).
import { toJavaString } from "../../../../../../src/engine/java/JavaBigDecimal.js";
import { RTransformation } from "../../../../../../src/engine/transformations/transformations/RTransformation.js";
import { Generator, type GenerationStatus, type SourceOfRandomness } from "../../../../../support/quickcheck.js";
import { TBasicUtil } from "../../../../tests-basic/fixtures/data/TBasicUtil.js";
import { TFunctionUtil } from "../../../../tests-functions/fixtures/functions/TFunctionUtil.js";
import { Transformation_Mgr } from "../../Transformation_Mgr.js";

/**
 * Created by neil on 27/11/2016.
 */
export class GenNonsenseRTransform extends Generator<Transformation_Mgr>
{
    public override generate(sourceOfRandomness: SourceOfRandomness, generationStatus: GenerationStatus): Transformation_Mgr
    {
        const mgr = TFunctionUtil.managerWithTestTypes().getFirst();
        const srcIds = TBasicUtil.makeList(sourceOfRandomness, 0, 5, () => TBasicUtil.generateTableId(sourceOfRandomness));
        const pkgs = TBasicUtil.makeList(sourceOfRandomness, 0, 10, () => TBasicUtil.generateIdent(sourceOfRandomness));
        const rExpression = toJavaString(TBasicUtil.generateNumberV(sourceOfRandomness, generationStatus));

        return new Transformation_Mgr(mgr, new RTransformation(mgr, TFunctionUtil.ILD, srcIds, pkgs, rExpression));
    }
}
