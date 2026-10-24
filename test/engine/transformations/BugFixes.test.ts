// Tests for Java bugs that the port fixes (each marked with a PORT-NOTE in the source).
import { describe, expect, test } from "vitest";
import type { ExpressionIdentifier } from "../../../src/engine/anns/Annotations.js";
import { Table } from "../../../src/engine/data/data/Table.js";
import { ColumnId } from "../../../src/engine/identifiers/id/ColumnId.js";
import { TableAndColumnRenames } from "../../../src/engine/identifiers/id/TableAndColumnRenames.js";
import { TableId } from "../../../src/engine/identifiers/id/TableId.js";
import { BooleanLiteral } from "../../../src/engine/expressions/transformations/expression/Expressions.js";
import { Check } from "../../../src/engine/transformations/transformations/Check.js";
import { Join } from "../../../src/engine/transformations/transformations/Join.js";
import { Pair } from "../../../src/engine/utility-adt/utility/adt/Pair.js";
import { DummyManager } from "../tests-functions/fixtures/DummyManager.js";

const tableId = (s: string): TableId => new TableId(s as ExpressionIdentifier);
const columnId = (s: string): ColumnId => new ColumnId(s as ExpressionIdentifier);

describe("Java bug fixes", () =>
{
    // Java's Join saved its column names without applying the renames, so renaming a column in
    // a source table broke the join.
    test("Join saves renamed columns", () =>
    {
        const join = new Join(DummyManager.make(), new Table.InitialLoadDetails(tableId("J"), null, null, null), tableId("A"), tableId("B"), false, [new Pair(columnId("x"), columnId("y"))]);
        const renames = new TableAndColumnRenames([
            [tableId("A"), new Pair<TableId | null, Iterable<readonly [ColumnId, ColumnId]>>(null, [[columnId("x"), columnId("x2")]])],
            [tableId("B"), new Pair<TableId | null, Iterable<readonly [ColumnId, ColumnId]>>(null, [[columnId("y"), columnId("y2")]])],
        ]);
        let saved = "";
        join.save(null, new class extends Table.BlankSaver
        {
            public override saveTable(tableSrc: string): void
            {
                saved = tableSrc;
            }
        }(), renames);
        expect(saved).toContain("\"x2\" EQUALS \"y2\"");
        expect(saved).not.toContain("\"x\"");
    });

    // Java's Join.suggestedName took both halves of the name from the primary column.
    test("Join suggested name", () =>
    {
        expect(Join.suggestedName([new Pair(columnId("Name"), columnId("Person"))]).getRaw()).toBe("Join Name to Person");
    });

    // Java's Check.transformationEquals compared only the expression, so Checks with different
    // check types or source tables were equal.
    test("Check equality", () =>
    {
        const mgr = DummyManager.make();
        const check = (src: string, checkType: Check.CheckType): Check => new Check(mgr, new Table.InitialLoadDetails(tableId("C"), null, null, null), tableId(src), checkType, new BooleanLiteral(true));
        expect(check("A", Check.CheckType.ALL_ROWS).equals(check("A", Check.CheckType.ALL_ROWS))).toBe(true);
        expect(check("A", Check.CheckType.ALL_ROWS).equals(check("A", Check.CheckType.NO_ROWS))).toBe(false);
        expect(check("A", Check.CheckType.ALL_ROWS).equals(check("B", Check.CheckType.ALL_ROWS))).toBe(false);
    });
});
