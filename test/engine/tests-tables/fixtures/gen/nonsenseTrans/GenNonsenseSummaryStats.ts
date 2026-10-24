// Port of test.gen.nonsenseTrans.GenNonsenseSummaryStats (tests-tables testFixtures).
import { Table } from "../../../../../../src/engine/data/data/Table.js";
import { CallExpression, IdentExpression, type Expression } from "../../../../../../src/engine/expressions/transformations/expression/Expressions.js";
import { FunctionList } from "../../../../../../src/engine/functions/transformations/function/FunctionList.js";
import type { ColumnId } from "../../../../../../src/engine/identifiers/id/ColumnId.js";
import { Aggregate } from "../../../../../../src/engine/transformations/transformations/Aggregate.js";
import { Pair } from "../../../../../../src/engine/utility-adt/utility/adt/Pair.js";
import { Generator, type GenerationStatus, type SourceOfRandomness } from "../../../../../support/quickcheck.js";
import { TBasicUtil } from "../../../../tests-basic/fixtures/data/TBasicUtil.js";
import { DummyManager } from "../../../../tests-functions/fixtures/DummyManager.js";
import { Transformation_Mgr } from "../../Transformation_Mgr.js";

/**
 * Created by neil on 16/11/2016.
 */
export class GenNonsenseSummaryStats extends Generator<Transformation_Mgr>
{
    public override generate(sourceOfRandomness: SourceOfRandomness, _generationStatus: GenerationStatus): Transformation_Mgr
    {
        const ids = TBasicUtil.generateTableIdPair(sourceOfRandomness);
        const splitBy = TBasicUtil.makeList(sourceOfRandomness, 0, 4, () => TBasicUtil.generateColumnId(sourceOfRandomness));

        const mgr = new DummyManager();
        const summaries = TBasicUtil.makeList(sourceOfRandomness, 1, 5, () => new Pair<ColumnId, Expression>(TBasicUtil.generateColumnId(sourceOfRandomness),
            new CallExpression(FunctionList.getFunctionLookup(mgr.getUnitManager()), "count", IdentExpression.makeEntireColumnReference(TBasicUtil.generateTableId(sourceOfRandomness), TBasicUtil.generateColumnId(sourceOfRandomness)))));
        return new Transformation_Mgr(mgr, new Aggregate(mgr, new Table.InitialLoadDetails(ids.getFirst(), null, null, null), ids.getSecond(), [...summaries], [...splitBy]));
    }
}
