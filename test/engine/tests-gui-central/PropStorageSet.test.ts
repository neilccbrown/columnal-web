// Port of test.PropStorageSet (tests-gui-central): setting values in a column, among inserting and
// removing rows (sometimes reverted at once).
import { describe, expect } from "vitest";
import type { ExpressionIdentifier } from "../../../src/engine/anns/Annotations.js";
import type { Column } from "../../../src/engine/data/data/Column.js";
import { ColumnUtility } from "../../../src/engine/data/data/ColumnUtility.js";
import { EditableRecordSet } from "../../../src/engine/data/data/EditableRecordSet.js";
import { ColumnId } from "../../../src/engine/identifiers/id/ColumnId.js";
import type { JavaRandom } from "../../../src/engine/java/JavaRandom.js";
import type { DataType } from "../../../src/engine/types/data/datatype/DataType.js";
import type { DataTypeValue } from "../../../src/engine/types/data/datatype/DataTypeValue.js";
import { Either } from "../../../src/engine/utility-adt/utility/adt/Either.js";
import { InvalidImmediateValueException } from "../../../src/engine/utility-error/error/InvalidImmediateValueException.js";
import type { SimulationRunnable } from "../../../src/engine/utility-functional/utility/function/simulation/SimulationRunnable.js";
import type { Value } from "../../../src/engine/utility/utility/Value.js";
import { propertyTest } from "../../support/quickcheck.js";
import { TBasicUtil } from "../tests-basic/fixtures/data/TBasicUtil.js";
import { GenRandom } from "../tests-basic/fixtures/gen/GenRandom.js";
import { GenTypeAndValueGen } from "../tests-functions/fixtures/gen/type/GenTypeAndValueGen.js";

/**
 * Created by neil on 05/06/2017.
 */
describe("PropStorageSet", () =>
{
    propertyTest("testSet", [new GenTypeAndValueGen(), new GenRandom()], (typeAndValueGen: GenTypeAndValueGen.TypeAndValueGen, r: JavaRandom) =>
    {
        const recordSet = new EditableRecordSet([rs => ColumnUtility.makeImmediateColumn(typeAndValueGen.getType(), new ColumnId("C" as ExpressionIdentifier), [], typeAndValueGen.makeValue())(rs)], () => 0);
        const c: Column = recordSet.getColumns()[0]!;
        expect(c.getLength()).toBe(0);
        let length = 20;
        recordSet.insertRows(0, length);

        let vals = new Map<number, Either<string, Value>>();
        for (let i = 0; i < length; i++)
        {
            const defaultValue = c.getDefaultValue();
            vals.set(i, defaultValue === null ? Either.left("") : Either.right(defaultValue));
        }

        // Do many writes:
        for (let i = 0; i < 100; i++)
        {
            expect(c.getLength()).toBe(length);
            expect(recordSet.getLength()).toBe(length);

            const rowIndex = r.nextInt(length);
            // Sometimes, add rows and/or remove again:
            if (r.nextInt(4) === 1)
            {
                const willRevert = r.nextBoolean();
                let revert: SimulationRunnable | null;
                // Insert if small or 2/3 chance:
                if (length < 10 || r.nextInt(3) === 1)
                {
                    // Insert rows:
                    const count = r.nextInt(10);
                    if (!willRevert)
                    {
                        vals = mapKeys(vals, k => k < rowIndex ? k : k + count);
                        for (let newItem = 0; newItem < count; newItem++)
                        {
                            const defaultValue = c.getDefaultValue();
                            expect(defaultValue).not.toBeNull();
                            if (defaultValue !== null)
                                vals.set(rowIndex + newItem, Either.right(defaultValue));
                        }
                        length += count;
                    }
                    revert = recordSet.insertRows(rowIndex, count);
                }
                else
                {
                    // Remove rows:
                    const count = Math.min(length - rowIndex, r.nextInt(10));
                    revert = recordSet.removeRows(rowIndex, count);
                    if (!willRevert)
                    {
                        // Re map errors:
                        vals = mapKeys(vals, k => k >= rowIndex ? (k < rowIndex + count ? null : k - count) : k);
                        length -= count;
                    }
                }

                // Half the time, immediately revert
                if (willRevert)
                {
                    expect(revert).not.toBeNull();
                    revert?.();
                }
            }
            else
            {
                const value = typeAndValueGen.makeValue();
                const columnType = c.getType();
                const valueOrErr: Either<string, Value> = r.nextInt(5) === 1 ? Either.left("Err " + i) : Either.right(value);
                columnType.setCollapsed(rowIndex, valueOrErr);
                TBasicUtil.assertValueEitherEqual("Type: " + typeAndValueGen.getType().toString() + " index " + rowIndex, valueOrErr, collapseErr(c.getType(), rowIndex));
                vals.set(rowIndex, valueOrErr);
            }
            checkAll(typeAndValueGen.getType(), c, vals);
        }

        expect(c.getLength()).toBe(length);
    }, { trials: 100 });

    function checkAll(dataType: DataType, c: Column, vals: Map<number, Either<string, Value>>): void
    {
        for (const [key, value] of vals)
        {
            TBasicUtil.assertValueEitherEqual("Type: " + dataType.toString() + " index " + key, value, collapseErr(c.getType(), key));
        }
    }

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

    function mapKeys(prev: Map<number, Either<string, Value>>, mapper: (k: number) => number | null): Map<number, Either<string, Value>>
    {
        const r = new Map<number, Either<string, Value>>();
        prev.forEach((v, k) =>
        {
            const mapped = mapper(k);
            if (mapped !== null)
                r.set(mapped, v);
        });
        return r;
    }
});
