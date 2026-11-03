// Port of test.gen.GenEditableColumn (tests-gui-central).
import type { ExpressionIdentifier } from "../../../../src/engine/anns/Annotations.js";
import { ColumnUtility } from "../../../../src/engine/data/data/ColumnUtility.js";
import type { EditableColumn } from "../../../../src/engine/data/data/EditableColumn.js";
import { EditableRecordSet } from "../../../../src/engine/data/data/EditableRecordSet.js";
import { ColumnId } from "../../../../src/engine/identifiers/id/ColumnId.js";
import { Either } from "../../../../src/engine/utility-adt/utility/adt/Either.js";
import type { Value } from "../../../../src/engine/utility/utility/Value.js";
import type { GenerationStatus, SourceOfRandomness } from "../../../support/quickcheck.js";
import { GenValueBase } from "../../tests-functions/fixtures/gen/GenValueBase.js";
import { GenDataType } from "../../tests-functions/fixtures/gen/type/GenDataType.js";

/**
 * Created by neil on 30/05/2017.
 */
export class GenEditableColumn extends GenValueBase<EditableColumn>
{
    public generate(sourceOfRandomness: SourceOfRandomness, generationStatus: GenerationStatus): EditableColumn
    {
        const genDataType = new GenDataType(true);
        const type = genDataType.generate(sourceOfRandomness, generationStatus);
        this.r = sourceOfRandomness;
        this.gs = generationStatus;
        const length = sourceOfRandomness.nextInt(5000);
        const values: Either<string, Value>[] = [];
        for (let i = 0; i < length; i++)
        {
            values.push(Either.right(this.makeValue(type)));
        }
        const create = ColumnUtility.makeImmediateColumn(type, new ColumnId("C" as ExpressionIdentifier), values, this.makeValue(type));
        const recordSet = new EditableRecordSet([create], () => length);
        return recordSet.getColumns()[0] as EditableColumn;
    }
}
