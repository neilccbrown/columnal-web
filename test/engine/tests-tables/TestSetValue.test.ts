// Port of test.TestSetValue (tests-tables).
import { describe } from "vitest";
import type { Column } from "../../../src/engine/data/data/Column.js";
import { ColumnUtility } from "../../../src/engine/data/data/ColumnUtility.js";
import { EditableRecordSet } from "../../../src/engine/data/data/EditableRecordSet.js";
import { ColumnId } from "../../../src/engine/identifiers/id/ColumnId.js";
import type { ExpressionIdentifier } from "../../../src/engine/anns/Annotations.js";
import type { JavaRandom } from "../../../src/engine/java/JavaRandom.js";
import type { DataTypeValue } from "../../../src/engine/types/data/datatype/DataTypeValue.js";
import { Either } from "../../../src/engine/utility-adt/utility/adt/Either.js";
import { Pair } from "../../../src/engine/utility-adt/utility/adt/Pair.js";
import { InvalidImmediateValueException } from "../../../src/engine/utility-error/error/InvalidImmediateValueException.js";
import type { Value } from "../../../src/engine/utility/utility/Value.js";
import { propertyTest } from "../../support/quickcheck.js";
import { TBasicUtil } from "../tests-basic/fixtures/data/TBasicUtil.js";
import { GenRandom } from "../tests-basic/fixtures/gen/GenRandom.js";
import { GenTypeAndValueGen } from "../tests-functions/fixtures/gen/type/GenTypeAndValueGen.js";

describe("TestSetValue", () =>
{
    propertyTest("propSetValue", [new GenTypeAndValueGen(), new GenRandom()], (typeAndValueGen: GenTypeAndValueGen.TypeAndValueGen, r: JavaRandom) =>
    {
        const length = 1 + r.nextInt(100);
        const originals: Either<string, Value>[] = [];
        const replacements: Either<string, Value>[] = [];
        for (let i = 0; i < length; i++)
        {
            originals.push(r.nextInt(8) === 1 ? Either.left("~R" + r.nextInt(100)) : Either.right(typeAndValueGen.makeValue()));
            replacements.push(r.nextInt(8) === 1 ? Either.left("#R" + r.nextInt(100)) : Either.right(typeAndValueGen.makeValue()));
        }
        const rs = new EditableRecordSet([ColumnUtility.makeImmediateColumn(typeAndValueGen.getType(), new ColumnId("C0" as ExpressionIdentifier), originals, typeAndValueGen.makeValue())], () => length);
        const col: Column = rs.getColumns()[0]!;

        const pendingReplacements: Pair<number, Either<string, Value>>[] = [];

        // Check initial store worked:
        for (let i = 0; i < length; i++)
        {
            TBasicUtil.assertValueEitherEqual("Value " + i, originals[i]!, collapseErr(col.getType(), i));
            pendingReplacements.push(new Pair(i, replacements[i]!));
        }

        // Do replacements:
        while (pendingReplacements.length !== 0)
        {
            const repl = TBasicUtil.removeRandom(r, pendingReplacements);
            col.getType().setCollapsed(repl.getFirst(), repl.getSecond());
        }

        // Check replacement worked:
        for (let i = 0; i < length; i++)
        {
            TBasicUtil.assertValueEitherEqual("Value " + i, replacements[i]!, collapseErr(col.getType(), i));
        }
    }, { trials: 200 });

    function collapseErr(type: DataTypeValue, rowIndex: number): Either<string, Value>
    {
        try
        {
            return Either.right(type.getCollapsed(rowIndex));
        }
        catch (e)
        {
            if (!(e instanceof InvalidImmediateValueException))
                throw e;
            return Either.left(e.getInvalid());
        }
    }
});
