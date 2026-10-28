// Grid prototype (Phase 7, throwaway): what the grid's view (GridView, GridTable) needs from a table
// on the grid: ProtoTableDisplay reads the engine directly, WorkerTableDisplay asks the engine worker.
import type { GridArea } from "../../../gui-logic/stf/gui/grid/GridArea.js";
import type { VersionCounter } from "../../store/EngineStore.js";
import type { CellContent } from "./cellContent.js";

export interface GridTableModel extends GridArea
{
    readonly tableName: string;
    readonly columnNames: readonly string[];
    readonly columnTypes: readonly string[];
    readonly editable: boolean;
    readonly error: string | null;
    readonly currentKnownRows: number;
    readonly dataVersion: VersionCounter;
    readonly sizeVersion: VersionCounter;
    dataRowAt(absRow: number): number | null;
    getCell(row: number, column: number): CellContent;
    /** Stores typed text as the cell's value, giving the error if it isn't valid. */
    commitEdit(row: number, column: number, text: string): Promise<string | null>;
}

