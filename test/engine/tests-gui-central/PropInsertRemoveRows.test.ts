// Port of test.PropInsertRemoveRows (tests-gui-central): inserting and removing rows of an editable
// column (through its record set), and reverting it.
import { describe, expect } from "vitest";
import type { EditableColumn } from "../../../src/engine/data/data/EditableColumn.js";
import type { EditableRecordSet } from "../../../src/engine/data/data/EditableRecordSet.js";
import type { JavaRandom } from "../../../src/engine/java/JavaRandom.js";
import { DataTypeUtility } from "../../../src/engine/types/data/datatype/DataTypeUtility.js";
import { Utility } from "../../../src/engine/utility/utility/Utility.js";
import type { Value } from "../../../src/engine/utility/utility/Value.js";
import { propertyTest } from "../../support/quickcheck.js";
import { GenRandom } from "../tests-basic/fixtures/gen/GenRandom.js";
import { GenEditableColumn } from "./gen/GenEditableColumn.js";

/**
 * Created by neil on 30/05/2017.
 */
describe("PropInsertRemoveRows", () =>
{
    propertyTest("insertRows", [new GenEditableColumn(), new GenRandom()], (column: EditableColumn, r: JavaRandom) =>
    {
        const prevValues: Value[] = [];
        for (let i = 0; column.indexValid(i); i++)
        {
            prevValues.push(column.getType().getCollapsed(i));
        }

        const insertAtIndex = r.nextInt(column.getLength() + 1);
        const insertCount = r.nextInt(1000);

        // Do it via RecordSet to get the validIndex function updated:
        const revert = (column.getRecordSet() as EditableRecordSet).insertRows(insertAtIndex, insertCount);

        for (let i = 0; i < insertAtIndex; i++)
        {
            expect(column.indexValid(i)).toBe(true);
            expect(Utility.compareValues(prevValues[i]!, column.getType().getCollapsed(i)), "Comparing values at index " + i + "\n  " + DataTypeUtility._test_valueToString(prevValues[i]!) + " vs\n  " + DataTypeUtility._test_valueToString(column.getType().getCollapsed(i))).toBe(0);
        }
        for (let i = insertAtIndex; i < insertAtIndex + insertCount; i++)
        {
            expect(column.indexValid(i), "Valid index: " + i + " insertAt: " + insertAtIndex + " count " + insertCount).toBe(true);
            // Don't check here what they are, just that they are all same:
            expect(Utility.compareValues(column.getType().getCollapsed(insertAtIndex), column.getType().getCollapsed(i)), "Comparing " + column.getType().toString() + ": " + i + " insertAt: " + insertAtIndex + " count " + insertCount).toBe(0);
        }
        for (let i = insertAtIndex; i < prevValues.length; i++)
        {
            expect(column.indexValid(i + insertCount), "Valid index " + i + " with insertAtIndex " + insertAtIndex + " and count " + insertCount + " and prev " + prevValues.length).toBe(true);
            expect(Utility.compareValues(prevValues[i]!, column.getType().getCollapsed(i + insertCount)), "Comparing " + column.getType().toString() + " index " + i + " with insertAtIndex " + insertAtIndex + " and count " + insertCount).toBe(0);
        }
        expect(column.indexValid(prevValues.length + insertCount)).toBe(false);

        // Test revert:
        expect(revert).not.toBeNull();
        revert!();
        expect(column.getLength(), "Type: " + column.getType().toString()).toBe(prevValues.length);
        expect(column.indexValid(prevValues.length - 1)).toBe(true);
        expect(column.indexValid(prevValues.length)).toBe(false);

        for (let i = 0; i < prevValues.length; i++)
        {
            expect(column.indexValid(i)).toBe(true);
            expect(Utility.compareValues(prevValues[i]!, column.getType().getCollapsed(i)), "Comparing values at index " + i + " inserted at " + insertAtIndex).toBe(0);
        }
    }, { trials: 100 });

    propertyTest("removeRows", [new GenEditableColumn(), new GenRandom()], (column: EditableColumn, r: JavaRandom) =>
    {
        if (column.getLength() === 0)
            return; // Can't remove any rows.  Happens rarely.

        const prevValues: Value[] = [];
        for (let i = 0; column.indexValid(i); i++)
        {
            prevValues.push(column.getType().getCollapsed(i));
        }

        const removeAtIndex = r.nextInt(column.getLength());
        const removeCount = r.nextInt(column.getLength() - removeAtIndex);

        // Do it via RecordSet to get the validIndex function updated:
        const revert = (column.getRecordSet() as EditableRecordSet).removeRows(removeAtIndex, removeCount);

        for (let i = 0; i < removeAtIndex; i++)
        {
            expect(column.indexValid(i)).toBe(true);
            expect(Utility.compareValues(prevValues[i]!, column.getType().getCollapsed(i)), "Comparing values at index " + i).toBe(0);
        }
        for (let i = removeAtIndex; i < prevValues.length - removeCount; i++)
        {
            expect(column.indexValid(i), "Valid index " + i + " with removeAtIndex " + removeAtIndex + " and count " + removeCount + " and prev " + prevValues.length).toBe(true);
            expect(Utility.compareValues(prevValues[i + removeCount]!, column.getType().getCollapsed(i)), "Comparing " + column.getType().toString() + " index " + i + " with removeAtIndex " + removeAtIndex + " and count " + removeCount).toBe(0);
        }
        expect(column.indexValid(prevValues.length - removeCount)).toBe(false);

        // Test revert:
        expect(revert).not.toBeNull();
        revert!();
        expect(column.getLength(), "Type: " + column.getType().toString()).toBe(prevValues.length);
        expect(column.indexValid(prevValues.length - 1)).toBe(true);
        expect(column.indexValid(prevValues.length)).toBe(false);

        for (let i = 0; i < prevValues.length; i++)
        {
            expect(column.indexValid(i)).toBe(true);
            expect(Utility.compareValues(prevValues[i]!, column.getType().getCollapsed(i)), "Comparing values at index " + i + " removed at " + removeAtIndex).toBe(0);
        }
    }, { trials: 100 });
});
