// Tests for Java bugs that the port fixes (each marked with a PORT-NOTE in the source).
import { describe, expect, test } from "vitest";
import type { ExpressionIdentifier } from "../../../src/engine/anns/Annotations.js";
import { Table } from "../../../src/engine/data/data/Table.js";
import { ColumnId } from "../../../src/engine/identifiers/id/ColumnId.js";
import { TableAndColumnRenames } from "../../../src/engine/identifiers/id/TableAndColumnRenames.js";
import { TableId } from "../../../src/engine/identifiers/id/TableId.js";
import { CellPosition } from "../../../src/engine/data/data/CellPosition.js";
import { ImmediateDataSource } from "../../../src/engine/data/data/DataSources.js";
import { EditableRecordSet } from "../../../src/engine/data/data/EditableRecordSet.js";
import { MemoryNumericColumn } from "../../../src/engine/data/data/MemoryNumericColumn.js";
import type { TableManager } from "../../../src/engine/data/data/TableManager.js";
import { BracketedStatus } from "../../../src/engine/expressions/transformations/expression/BracketedStatus.js";
import { BooleanLiteral, Expression } from "../../../src/engine/expressions/transformations/expression/Expressions.js";
import { FunctionList } from "../../../src/engine/functions/transformations/function/FunctionList.js";
import { Decimal, ZERO } from "../../../src/engine/java/JavaBigDecimal.js";
import { NumberInfo } from "../../../src/engine/types/data/datatype/NumberInfo.js";
import { Either } from "../../../src/engine/utility-adt/utility/adt/Either.js";
import { TFunctionUtil } from "../tests-functions/fixtures/functions/TFunctionUtil.js";
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

    // Java's Check.getColumnLookup filtered the references to a clicked column on their table, which is
    // always null (they are by name alone), so clicking a column in the grid put nothing into a Check's
    // expression.
    test("Check's lookup refers to a clicked column of its source", () =>
    {
        const mgr = withTables();
        const lookup = Check.getColumnLookup(mgr, tableId("T"), null, Check.CheckType.ALL_ROWS);
        const references = lookup.getPossibleColumnReferences(tableId("T"), columnId("A"));
        expect(references.map(r => r.getExpression().save(Expression.SaveDestination.TO_FILE, BracketedStatus.DONT_NEED_BRACKETS, TableAndColumnRenames.EMPTY))).toEqual(["column\\\\A"]);
        // Not another table's, nor a STANDALONE check's:
        expect(lookup.getPossibleColumnReferences(tableId("U"), columnId("A"))).toEqual([]);
        expect(Check.getColumnLookup(mgr, tableId("T"), null, Check.CheckType.STANDALONE).getPossibleColumnReferences(tableId("T"), columnId("A"))).toEqual([]);
    });

    // Java's Check.getColumnLookup said a column's table could be omitted only when the reference named
    // the source table (rather than when the column was found in it), so a reference by name alone was
    // resolved, and saved, with the source table's name; a Check whose source then changed still
    // referred to the old source.
    test("Check's references to its source's columns are by name alone", () =>
    {
        const mgr = withTables();
        const functions = FunctionList.getFunctionLookup(mgr.getUnitManager());
        const check = (src: string, expression: string): Check => new Check(mgr, new Table.InitialLoadDetails(tableId("C"), null, null, null), tableId(src), Check.CheckType.ALL_ROWS, TFunctionUtil.parseExpression(expression, mgr.getTypeManager(), functions));
        const saved = (c: Check): string => c.getCheckExpression().save(Expression.SaveDestination.TO_FILE, BracketedStatus.DONT_NEED_BRACKETS, TableAndColumnRenames.EMPTY);
        // (Checking it resolves its names)
        const onT = check("T", "A > 0");
        expect(onT.getResult()).toBe(true);
        expect(saved(onT)).toBe("column\\\\A > 0");
        // Saved, loaded, and its source changed to U (whose A are all negative):
        const onU = check("U", saved(onT));
        expect(onU.getResult()).toBe(false);
    });
});

// Tables T (A is 1 and 2) and U (A is -1 and -2)
function withTables(): TableManager
{
    const mgr = DummyManager.make();
    const data = (id: string, values: number[]): void =>
    {
        mgr.record(new ImmediateDataSource(mgr, new Table.InitialLoadDetails(tableId(id), null, CellPosition.ORIGIN, null), new EditableRecordSet([
            rs => new MemoryNumericColumn(rs, columnId("A"), NumberInfo.DEFAULT, values.map(v => Either.right(new Decimal(v))), ZERO),
        ], () => values.length)));
    };
    data("T", [1, 2]);
    data("U", [-1, -2]);
    return mgr;
}
