// TableNameTextField's conversion: a table's name, which mustn't be another table's.
import { describe, expect, test } from "vitest";
import { TableId } from "../../../src/engine/identifiers/id/TableId.js";
import { TableNameTextField } from "../../../src/gui-logic/table-gui/gui/table/TableNameTextField.js";

describe("TableNameTextField", () =>
{
    const used = [new TableId("Foo"), new TableId("Bar")];

    test("a used name is an error; blank is allowed when asked", () =>
    {
        expect(TableNameTextField.converter(used, null, true)("Foo").getError()?.toPlain()).toContain("Foo");
        expect(TableNameTextField.converter(used, new TableId("Foo"), true)("Foo").getValue()?.getRaw()).toBe("Foo");
        expect(TableNameTextField.converter(used, null, true)("  ").getValue()?.getRaw()).toBe("");
        expect(TableNameTextField.converter(used, null, false)("").getError()).not.toBeNull();
    });

    // Java bug, fixed: Java quoted the name inside the message's own quotes (""Foo"")
    test("a name differing only in case is a warning, quoted once", () =>
    {
        const result = TableNameTextField.converter(used, null, true)("foo");
        expect(result.getValue()?.getRaw()).toBe("foo");
        expect(result.getWarnings()).toEqual(["Similar name to existing table: \"Foo\""]);
        const two = TableNameTextField.converter([...used, new TableId("FOO")], null, true)("foo");
        expect(two.getWarnings()).toEqual(["Similar name to existing table: \"Foo\", \"FOO\""]);
    });
});
