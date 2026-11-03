// Port of test.gui.trait.ClickOnTableHeaderTrait (tests-gui-base): showing a table's header menu.
import type { CellPosition } from "../../../src/engine/data/data/CellPosition.js";
import { RectangleBounds } from "../../../src/gui-logic/stf/gui/grid/RectangleBounds.js";
import type { VirtualGrid } from "../../../src/gui-logic/stf/gui/grid/VirtualGrid.js";
import { clickAt, withItemInBounds } from "./clickTableLocation.js";
import { keyboardMoveTo } from "./scrollTo.js";

/** Moves to the table's header (at its position), then right-clicks the header near its left edge. */
export async function triggerTableHeaderContextMenu(virtualGrid: VirtualGrid, position: CellPosition): Promise<void>
{
    await keyboardMoveTo(virtualGrid, position);
    const tableNameField = withItemInBounds(".table-display-table-title .table-name-text-field", virtualGrid, new RectangleBounds(position, position)).element;
    const tableHeader = tableNameField.closest(".table-display-table-title")!;
    const bounds = tableHeader.getBoundingClientRect();
    await clickAt(tableHeader, { x: bounds.left + 1, y: bounds.top + 2 }, "right");
}
