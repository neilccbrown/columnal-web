// Grid prototype (Phase 7, throwaway): what GridPrototype.vue hands its onReady callback, so tests
// can reach the engine and the grid.
import type { TableManager } from "../../../engine/data/data/TableManager.js";
import type { VirtualGrid } from "../../../gui-logic/stf/gui/grid/VirtualGrid.js";
import type { ProtoTableDisplay } from "./ProtoTableDisplay.js";

export interface GridPrototypeApp
{
    readonly tableManager: TableManager;
    readonly grid: VirtualGrid;
    displays(): readonly ProtoTableDisplay[];
}
