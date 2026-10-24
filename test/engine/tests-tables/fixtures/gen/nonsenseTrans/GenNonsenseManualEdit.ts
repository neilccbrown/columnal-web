// Port of test.gen.nonsenseTrans.GenNonsenseManualEdit (tests-tables testFixtures).
import { Table } from "../../../../../../src/engine/data/data/Table.js";
import type { ColumnId } from "../../../../../../src/engine/identifiers/id/ColumnId.js";
import { HashMap } from "../../../../../../src/engine/java/HashMap.js";
import { Decimal } from "../../../../../../src/engine/java/JavaBigDecimal.js";
import { IllegalStateException } from "../../../../../../src/engine/java/JavaExceptions.js";
import { ManualEdit } from "../../../../../../src/engine/transformations/transformations/ManualEdit.js";
import type { DataType } from "../../../../../../src/engine/types/data/datatype/DataType.js";
import { Either } from "../../../../../../src/engine/utility-adt/utility/adt/Either.js";
import { Pair } from "../../../../../../src/engine/utility-adt/utility/adt/Pair.js";
import type { Value } from "../../../../../../src/engine/utility/utility/Value.js";
import { Generator, type GenerationStatus, type SourceOfRandomness } from "../../../../../support/quickcheck.js";
import { TBasicUtil } from "../../../../tests-basic/fixtures/data/TBasicUtil.js";
import { TFunctionUtil } from "../../../../tests-functions/fixtures/functions/TFunctionUtil.js";
import { GenTypeAndValueGen } from "../../../../tests-functions/fixtures/gen/type/GenTypeAndValueGen.js";
import { Transformation_Mgr } from "../../Transformation_Mgr.js";

import ColumnReplacementValues = ManualEdit.ColumnReplacementValues;

export class GenNonsenseManualEdit extends Generator<Transformation_Mgr>
{
    public override generate(random: SourceOfRandomness, status: GenerationStatus): Transformation_Mgr
    {
        const genTypeAndValueGen = new GenTypeAndValueGen();

        const ids = TBasicUtil.generateTableIdPair(random);
        const mgr = TFunctionUtil.managerWithTestTypes().getFirst();
        // Java: a HashMap, copied to an ImmutableMap (which keeps its order)
        const replacements = HashMap.javaOrder<ColumnId, ColumnReplacementValues>();


        const keyColumn = random.nextInt(4) === 1 ? null : genTypeAndValueGen.generate(random, status);
        if (keyColumn !== null)
            mgr.getTypeManager()._test_copyTaggedTypesFrom(keyColumn.getTypeManager());
        const replacementKey = keyColumn === null ? null : new Pair<ColumnId, DataType>(TBasicUtil.generateColumnId(random), keyColumn.getType());

        const columnsAffected = random.nextInt(0, 5);
        for (let i = 0; i < columnsAffected; i++)
        {
            const columnId = TBasicUtil.generateColumnId(random);
            const typeAndValueGen = genTypeAndValueGen.generate(random, status);
            try
            {
                mgr.getTypeManager()._test_copyTaggedTypesFrom(typeAndValueGen.getTypeManager());
            }
            catch (e)
            {
                if (!(e instanceof IllegalStateException))
                    throw e;
                // Duplicate types; just skip
                continue;
            }

            const ps = TBasicUtil.makeList(random, 1, 5, () => new Pair<Value, Either<string, Value>>(keyColumn === null ? new Decimal(random.nextInt()) : keyColumn.makeValue(), random.nextInt(5) === 1 ? Either.left<string, Value>("#" + random.nextInt()) : Either.right<string, Value>(typeAndValueGen.makeValue())));

            replacements.set(columnId, new ColumnReplacementValues(typeAndValueGen.getType(), ps));
        }

        return new Transformation_Mgr(mgr, new ManualEdit(mgr, new Table.InitialLoadDetails(ids.getFirst(), null, null, null), ids.getSecond(), replacementKey, [...replacements.entries()]));
    }
}
