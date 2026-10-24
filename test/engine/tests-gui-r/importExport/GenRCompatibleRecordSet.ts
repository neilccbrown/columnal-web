// Port of test.importExport.GenRCompatibleRecordSet (tests-gui-r, a test helper rather than a test).
import type { ExpressionIdentifier } from "../../../../src/engine/anns/Annotations.js";
import { ColumnUtility } from "../../../../src/engine/data/data/ColumnUtility.js";
import type { EditableColumn } from "../../../../src/engine/data/data/EditableColumn.js";
import { KnownLengthRecordSet } from "../../../../src/engine/data/data/KnownLengthRecordSet.js";
import type { RecordSet } from "../../../../src/engine/data/data/RecordSet.js";
import { ColumnId } from "../../../../src/engine/identifiers/id/ColumnId.js";
import { ConvertFromR } from "../../../../src/engine/r-interop/rinterop/ConvertFromR.js";
import type { TypeManager } from "../../../../src/engine/types/data/datatype/TypeManager.js";
import { Either } from "../../../../src/engine/utility-adt/utility/adt/Either.js";
import type { SimulationFunction } from "../../../../src/engine/utility-functional/utility/function/simulation/SimulationFunction.js";
import type { Value } from "../../../../src/engine/utility/utility/Value.js";
import { Generator, type GenerationStatus, type SourceOfRandomness } from "../../../support/quickcheck.js";
import { TBasicUtil } from "../../tests-basic/fixtures/data/TBasicUtil.js";
import { GenDataTypeMaker } from "../../tests-functions/fixtures/gen/type/GenDataTypeMaker.js";
import { GenJellyTypeMaker } from "../../tests-functions/fixtures/gen/type/GenJellyTypeMaker.js";

import TableType = ConvertFromR.TableType;
import TypeKinds = GenJellyTypeMaker.TypeKinds;

export class GenRCompatibleRecordSet extends Generator<GenRCompatibleRecordSet.RCompatibleRecordSet>
{
    public override generate(random: SourceOfRandomness, status: GenerationStatus): GenRCompatibleRecordSet.RCompatibleRecordSet
    {
        const tibbleOnly = random.nextBoolean();
        const core = [TypeKinds.NUM_TEXT_TEMPORAL, TypeKinds.MAYBE_UNNESTED, TypeKinds.NEW_TAGGED_NO_INNER, TypeKinds.BOOLEAN];
        const gen = new GenDataTypeMaker(
                new Set(tibbleOnly ? [...core, TypeKinds.LIST, TypeKinds.RECORD] : core),
                true);

        const numColumns = 1 + random.nextInt(10);
        const numRows = random.nextInt(20);

        const nextCol = [0];
        const dataTypeMaker = gen.generate(random, status);
        return new GenRCompatibleRecordSet.RCompatibleRecordSet(new KnownLengthRecordSet(TBasicUtil.makeList<SimulationFunction<RecordSet, EditableColumn>>(random, numColumns, numColumns, () => {
            const type = dataTypeMaker.makeType();
            const columnId: ExpressionIdentifier = "Col " + nextCol[0]!++;
            return ColumnUtility.makeImmediateColumn(type.getDataType(), new ColumnId(columnId), TBasicUtil.makeList(random, numRows, numRows, () => Either.right<string, Value>(type.makeValue())), type.makeValue());
        }), numRows), dataTypeMaker.getTypeManager(), tibbleOnly ? [TableType.TIBBLE] : [TableType.DATA_FRAME, TableType.TIBBLE]);
    }
}

export namespace GenRCompatibleRecordSet
{
    export class RCompatibleRecordSet
    {
        public readonly recordSet: KnownLengthRecordSet;
        public readonly typeManager: TypeManager;
        public readonly supportedTableTypes: readonly TableType[];

        public constructor(recordSet: KnownLengthRecordSet, typeManager: TypeManager, supportedTableTypes: readonly TableType[])
        {
            this.recordSet = recordSet;
            this.typeManager = typeManager;
            this.supportedTableTypes = supportedTableTypes;
        }
    }
}
