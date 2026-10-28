// Worker spike (Phase 7, throwaway): the engine in a Web Worker.  It owns the TableManager, and
// answers the GUI's requests (messages.ts): loading a file, a table's length, rows of cells, and
// edits (which re-run the dependent tables, then send the new list of tables).
import type { CellPosition } from "../../../engine/data/data/CellPosition.js";
import type { Table } from "../../../engine/data/data/Table.js";
import { TableManager } from "../../../engine/data/data/TableManager.js";
import { DataSource } from "../../../engine/data/data/DataSources.js";
import { TransformationManager } from "../../../engine/transformations/transformations/TransformationManager.js";
import { Either } from "../../../engine/utility-adt/utility/adt/Either.js";
import { ParseProgress } from "../../../engine/utility/utility/ParseProgress.js";
import { TableDisplayUtility } from "../../../gui-logic/stf/gui/dtf/TableDisplayUtility.js";
import { fetchCell } from "../grid/cellContent.js";
import type { FromWorker, TableInfo, ToWorker } from "./messages.js";

const post = (m: FromWorker): void => postMessage(m);

const tableManager = new TableManager(TransformationManager.getInstance(), { getHandledContent: () => new Map() });
const tables = new Map<string, { table: Table, version: number }>();
let nextVersion = 1;

// Each table's position (Java: its TableDisplay, which Table asks for the position when saving; a
// re-run table takes the position of the table it replaces):
const positions = new Map<Table, CellPosition>();

function noteTable(table: Table): void
{
    tables.set(table.getId().getRaw(), { table, version: nextVersion++ });
    table.setDisplay({
        loadPosition: position => { positions.set(table, position); },
        getMostRecentPosition: () => positions.get(table)!,
        getBottomRightIncl: () => positions.get(table)!,
        promptForTransformationEdit: () => {},
        getTable: () => table,
    });
}
tableManager.addListener({
    removeTable: t => { tables.delete(t.getId().getRaw()); },
    addSource: noteTable,
    addTransformation: noteTable,
    addComment: () => {},
    removeComment: () => {},
});

function info(id: string, table: Table, version: number): TableInfo
{
    let columnNames: string[] = [];
    let columnTypes: string[] = [];
    let error: string | null = null;
    try
    {
        const columns = table.getData().getColumns();
        columnNames = columns.map(c => c.getName().getRaw());
        columnTypes = columns.map(c => { try { return c.getType().getType().toString(); } catch (e) { return String(e); } });
    }
    catch (e)
    {
        error = e instanceof Error ? e.message : String(e);
    }
    const pos = positions.get(table)!;
    return { id, version, column: pos.columnIndex, row: pos.rowIndex, columnNames, columnTypes, editable: table instanceof DataSource, error };
}

function sendTables(what: string, start: number): void
{
    post({ kind: "tables", tables: [...tables].map(([id, t]) => info(id, t.table, t.version)), ms: performance.now() - start, what });
}

function current(id: string, version: number): Table | null
{
    const t = tables.get(id);
    return t !== undefined && t.version === version ? t.table : null;
}

// Fetches are queued, and only the newest few for each table are done, so that scrolling quickly
// doesn't leave the worker computing rows that are no longer in view.
const MAX_FETCHES_PER_TABLE = 2;
let fetchQueue: Extract<ToWorker, { kind: "fetch" }>[] = [];
let fetchScheduled = false;

function runFetches(): void
{
    fetchScheduled = false;
    const queue = fetchQueue;
    fetchQueue = [];
    const counts = new Map<string, number>();
    // Newest first:
    for (let i = queue.length - 1; i >= 0; i--)
    {
        const f = queue[i]!;
        const n = counts.get(f.id) ?? 0;
        counts.set(f.id, n + 1);
        const table = current(f.id, f.version);
        if (table === null)
            continue;
        if (n >= MAX_FETCHES_PER_TABLE)
        {
            post({ kind: "dropped", id: f.id, version: f.version, firstRow: f.firstRow });
            continue;
        }
        const start = performance.now();
        const columns = table.getData().getColumns();
        const cells = [];
        for (let r = f.firstRow; r < f.lastRowExcl; r++)
            cells.push(columns.map(c => fetchCell(c, r)));
        post({ kind: "cells", id: f.id, version: f.version, firstRow: f.firstRow, cells, ms: performance.now() - start });
    }
}

onmessage = (e: MessageEvent<ToWorker>) =>
{
    const m = e.data;
    const start = performance.now();
    switch (m.kind)
    {
        case "load":
        {
            const loaded = tableManager.loadAll(m.text, () => {});
            for (const error of loaded.errors)
                console.error(error.toPlain());
            sendTables("load file (in worker)", start);
            break;
        }
        case "length":
        {
            const table = current(m.id, m.version);
            if (table !== null)
                post({ kind: "length", id: m.id, version: m.version, length: table.getData().getLength(), ms: performance.now() - start });
            break;
        }
        case "fetch":
            fetchQueue.push(m);
            if (!fetchScheduled)
            {
                fetchScheduled = true;
                setTimeout(runFetches, 0);
            }
            break;
        case "edit":
        {
            const table = current(m.id, m.version);
            if (table === null)
            {
                post({ kind: "edited", requestId: m.requestId, error: "The table has changed", ms: 0 });
                break;
            }
            const column = table.getData().getColumns()[m.column]!;
            const recogniser = TableDisplayUtility.recogniser(column.getType().getType(), true).recogniser;
            const result = recogniser.process(ParseProgress.fromStart(m.text), false).flatMap(s => s.requireEnd());
            if (result.isLeft())
            {
                post({ kind: "edited", requestId: m.requestId, error: result.getLeft("error").error.toPlain(), ms: performance.now() - start });
                break;
            }
            column.getType().setCollapsed(m.row, Either.right(result.getRight("value").value));
            post({ kind: "edited", requestId: m.requestId, error: null, ms: performance.now() - start });
            // The edited table's cells have changed (its version stays, so the GUI keeps its place):
            tables.set(m.id, { table, version: nextVersion++ });
            tableManager.reRun(table);
            sendTables("re-run after edit (in worker)", start);
            break;
        }
    }
};
