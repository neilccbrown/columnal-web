// The GUI's copy of an expression editor's column lookup (src/gui/project/columnLookupCopy.ts) gives
// the same answers as the engine's MultipleTableLookup it copies, for each table being edited, source
// table and column being edited, over tables which overwrite and add columns, depend on each other,
// have a missing source, or have an erroneous column.
import { describe, expect, test } from "vitest";
import { ImmediateDataSource } from "../../../src/engine/data/data/DataSources.js";
import type { EditableColumn } from "../../../src/engine/data/data/EditableColumn.js";
import { EditableRecordSet } from "../../../src/engine/data/data/EditableRecordSet.js";
import { MemoryNumericColumn } from "../../../src/engine/data/data/MemoryNumericColumn.js";
import { MemoryStringColumn } from "../../../src/engine/data/data/MemoryStringColumn.js";
import type { RecordSet } from "../../../src/engine/data/data/RecordSet.js";
import { Table } from "../../../src/engine/data/data/Table.js";
import { IdentExpression, type Expression } from "../../../src/engine/expressions/transformations/expression/Expressions.js";
import { FunctionList } from "../../../src/engine/functions/transformations/function/FunctionList.js";
import { ColumnId } from "../../../src/engine/identifiers/id/ColumnId.js";
import { TableId } from "../../../src/engine/identifiers/id/TableId.js";
import { HashMap } from "../../../src/engine/java/HashMap.js";
import { Decimal, ZERO } from "../../../src/engine/java/JavaBigDecimal.js";
import { Calculate } from "../../../src/engine/transformations/transformations/Calculate.js";
import { MultipleTableLookup } from "../../../src/engine/transformations/transformations/MultipleTableLookup.js";
import { NumberInfo } from "../../../src/engine/types/data/datatype/NumberInfo.js";
import { Either } from "../../../src/engine/utility-adt/utility/adt/Either.js";
import { columnLookupInfo } from "../../../src/gui/engine/columnLookupInfo.js";
import { ColumnLookupCopy } from "../../../src/gui/project/columnLookupCopy.js";
import { DummyManager } from "../../engine/tests-functions/fixtures/DummyManager.js";
import { TFunctionUtil } from "../../engine/tests-functions/fixtures/functions/TFunctionUtil.js";

function makeTables(): DummyManager
{
    const mgr = new DummyManager();
    const functions = FunctionList.getFunctionLookup(mgr.getUnitManager());
    const calc = (id: string, src: string, columns: Record<string, string>): void =>
    {
        const expressions = new HashMap<ColumnId, Expression>();
        for (const [name, expression] of Object.entries(columns))
            expressions.set(new ColumnId(name), TFunctionUtil.parseExpression(expression, mgr.getTypeManager(), functions));
        mgr.record(new Calculate(mgr, new Table.InitialLoadDetails(new TableId(id), null, null, null), new TableId(src), expressions));
    };
    const columns: ((rs: RecordSet) => EditableColumn)[] = [
        rs => new MemoryNumericColumn(rs, new ColumnId("A"), new NumberInfo(mgr.getUnitManager().loadUse("m")), [Either.right(new Decimal(1))], ZERO),
        rs => new MemoryStringColumn(rs, new ColumnId("B"), [Either.right("Hi")], ""),
    ];
    mgr.record(new ImmediateDataSource(mgr, new Table.InitialLoadDetails(new TableId("T"), null, null, null), new EditableRecordSet(columns, () => 1)));
    // Overwrites A, adds D:
    calc("C1", "T", { A: "A * 2", D: "B" });
    calc("C2", "C1", { E: "D", A: "1{m}" });
    // A missing source, and an erroneous column:
    calc("Bad", "Missing", { X: "1" });
    calc("Err", "T", { Y: "zzz + 1" });
    return mgr;
}

// The outcome of a call, as something to compare
function outcome<T>(f: () => T, show: (t: T) => unknown): unknown
{
    try
    {
        return show(f());
    }
    catch (e)
    {
        return { threw: (e as Error).constructor.name };
    }
}

const TABLES = ["T", "C1", "C2", "Bad", "Err", "Missing"];
const COLUMNS = ["A", "B", "D", "E", "X", "Y", "Q"];

function answers(lookup: Expression.ColumnLookup, marker: unknown): unknown
{
    const target = IdentExpression.column(new ColumnId("A"));
    const fix = (namespace: string | null, ident: string): unknown => outcome(() => lookup.getFixForIdent!(namespace, [ident], target), f => f === null ? null : [f.getTitle().toPlain(), f.getActionOrReplacement().either<unknown>(a => a.doAction(null!, null) === marker, () => "replacement")]);
    return {
        availableColumns: outcome(() => lookup.getAvailableColumnReferences(), r => r.map(p => [p.getFirst()?.getRaw() ?? null, p.getSecond().getRaw()])),
        availableTables: outcome(() => lookup.getAvailableTableReferences(), r => r.map(t => t.getRaw())),
        tables: [null, ...TABLES].map(t => outcome(() => lookup.getTable(t === null ? null : new TableId(t)), f => f === null ? null : [f.getTableId().getRaw(), outcome(() => [...f.getColumnTypes()].map(([c, v]) => [c.getRaw(), v.getType().toString()]), x => x)])),
        columns: [null, ...TABLES].flatMap(t => COLUMNS.map(c => outcome(() => lookup.getColumn(IdentExpression.column(new ColumnId(c)), t === null ? null : new TableId(t), new ColumnId(c)),
            f => f === null ? null : [f.tableId.getRaw(), f.tableCanBeOmitted, f.dataTypeValue.getType().toString(), f.information?.getFirst().toPlain() ?? null, f.information?.getSecond()?.getTitle().toPlain() ?? null]))),
        possible: TABLES.flatMap(t => COLUMNS.map(c => outcome(() => lookup.getPossibleColumnReferences(new TableId(t), new ColumnId(c)), r => r.map(x => [x.getTableId().getRaw(), x.getColumnId().getRaw(), x.getExpression().toString()])))),
        fixes: COLUMNS.flatMap(c => [fix(null, c), fix("column", c), fix("table", c)]),
    };
}

describe("ColumnLookupCopy", () =>
{
    const mgr = makeTables();
    for (const us of [null, ...TABLES])
    {
        for (const src of [null, "T", "C1", "Missing"])
        {
            test("us " + us + ", source " + src, () =>
            {
                for (const editingColumn of [null, "A", "D", "Q"])
                {
                    const marker = {};
                    const editing: MultipleTableLookup.CalculationEditor | null = editingColumn === null ? null : {
                        getCurrentlyEditingColumn: () => new ColumnId(editingColumn),
                        moveExpressionToNewCalculation: () => marker as never,
                    };
                    const real = new MultipleTableLookup(us === null ? null : new TableId(us), mgr, src === null ? null : new TableId(src), editing);
                    // (Through JSON, as the engine sends it)
                    const info = JSON.parse(JSON.stringify(columnLookupInfo(mgr, us, src))) as ReturnType<typeof columnLookupInfo>;
                    const copy = new ColumnLookupCopy(info, mgr.getTypeManager(), editing);
                    expect(answers(copy, marker), "editing " + editingColumn).toEqual(answers(real, marker));
                }
            });
        }
    }

    test("the tables cover the cases", () =>
    {
        const info = columnLookupInfo(mgr, "C2", "C1");
        expect(info.tables.find(t => t.id === "Bad")?.columns).toBeNull();
        // (An erroneous column is an ErrorColumn, which has a type)
        expect(info.tables.find(t => t.id === "Err")?.columns?.find(c => c.name === "Y")?.type).not.toBeNull();
        expect(info.tables.find(t => t.id === "C1")?.columns?.find(c => c.name === "A")?.altered).toBe(2);
        // Some of the answers differ by table, column and editing column:
        const real = new MultipleTableLookup(new TableId("C1"), mgr, new TableId("T"), { getCurrentlyEditingColumn: () => new ColumnId("D"), moveExpressionToNewCalculation: () => null! });
        expect(real.getColumn(IdentExpression.column(new ColumnId("A")), null, new ColumnId("A"))?.information?.getFirst().toPlain()).toContain("re-calculated");
        expect(real.getFixForIdent("column", ["D"], IdentExpression.column(new ColumnId("D")))).not.toBeNull();
    });
});
