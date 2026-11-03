// The text of a transformation's hat (TableHat.content, Java: the TableHat constructor's visitor),
// and which parts of it link where.
import { describe, expect, test } from "vitest";
import type { ExpressionIdentifier } from "../../../src/engine/anns/Annotations.js";
import { CellPosition } from "../../../src/engine/data/data/CellPosition.js";
import { ImmediateDataSource } from "../../../src/engine/data/data/DataSources.js";
import { EditableRecordSet } from "../../../src/engine/data/data/EditableRecordSet.js";
import { Table } from "../../../src/engine/data/data/Table.js";
import type { TableManager } from "../../../src/engine/data/data/TableManager.js";
import { BooleanLiteral, type Expression, IdentExpression } from "../../../src/engine/expressions/transformations/expression/Expressions.js";
import { ColumnId } from "../../../src/engine/identifiers/id/ColumnId.js";
import { TableId } from "../../../src/engine/identifiers/id/TableId.js";
import { HashMap } from "../../../src/engine/java/HashMap.js";
import { Decimal } from "../../../src/engine/java/JavaBigDecimal.js";
import { Aggregate } from "../../../src/engine/transformations/transformations/Aggregate.js";
import { Calculate } from "../../../src/engine/transformations/transformations/Calculate.js";
import { Check } from "../../../src/engine/transformations/transformations/Check.js";
import { Concatenate } from "../../../src/engine/transformations/transformations/Concatenate.js";
import { Filter } from "../../../src/engine/transformations/transformations/Filter.js";
import { HideColumns } from "../../../src/engine/transformations/transformations/HideColumns.js";
import { ManualEdit } from "../../../src/engine/transformations/transformations/ManualEdit.js";
import { Sort } from "../../../src/engine/transformations/transformations/Sort.js";
import type { VisitableTransformation } from "../../../src/engine/transformations/transformations/VisitableTransformation.js";
import { DataType } from "../../../src/engine/types/data/datatype/DataType.js";
import { Pair } from "../../../src/engine/utility-adt/utility/adt/Pair.js";
import { TableHat } from "../../../src/gui-logic/app/gui/table/app/TableHat.js";
import { DummyManager } from "../../engine/tests-functions/fixtures/DummyManager.js";

const col = (name: string): ColumnId => new ColumnId(name as ExpressionIdentifier);
const at = new Table.InitialLoadDetails(null, null, CellPosition.ORIGIN, null);

function manager(): { mgr: TableManager, src: TableId }
{
    const mgr = new DummyManager();
    const src = new ImmediateDataSource(mgr, new Table.InitialLoadDetails(new TableId("Src"), null, CellPosition.ORIGIN, null), EditableRecordSet.newRecordSetSingleColumn(col("A"), DataType.NUMBER, new Decimal(0)));
    mgr.record(src);
    return { mgr, src: src.getId() };
}

function text(hat: TableHat.Content): string
{
    return hat.content.map(s => s.text).join("");
}

describe("TableHat", () =>
{
    test("each transformation's text, and its collapsed text", () =>
    {
        const { mgr, src } = manager();
        const cases: readonly [VisitableTransformation, string, string][] = [
            [new Filter(mgr, at, src, new BooleanLiteral(true)), "Filter Src, keeping rows where: true", "Filter"],
            [new Sort(mgr, at, src, []), "Sort Src by original order", "Sort"],
            [new Sort(mgr, at, src, [new Pair(col("A"), Sort.Direction.ASCENDING), new Pair(col("B"), Sort.Direction.DESCENDING)]), "Sort Src by A↑, B↓", "Sort"],
            [new Aggregate(mgr, at, src, [], [col("A")]), "Aggregate Src splitting by A", "Aggregate"],
            [new Aggregate(mgr, at, src, [], []), "Aggregate Src across whole table.", "Aggregate"],
            [new Calculate(mgr, at, src, new HashMap<ColumnId, Expression>()), "From Src calculate <none>", "Calculate"],
            [new Calculate(mgr, at, src, new HashMap<ColumnId, Expression>(["A", "B", "C", "D"].map(c => [col(c), IdentExpression.column(col("A"))]))), "From Src calculate A, B, C, ...", "Calculate"],
            [new HideColumns(mgr, at, src, []), "From Src, exclude columns: <none> (edit)", "Exclude columns"],
            [new HideColumns(mgr, at, src, [col("A")]), "From Src, exclude columns: A (edit)", "Exclude columns"],
            [new Concatenate(mgr, at, [], Concatenate.IncompleteColumnHandling.DEFAULT, true), "Concatenate no tables - with source column", "Concatenate"],
            [new Concatenate(mgr, at, [src, src], Concatenate.IncompleteColumnHandling.DEFAULT, false), "Concatenate Src, Src - without source column", "Concatenate"],
            [new Check(mgr, at, src, Check.CheckType.ALL_ROWS, new BooleanLiteral(true)), "Check Src that for all rows true", "Check"],
            [new Check(mgr, at, src, Check.CheckType.NO_ROWS, new BooleanLiteral(true)), "Check Src that no rows true", "Check"],
            [new ManualEdit(mgr, at, src, null, []), "Edit Src to change 0 entries identified by row number", "Edit"],
        ];
        for (const [table, expected, collapsed] of cases)
        {
            const hat = TableHat.content(mgr, table);
            expect(text(hat)).toBe(expected);
            expect(hat.collapsed).toBe(collapsed);
        }
    });

    test("the source links, and a missing source", () =>
    {
        const { mgr, src } = manager();
        const hat = TableHat.content(mgr, new Sort(mgr, at, src, []));
        const link = hat.content.find(s => s.text === "Src")!;
        expect(link.link).toEqual({ kind: "source", tableId: "Src", broken: false });
        expect(link.classes).toContain("styled-text-clickable");
        // The sort order is an edit link, styled as Java's:
        expect(hat.content.find(s => s.text === "original order")?.classes).toContain("edit-sort-by");

        const missing = TableHat.content(mgr, new Sort(mgr, at, new TableId("Gone"), []));
        const broken = missing.content.find(s => s.text === "Gone")!;
        expect(broken.link).toEqual({ kind: "source", tableId: "Gone", broken: true });
        expect(broken.classes).toContain("broken-link");
    });

    test("long expressions are cut short", () =>
    {
        const { mgr, src } = manager();
        const long = IdentExpression.column(col("A".repeat(80)));
        const hat = TableHat.content(mgr, new Filter(mgr, at, src, long));
        const expression = hat.content.filter(s => s.classes.includes("edit-expression-link")).map(s => s.text).join("");
        expect(expression.length).toBe(60);
        expect(expression.endsWith("…")).toBe(true);
    });
});
