// Port of test.gen.GenColumn (tests-functions testFixtures).
import type { Column } from "../../../../../src/engine/data/data/Column.js";
import { ColumnUtility } from "../../../../../src/engine/data/data/ColumnUtility.js";
import type { RecordSet } from "../../../../../src/engine/data/data/RecordSet.js";
import type { TableManager } from "../../../../../src/engine/data/data/TableManager.js";
import type { ExpressionIdentifier } from "../../../../../src/engine/anns/Annotations.js";
import { ColumnId } from "../../../../../src/engine/identifiers/id/ColumnId.js";
import type { DataType } from "../../../../../src/engine/types/data/datatype/DataType.js";
import { Either } from "../../../../../src/engine/utility-adt/utility/adt/Either.js";
import { IdentifierUtility } from "../../../../../src/engine/utility/utility/IdentifierUtility.js";
import { Utility } from "../../../../../src/engine/utility/utility/Utility.js";
import type { Value } from "../../../../../src/engine/utility/utility/Value.js";
import type { GenerationStatus, SourceOfRandomness } from "../../../../support/quickcheck.js";
import { GenValueBase } from "./GenValueBase.js";

/** Java: ExBiFunction<Integer, RecordSet, Column> */
export type MakeColumn = (length: number, rs: RecordSet) => Column;

// Static so we don't get unintended duplicates during testing:
let nextId = 0;
const nextCol = (): ColumnId => new ColumnId(IdentifierUtility.identNum("GenCol" as ExpressionIdentifier, (nextId++)));

/**
 * Created by neil on 02/12/2016.
 */
export class GenColumn extends GenValueBase<MakeColumn>
{
    private readonly distinctTypes: readonly DataType[];
    private readonly canHaveErrors: boolean;

    // (Java keeps the manager in a field, which it never uses.)
    public constructor(_mgr: TableManager, distinctTypes: readonly DataType[], canHaveErrors: boolean)
    {
        super();
        this.distinctTypes = distinctTypes;
        this.canHaveErrors = canHaveErrors;
    }

    public override generate(sourceOfRandomness: SourceOfRandomness, generationStatus: GenerationStatus): MakeColumn
    {
        this.r = sourceOfRandomness;
        this.gs = generationStatus;
        const type = sourceOfRandomness.choose(this.distinctTypes);
        return this.columnForType(type, sourceOfRandomness);
    }

    // Only valid to call after generate has been called at least once
    public columnForType(type: DataType, sourceOfRandomness: SourceOfRandomness): MakeColumn
    {
        return (len, rs) => ColumnUtility.makeImmediateColumn(type, nextCol(), Utility.makeListEx<Either<string, Value>>(len, _i =>
        {
            if (this.canHaveErrors && sourceOfRandomness.nextInt(10) === 1)
                return Either.left("#" + this.r.nextInt());
            else
                return Either.right(this.makeValue(type));
        }), this.makeValue(type))(rs);
    }
}
