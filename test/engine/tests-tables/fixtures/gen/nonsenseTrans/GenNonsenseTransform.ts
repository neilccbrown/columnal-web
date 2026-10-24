// Port of test.gen.nonsenseTrans.GenNonsenseTransform (tests-tables testFixtures).
import { Table } from "../../../../../../src/engine/data/data/Table.js";
import type { Expression } from "../../../../../../src/engine/expressions/transformations/expression/Expressions.js";
import type { ColumnId } from "../../../../../../src/engine/identifiers/id/ColumnId.js";
import { HashMap } from "../../../../../../src/engine/java/HashMap.js";
import { Calculate } from "../../../../../../src/engine/transformations/transformations/Calculate.js";
import { Generator, type GenerationStatus, type SourceOfRandomness } from "../../../../../support/quickcheck.js";
import { TBasicUtil } from "../../../../tests-basic/fixtures/data/TBasicUtil.js";
import { TFunctionUtil } from "../../../../tests-functions/fixtures/functions/TFunctionUtil.js";
import { Transformation_Mgr } from "../../Transformation_Mgr.js";
import { GenNonsenseExpression } from "./GenNonsenseExpression.js";

/**
 * Created by neil on 27/11/2016.
 */
export class GenNonsenseTransform extends Generator<Transformation_Mgr>
{
    public override generate(sourceOfRandomness: SourceOfRandomness, generationStatus: GenerationStatus): Transformation_Mgr
    {
        const ids = TBasicUtil.generateTableIdPair(sourceOfRandomness);
        const mgr = TFunctionUtil.managerWithTestTypes().getFirst();
        const genNonsenseExpression = new GenNonsenseExpression();
        genNonsenseExpression.setTableManager(mgr);
        // Java: a HashMap, copied to an ImmutableMap (which keeps its order)
        const columns = HashMap.javaOrder<ColumnId, Expression>();
        const numColumns = sourceOfRandomness.nextInt(0, 5);
        for (let i = 0; i < numColumns; i++)
        {
            const nonsenseExpression = genNonsenseExpression.generate(sourceOfRandomness, generationStatus);
            let columnId = TBasicUtil.generateColumnId(sourceOfRandomness);
            while (columns.has(columnId))
                columnId = TBasicUtil.generateColumnId(sourceOfRandomness);
            columns.set(columnId, nonsenseExpression);
        }
        return new Transformation_Mgr(mgr, new Calculate(mgr, new Table.InitialLoadDetails(ids.getFirst(), null, null, null), ids.getSecond(), new HashMap(columns)));
    }
}
