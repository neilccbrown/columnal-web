// Worker spike (Phase 7, throwaway): the messages between the GUI and the engine worker
// (engineWorker.ts).  The worker owns the TableManager; the GUI only sees tables' shapes, and the text
// of the cells it asks for.
import type { CellContent } from "../grid/cellContent.js";

export interface TableInfo
{
    readonly id: string;
    // Increases each time the table is replaced (when it or a table it depends on is edited):
    readonly version: number;
    readonly column: number;
    readonly row: number;
    readonly columnNames: readonly string[];
    readonly columnTypes: readonly string[];
    readonly editable: boolean;
    readonly error: string | null;
}

export type ToWorker =
    | { kind: "load", text: string }
    | { kind: "length", id: string, version: number }
    | { kind: "fetch", id: string, version: number, firstRow: number, lastRowExcl: number }
    | { kind: "edit", id: string, version: number, row: number, column: number, text: string, requestId: number };

export type FromWorker =
    | { kind: "tables", tables: readonly TableInfo[], ms: number, what: string }
    | { kind: "length", id: string, version: number, length: number, ms: number }
    // Rows of cells, firstRow onwards:
    | { kind: "cells", id: string, version: number, firstRow: number, cells: readonly (readonly CellContent[])[], ms: number }
    // A fetch the worker skipped, as newer ones for the same table were waiting:
    | { kind: "dropped", id: string, version: number, firstRow: number }
    | { kind: "edited", requestId: number, error: string | null, ms: number };
