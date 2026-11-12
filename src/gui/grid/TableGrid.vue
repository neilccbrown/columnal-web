<script setup lang="ts">
// The table canvas (Java: VirtualGrid's node, with VirtualGridLineSupplier's grid lines), on one
// native scroll container (docs/gui-spec/grid.md).  The ported VirtualGrid (src/gui-logic) holds the
// layout, column widths and selection, and moves the selection with the keyboard; this shows it and
// its tables, handles the keyboard and mouse, and is its Display.  Tables are moved by dragging their
// name row (Java: HeadedDisplay's MoveDestination overlays, with VirtualGrid's nudge scrolling).  A
// cell is edited in a DocumentTextField over it (Java: DataCellSupplier's cell, expanded while focused).
import { computed, nextTick, onBeforeUnmount, onMounted, provide, shallowRef, useTemplateRef, watch } from "vue";
import { CellPosition } from "../../engine/data/data/CellPosition.js";
import { Pair } from "../../engine/utility-adt/utility/adt/Pair.js";
import type { CellSelection } from "../../gui-logic/stf/gui/grid/CellSelection.js";
import { VirtualGrid } from "../../gui-logic/stf/gui/grid/VirtualGrid.js";
import { RectangleBounds } from "../../gui-logic/stf/gui/grid/RectangleBounds.js";
import { EntireTableSelection } from "../../gui-logic/table-gui/gui/table/EntireTableSelection.js";
import { isMac, isMenuShortcut } from "../shortcuts.js";
import { VersionCounter } from "../store/EngineStore.js";
import type { Document } from "../../gui-logic/stf/gui/dtf/Document.js";
import DocumentTextField from "../components/DocumentTextField.vue";
import { showAlert } from "../alerts.js";
import { t } from "../i18n.js";
import { useTableActions } from "./tableActions.js";
import { CellEditDocument, ReadOnlyCellDocument } from "./CellEditDocument.js";
import ContextMenu from "../components/menus/ContextMenu.vue";
import type { MenuEntry } from "../components/menus/menus.js";
import CommentView from "./CommentView.vue";
import type { GridCommentDisplay } from "./GridCommentDisplay.js";
import GridTable from "./GridTable.vue";
import { GridTableDisplay } from "./GridTableDisplay.js";
import { columnHeaderMenu, rowLabelMenu, tableHeaderMenu } from "./tableMenus.js";
import { arrowPath, HIGHLIGHT, type GridHighlight } from "./highlights.js";
import type { Picked, PickingMode } from "./picking.js";
import { VIEWPORT } from "./viewport.js";

const props = defineProps<{
    grid: VirtualGrid,
    displays: readonly GridTableDisplay[],
    comments?: readonly GridCommentDisplay[],
    // While a dialog picks a table or column from the grid (Java: the window's picking mode):
    picking?: PickingMode | null,
}>();

const ROW = VirtualGrid.rowHeight;
const layout = new VersionCounter();
const scroller = useTemplateRef<HTMLDivElement>("scroller");
const scrollTop = shallowRef(0);
const scrollLeft = shallowRef(0);
const viewWidth = shallowRef(0);
const viewHeight = shallowRef(0);
provide(VIEWPORT, { scrollTop, scrollLeft, viewWidth, viewHeight });
// Java: TableHighlights, the grid's highlighted areas
const highlight = shallowRef<GridHighlight | null>(null);
provide(HIGHLIGHT, highlight);
const highlightShapes = computed(() =>
{
    layout.track();
    const h = highlight.value;
    if (h === null)
        return [];
    return h.bounds.map((b, i) =>
    {
        const left = colLeft(b.topLeftIncl.columnIndex);
        const top = b.topLeftIncl.rowIndex * ROW;
        const width = colLeft(b.bottomRightIncl.columnIndex + 1) - left;
        const height = (b.bottomRightIncl.rowIndex - b.topLeftIncl.rowIndex + 1) * ROW;
        const centre = { x: left + width / 2, y: top + height / 2 };
        const to = h.arrowTo[i] ?? null;
        return { rect: { left: left + "px", top: top + "px", width: width + "px", height: height + "px" }, centre, path: to === null ? null : arrowPath(centre, to) };
    });
});
// How many times a table's window has changed (Java's tests counted layouts):
let windowChanges = 0;

function colLeft(column: number): number
{
    return props.grid.sumColumnWidths(0, column);
}

// The column containing x (beyond the grid's columns, they have the default width):
function colAt(x: number): number
{
    let lo = 0;
    let hi = Math.max(1, props.grid.getCurrentColumns());
    if (x >= colLeft(hi))
        return hi + Math.floor((x - colLeft(hi)) / VirtualGrid.DEFAULT_COLUMN_WIDTH);
    while (hi - lo > 1)
    {
        const mid = (lo + hi) >> 1;
        if (colLeft(mid) <= x)
            lo = mid;
        else
            hi = mid;
    }
    return lo;
}

const canvasSize = computed(() =>
{
    layout.track();
    return {
        width: Math.max(colLeft(props.grid.getCurrentColumns()), viewWidth.value + scrollLeft.value),
        height: Math.max((props.grid.getCurrentKnownLastRowIncl() + 1) * ROW, viewHeight.value + scrollTop.value),
    };
});

// The vertical grid lines in view (Java: VirtualGridLineSupplier's column dividers), on the right
// edge of each column; the horizontal ones are the canvas's background:
const verticalLines = computed(() =>
{
    layout.track();
    const xs: number[] = [];
    for (let c = colAt(scrollLeft.value); c <= colAt(scrollLeft.value + viewWidth.value); c++)
        xs.push(colLeft(c + 1) - 1);
    return xs;
});

// --- The selection -----------------------------------------------------------------------------

const selectionVersion = new VersionCounter();
props.grid.addSelectionListener(() =>
{
    selectionVersion.bump();
    return new Pair(VirtualGrid.ListenerOutcome.KEEP, null);
});
const selection = computed<CellSelection | null>(() =>
{
    selectionVersion.track();
    return props.grid.getSelection();
});

// Java: the selection's RectangleOverlayItem (.virt-grid-selection-overlay)
const selectionRect = computed(() =>
{
    layout.track();
    const sel = selection.value;
    if (sel === null)
        return null;
    const r = sel.getSelectionDisplayRectangle();
    const left = colLeft(r.topLeftIncl.columnIndex);
    return {
        left: left + "px",
        top: r.topLeftIncl.rowIndex * ROW + "px",
        width: colLeft(r.bottomRightIncl.columnIndex + 1) - left + "px",
        height: (r.bottomRightIncl.rowIndex - r.topLeftIncl.rowIndex + 1) * ROW + "px",
    };
});

// Java: VirtualGrid.CreateTableButtonSupplier: a "New…" button in the selected empty cell, which offers to
// make a table there (if the grid has a manager)
const createTableButton = computed(() =>
{
    layout.track();
    const sel = selection.value;
    if (!(sel instanceof VirtualGrid.EmptyCellSelection) || props.grid._getManager() === null)
        return null;
    const pos = sel.getActivateTarget();
    const left = colLeft(pos.columnIndex);
    return {
        position: pos,
        style: { left: left + "px", top: pos.rowIndex * ROW + "px", minWidth: colLeft(pos.columnIndex + 1) - left + "px", height: ROW + "px" },
    };
});

const tableActions = useTableActions();

// Java: VirtualGridManager.createTable, given a point (the mouse's, or the cell's centre), in client
// coordinates, for the dialogs to centre on
function createTable(position: CellPosition, point: { x: number, y: number }): void
{
    props.grid._getManager()?.createTable(position, point, props.grid);
}

function cellCentre(position: CellPosition): { x: number, y: number }
{
    const box = scroller.value!.getBoundingClientRect();
    const left = colLeft(position.columnIndex);
    return {
        x: box.left - scroller.value!.scrollLeft + (left + colLeft(position.columnIndex + 1)) / 2,
        y: box.top - scroller.value!.scrollTop + (position.rowIndex + 0.5) * ROW,
    };
}

// Java: each node supplier's keyboardActivate: the create-table button, a table's arrows, or a cell
function keyboardActivate(position: CellPosition): void
{
    if (createTableButton.value?.position.equals(position) === true)
    {
        createTable(position, cellCentre(position));
        return;
    }
    // Java: a comment's floating item's keyboardActivate, which focuses its field
    for (const c of props.comments ?? [])
    {
        if (c.contains(position))
        {
            c.requestFocus();
            return;
        }
    }
    for (const d of props.displays)
    {
        if (!d.contains(position))
            continue;
        const tablePos = d.getPosition();
        const column = position.columnIndex - tablePos.columnIndex;
        // Java: TableHeaderItem.keyboardActivate, the table's menu, below the header
        if (position.rowIndex === tablePos.rowIndex)
        {
            const r = tableBox(d);
            openMenuAt(tableHeaderMenu(d), { x: r.left, y: r.top + ROW });
            return;
        }
        // Java: ColumnNameItem's and ColumnTypeItem's keyboardActivate: edit the column's name or type
        if ((position.rowIndex === tablePos.rowIndex + 1 || position.rowIndex === tablePos.rowIndex + 2) && column < d.info.columnNames.length)
        {
            if (d.info.columnHeaderEditable[column] === true)
                tableActions?.editColumn(d, d.info.columnNames[column]!, position.rowIndex === tablePos.rowIndex + 1 ? "name" : "type");
            return;
        }
    }
    for (const d of props.displays)
    {
        const arrow = d.arrowAt(position);
        if (arrow === "down")
        {
            d.appendRow();
            return;
        }
        if (arrow === "right")
        {
            tableActions?.addColumn(d, null);
            return;
        }
    }
    void startEditing(null, position, null);
}

// --- Context menus (Java: each item's own ContextMenu) ------------------------------------------
// One context menu for the grid: its items are worked out when it is asked for, from what was clicked.

let menuItems: readonly MenuEntry[] = [];
let forcedMenu: readonly MenuEntry[] | null = null;

// The client rectangle of the table's top left cell:
function tableBox(d: GridTableDisplay): { left: number, top: number }
{
    const box = scroller.value!.getBoundingClientRect();
    const pos = d.getPosition();
    return { left: box.left - scroller.value!.scrollLeft + colLeft(pos.columnIndex), top: box.top - scroller.value!.scrollTop + pos.rowIndex * ROW };
}

// What the context menu shows for a click on the target (none: the browser's own menu)
function menuFor(target: Element, e: MouseEvent): readonly MenuEntry[]
{
    if (target.closest("input, textarea, .cell-editor") !== null)
        return [];
    const display = displayOf(target);
    if (display === null)
        return [];
    // Java: HeadedDisplay's table header, which selects the entire table
    if (target.closest(".table-title") !== null)
    {
        props.grid.select(new EntireTableSelection(display, nearestTopLeft(canvasPoint(e)).columnIndex));
        return tableHeaderMenu(display);
    }
    const header = target.closest<HTMLElement>(".column-name, .column-type");
    if (header !== null)
        return columnHeaderMenu(display, Number(header.dataset.col));
    const rowLabel = target.closest<HTMLElement>(".row-label");
    if (rowLabel !== null)
        return rowLabelMenu(display, Number(rowLabel.dataset.row));
    return [];
}

function onContextMenu(e: MouseEvent): void
{
    menuItems = forcedMenu ?? (e.target instanceof Element ? menuFor(e.target, e) : []);
    forcedMenu = null;
    // (Then the context menu doesn't see it)
    if (menuItems.length === 0)
        e.stopPropagation();
}

// Opens the context menu at a client point (Java: ContextMenu.show)
function openMenuAt(items: readonly MenuEntry[], point: { x: number, y: number }): void
{
    forcedMenu = items;
    scroller.value?.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, cancelable: true, clientX: point.x, clientY: point.y }));
}

// Java: HeadedDisplay.selectionChanged, the table header's table-selected style
function tableSelected(display: GridTableDisplay): boolean
{
    const sel = selection.value;
    return sel instanceof EntireTableSelection && sel.includes(display);
}

// --- The keyboard (Java: VirtualGrid.Container's InputMap) --------------------------------------

function onKeyDown(e: KeyboardEvent): void
{
    if (e.target !== scroller.value)
        return;
    const grid = props.grid;
    const shortcut = isMac() ? e.metaKey : e.ctrlKey;
    switch (e.key)
    {
        case "Home":
            if (shortcut)
                grid.ctrlHome();
            else
                grid.home(e.shiftKey);
            break;
        case "End": grid.end(e.shiftKey); break;
        case "ArrowUp": grid.move(e.shiftKey, -1, 0); break;
        case "ArrowDown": grid.move(e.shiftKey, 1, 0); break;
        case "ArrowLeft": grid.move(e.shiftKey, 0, -1); break;
        case "ArrowRight": grid.move(e.shiftKey, 0, 1); break;
        case "PageUp": grid.move(e.shiftKey, -grid.calcPageHeight(), 0); break;
        case "PageDown": grid.move(e.shiftKey, grid.calcPageHeight(), 0); break;
        case "F11": grid.copySelection(); break;
        case "Enter": case " ": grid.activateSelection(); break;
        case "Delete": case "Backspace": grid.deleteSelection(); break;
        default:
            if (shortcut && e.key.toLowerCase() === "c" && !e.altKey)
                grid.copySelection();
            else if (shortcut && e.key.toLowerCase() === "v" && !e.altKey)
                grid.pasteIntoSelection();
            // A character typed (Java: keyTyped, without the shortcut key) starts editing, unless the
            // key is a menu's shortcut (e.g. Alt+Shift+N, which types a character on macOS):
            else if ([...e.key].length === 1 && !e.ctrlKey && !e.metaKey && !isMenuShortcut(e))
                grid.typed(e.key);
            else
                return;
    }
    e.preventDefault();
}

// --- The mouse ---------------------------------------------------------------------------------

// The canvas position of a client point:
function canvasPoint(e: MouseEvent): { x: number, y: number }
{
    const rect = scroller.value!.firstElementChild!.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
}

function cellAt(p: { x: number, y: number }): CellPosition
{
    return new CellPosition(CellPosition.row(Math.floor(p.y / ROW)), CellPosition.col(colAt(p.x)));
}

// Java: VisibleBounds.getNearestTopLeftToScreenPos(p, CENTER, CENTER), the nearest cell corner
function nearestTopLeft(p: { x: number, y: number }): CellPosition
{
    const column = colAt(p.x);
    const fraction = (p.x - colLeft(column)) / props.grid.getColumnWidth(column);
    return new CellPosition(CellPosition.row(Math.max(0, Math.round(p.y / ROW))), CellPosition.col(fraction < 0.5 ? column : column + 1));
}

function displayOf(target: EventTarget | null): GridTableDisplay | null
{
    const id = target instanceof Element ? target.closest<HTMLElement>("[data-table]")?.dataset.table : undefined;
    return props.displays.find(d => d.info.id === id) ?? null;
}

let downAt: { x: number, y: number } | null = null;

function onPointerDown(e: PointerEvent): void
{
    downAt = { x: e.clientX, y: e.clientY };
    if (e.button === 0 && e.target instanceof Element && e.target.closest(".table-title") !== null && e.target.closest("input") === null)
        startTableDrag(e);
}

/**
 * Java: VirtualGrid.Container's click handler.  A click (still since the press) on a cell selects it
 * (with Shift, extends the selection to it), or on an empty cell selects that; a click on the cell
 * that is selected by itself, or a double click, starts editing it.  Items that handle their own
 * clicks (the table name, column names and types, row labels) are left to do so.
 */
function onClick(e: MouseEvent): void
{
    const still = downAt !== null && Math.abs(downAt.x - e.clientX) < 3 && Math.abs(downAt.y - e.clientY) < 3;
    if (e.button !== 0 || !still || !(e.target instanceof Element) || e.target.closest(".cell-editor") !== null)
        return;
    const p = canvasPoint(e);
    // (The table name field, a hat, and a comment, handle their own clicks)
    if (e.target.closest(".table-name-text-field, .table-hat, .grid-comment") !== null)
        return;
    // Java: HeadedDisplay's table header selects the entire table:
    if (e.target.closest(".table-title") !== null)
    {
        const display = displayOf(e.target);
        if (display !== null)
            props.grid.select(new EntireTableSelection(display, nearestTopLeft(p).columnIndex));
        return;
    }
    if (e.target.closest(".column-name, .column-type, .row-labels") !== null)
        return;
    const pos = cellAt(p);
    const curSel = props.grid.getSelection();
    if ((curSel !== null && curSel.isExactly(pos)) || e.detail === 2)
    {
        startEditing({ x: e.clientX, y: e.clientY }, pos, null);
        return;
    }
    for (const gridArea of props.grid.getGridAreas())
    {
        const current = props.grid.getSelection();
        const newSelection = current !== null && e.shiftKey ? current.extendTo(pos) : gridArea.getSelectionForSingleCell(pos);
        if (newSelection !== null)
        {
            props.grid.select(newSelection);
            return;
        }
    }
    if (pos.columnIndex > 0 && pos.rowIndex > 0 && !e.shiftKey)
    {
        // Belongs to no-one; we must handle it:
        props.grid.select(new VirtualGrid.EmptyCellSelection(props.grid, pos));
        scroller.value?.focus({ preventScroll: true });
    }
}

// Java: the container losing the focus clears the selection (but not to its context menu, which in
// Java was a popup that left the window focused)
function onFocusOut(e: FocusEvent): void
{
    const to = e.relatedTarget as Node | null;
    if (!scroller.value?.contains(to) && !(to instanceof Element && to.closest(".context-menu") !== null))
        props.grid.focusLost();
}

// --- Hover text (Java: VirtualGrid's HoverTip, with DocumentTextField.getHoverText) ---------------
// After the pointer has been over a data cell whose text is cut off for a second, its whole text shows
// below the cell's bottom right.

const hoverTip = shallowRef<{ readonly text: string, readonly left: number, readonly top: number } | null>(null);
let hoverKey: string | null = null;
let hoverTimer: ReturnType<typeof setTimeout> | null = null;

function clearHover(): void
{
    if (hoverTimer !== null)
        clearTimeout(hoverTimer);
    hoverTimer = null;
    hoverKey = null;
    hoverTip.value = null;
}

function onPointerMove(e: PointerEvent): void
{
    const cell = e.target instanceof Element ? e.target.closest<HTMLElement>(".table .cell.table-data-cell") : null;
    const display = cell === null ? null : displayOf(cell);
    const row = cell?.closest<HTMLElement>(".row")?.dataset.row;
    const content = display === null || row === undefined ? null : display.getCell(Number(row), Number(cell!.dataset.col));
    // Java: the text's width (for a number, the whole number's) is more than 3 px wider than the cell
    const shown = cell?.textContent ?? "";
    if (cell === null || display === null || content === null || !(cell.scrollWidth > cell.clientWidth + 3 || (shown.includes("…") && !content.text.includes("…"))))
    {
        clearHover();
        return;
    }
    const key = display.info.id + " " + row + " " + cell.dataset.col;
    if (key === hoverKey)
        return;
    clearHover();
    hoverKey = key;
    const canvas = scroller.value!.querySelector(".grid-canvas")!.getBoundingClientRect();
    const box = cell.getBoundingClientRect();
    hoverTimer = setTimeout(() =>
    {
        hoverTimer = null;
        hoverTip.value = { text: content.text, left: box.right - canvas.left - 10, top: box.bottom - canvas.top + 5 };
    }, 1000);
}

// --- Moving a table by dragging its name row ---------------------------------------------------

interface TableDrag
{
    readonly display: GridTableDisplay;
    // The pointer's offset from the table's top left:
    readonly offset: { x: number, y: number };
    readonly width: number;
    readonly height: number;
    // Where the pointer is (canvas), once dragging has started:
    pointer: { x: number, y: number } | null;
}
const tableDrag = shallowRef<TableDrag | null>(null);
let nudge: { x: number, y: number } = { x: 0, y: 0 };
let nudgeTimer: ReturnType<typeof setInterval> | null = null;

// The drag's top left, and its snapped destination (Java: MoveDestinationFree and MoveDestinationSnapped):
const dragOverlays = computed(() =>
{
    layout.track();
    const drag = tableDrag.value;
    if (drag === null || drag.pointer === null)
        return null;
    const topLeft = { x: drag.pointer.x - drag.offset.x, y: drag.pointer.y - drag.offset.y };
    const near = nearestTopLeft(topLeft);
    const dest = new CellPosition(CellPosition.row(Math.max(1, near.rowIndex)), CellPosition.col(Math.max(1, near.columnIndex)));
    const display = drag.display;
    const bottomRight = dest.offsetByRowCols(display.getBottomRightIncl().rowIndex - display.getPosition().rowIndex, display.getBottomRightIncl().columnIndex - display.getPosition().columnIndex);
    const left = colLeft(dest.columnIndex);
    return {
        dest,
        snapped: { left: left + "px", top: dest.rowIndex * ROW + "px", width: colLeft(bottomRight.columnIndex + 1) - left + "px", height: (bottomRight.rowIndex - dest.rowIndex + 1) * ROW + "px" },
        free: { left: topLeft.x + "px", top: topLeft.y + "px", width: drag.width + "px", height: drag.height + "px" },
    };
});

function startTableDrag(e: PointerEvent): void
{
    const display = displayOf(e.target);
    const tableElement = e.target instanceof Element ? e.target.closest<HTMLElement>(".table") : null;
    if (display === null || tableElement === null)
        return;
    const p = canvasPoint(e);
    const box = tableElement.getBoundingClientRect();
    const pos = display.getPosition();
    tableDrag.value = {
        display,
        offset: { x: p.x - colLeft(pos.columnIndex), y: p.y - pos.rowIndex * ROW },
        width: box.width,
        height: (display.getBottomRightIncl().rowIndex - pos.rowIndex + 1) * ROW,
        pointer: null,
    };
    const target = scroller.value!;
    target.setPointerCapture(e.pointerId);
    const start = { x: e.clientX, y: e.clientY };
    const move = (ev: PointerEvent): void =>
    {
        const drag = tableDrag.value;
        if (drag === null)
            return;
        // (JavaFX's drag detection: a few pixels' movement)
        if (drag.pointer === null && Math.abs(ev.clientX - start.x) < 5 && Math.abs(ev.clientY - start.y) < 5)
            return;
        tableDrag.value = { ...drag, pointer: canvasPoint(ev) };
        updateNudge(ev);
    };
    const up = (): void =>
    {
        target.removeEventListener("pointermove", move);
        target.removeEventListener("pointerup", up);
        stopNudge();
        const overlays = dragOverlays.value;
        const drag = tableDrag.value;
        tableDrag.value = null;
        if (drag !== null && overlays !== null)
            drag.display.setPosition(overlays.dest);
    };
    target.addEventListener("pointermove", move);
    target.addEventListener("pointerup", up);
}

// Java: NudgeScrollSpeed.calculateNudge: within 5 px of an edge, 500 px/s; within 30 px, 100 px/s
function nudgeSpeed(proximity: number): number
{
    return proximity < 5 ? 500 : proximity < 30 ? 100 : 0;
}

function updateNudge(e: PointerEvent): void
{
    const s = scroller.value!;
    const r = s.getBoundingClientRect();
    const left = e.clientX - r.left, right = r.left + s.clientWidth - e.clientX;
    const top = e.clientY - r.top, bottom = r.top + s.clientHeight - e.clientY;
    nudge = { x: nudgeSpeed(right) - nudgeSpeed(left), y: nudgeSpeed(bottom) - nudgeSpeed(top) };
    if ((nudge.x !== 0 || nudge.y !== 0) && nudgeTimer === null)
    {
        nudgeTimer = setInterval(() =>
        {
            scroller.value?.scrollBy({ left: nudge.x / 10, top: nudge.y / 10, behavior: "instant" });
            const drag = tableDrag.value;
            // (The table moves with the pointer, which stays still as the canvas scrolls under it)
            if (drag !== null && drag.pointer !== null)
                tableDrag.value = { ...drag, pointer: { x: drag.pointer.x + nudge.x / 10, y: drag.pointer.y + nudge.y / 10 } };
        }, 100);
    }
    else if (nudge.x === 0 && nudge.y === 0)
        stopNudge();
}

function stopNudge(): void
{
    if (nudgeTimer !== null)
        clearInterval(nudgeTimer);
    nudgeTimer = null;
}

// --- The resizable column bar (Java: VirtualGrid.ResizableColumnBar) ----------------------------
// A 10 px bar above the grid, scrolled sideways with it, with a line at each column's right edge (and
// arrows, except for the first, fixed, column).  Dragging near a line resizes its column; a double
// click sizes the column to fit its column names and types (Java: calcPrefColumnWidth).

const columnEdges = computed(() =>
{
    layout.track();
    const edges: { column: number, x: number }[] = [];
    for (let c = colAt(scrollLeft.value); c < props.grid.getCurrentColumns() && colLeft(c) < scrollLeft.value + viewWidth.value; c++)
        edges.push({ column: c, x: colLeft(c + 1) });
    return edges;
});
const barCursor = shallowRef<string>("default");
let resizing: { column: number, startX: number, originalWidth: number } | null = null;

// The column whose right edge is within 6 px of the pointer (not the first column), or null:
function columnToResize(e: MouseEvent): number | null
{
    const x = e.clientX - (e.currentTarget as HTMLElement).getBoundingClientRect().left + scrollLeft.value;
    let nearest: { distance: number, column: number } | null = null;
    for (const edge of columnEdges.value)
    {
        const distance = Math.abs(x - edge.x);
        if (edge.column > 0 && distance <= 6.0 && (nearest === null || distance < nearest.distance))
            nearest = { distance, column: edge.column };
    }
    barCursor.value = nearest !== null ? "ew-resize" : "default";
    return nearest?.column ?? null;
}

function barPointerDown(e: PointerEvent): void
{
    if (e.button !== 0 || e.shiftKey)
        return;
    const column = columnToResize(e);
    if (column === null)
        return;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    resizing = { column, startX: e.clientX, originalWidth: props.grid.getColumnWidth(column) };
    e.preventDefault();
}

function barPointerMove(e: PointerEvent): void
{
    if (resizing !== null)
        props.grid.setColumnWidth(resizing.column, Math.max(VirtualGrid.MIN_COL_WIDTH, e.clientX - resizing.startX + resizing.originalWidth), true);
    else
        columnToResize(e);
}

function barPointerUp(e: PointerEvent): void
{
    resizing = null;
    columnToResize(e);
}

function barDoubleClick(e: MouseEvent): void
{
    const column = columnToResize(e);
    if (column !== null)
        props.grid.setColumnWidth(column, calcPrefColumnWidth(column), true);
}

/** A label's preferred width (JavaFX: prefWidth), its text's width plus its padding and border. */
function prefWidth(label: HTMLElement): number
{
    const range = document.createRange();
    range.selectNodeContents(label);
    const style = getComputedStyle(label);
    const extra = ["paddingLeft", "paddingRight", "borderLeftWidth", "borderRightWidth"] as const;
    return Math.ceil(range.getBoundingClientRect().width + extra.reduce((total, p) => total + parseFloat(style[p]), 0));
}

/** The widest column name or type label in the column, between MIN_COL_WIDTH and 600. */
function calcPrefColumnWidth(column: number): number
{
    const labels = scroller.value?.querySelectorAll<HTMLElement>(`[data-abs-col="${column}"]`) ?? [];
    const widths = [...labels].map(prefWidth);
    if (widths.length === 0)
        return VirtualGrid.DEFAULT_COLUMN_WIDTH;
    // Let's not go crazy with the width:
    return Math.min(600.0, Math.max(VirtualGrid.MIN_COL_WIDTH, ...widths));
}

// --- Editing a cell (Java: DataCellSupplier.startEditing, and the cell's DocumentTextField) -------

interface EditState
{
    readonly display: GridTableDisplay;
    // The cell, on the grid:
    readonly pos: CellPosition;
    readonly document: Document;
    // Distinguishes each edit:
    readonly id: number;
}
// Java: the expanded cell's size
const EDITOR_WIDTH = 350;
const EDITOR_HEIGHT = 110;
const editing = shallowRef<EditState | null>(null);
const editor = useTemplateRef<InstanceType<typeof DocumentTextField>>("editor");
let editCount = 0;

const editorStyle = computed(() =>
{
    layout.track();
    const pos = editing.value?.pos;
    return pos === undefined ? {} : { left: colLeft(pos.columnIndex) + "px", top: pos.rowIndex * ROW + "px", width: EDITOR_WIDTH + "px", height: EDITOR_HEIGHT + "px" };
});

/**
 * Starts editing the data cell at pos, with the caret where the client point is in its text, or with
 * all of it selected; startTyping replaces the text (the character typed to start editing).
 */
async function startEditing(point: { x: number, y: number } | null, pos: CellPosition, startTyping: string | null): Promise<void>
{
    const display = props.displays.find(d => d.contains(pos));
    const row = display?.dataRowAt(pos.rowIndex) ?? null;
    if (display === undefined || row === null)
        return;
    const column = pos.columnIndex - display.getPosition().columnIndex;
    const content = column < display.info.columnNames.length ? display.getCell(row, column) : null;
    if (content === null)
        return;
    const id = ++editCount;
    const version = display.info.version;
    const editable = display.info.columnEditable[column] ?? false;
    // Java: the cell's document (EditorKitCache)
    const relinquishFocus = (keyCode: string): void => props.grid.select(display.selectionForCell(pos.offsetByRowCols(keyCode === "ENTER" ? 1 : 0, 0)));
    let document: Document;
    if (content.kind === "error")
        document = new ReadOnlyCellDocument(content.text, true, relinquishFocus);
    else if (!editable)
        document = new ReadOnlyCellDocument(content.text, false, relinquishFocus);
    else
        document = new CellEditDocument(content.text, content.kind === "invalid" && content.errorPosition !== null, relinquishFocus, text => display.edit(version, row, column, text));
    // Java: moveTo, the caret where the point is in the text shown (mapped to the cell's text)
    const shown = point === null ? null : hitTestCell(point, display, row, column);
    const caret = shown === null ? null : Math.min(document.getLength(), display.cellDisplayOnPage(row, column)?.mapCaretPos(shown) ?? shown);
    editing.value = { display, pos, document, id };
    await nextTick();
    const field = editor.value;
    if (field === null || editing.value?.id !== id)
        return;
    if (caret !== null)
        field.setSelection(caret, caret);
    else
        field.selectAll();
    field.focus();
    // Important to do this after focus, which notes the text to go back to:
    if (startTyping !== null)
        field.replaceAll(startTyping, false);
    // Java: RecogniserDocument's checkEditable, when the focus is gained
    if (editable && !await display.canEdit(row, column) && editing.value?.id === id)
    {
        document.replaceText(0, document.getLength(), content.text);
        document.defocus("ESCAPE");
        showAlert({ title: "Error", message: "Cannot edit value on a row with an error in the identifier column.", afterClose: () => document.defocus("ESCAPE") });
    }
}

// The position in the text shown in a data cell on the page at a client point, or null:
function hitTestCell(point: { x: number, y: number }, display: GridTableDisplay, row: number, column: number): number | null
{
    const cell = scroller.value?.querySelector(`[data-table="${CSS.escape(display.info.id)}"] .row[data-row="${row}"] .cell[data-col="${column}"]`);
    const hit = window.document.caretPositionFromPoint(point.x, point.y);
    if (cell === null || cell === undefined || hit === null || !cell.contains(hit.offsetNode))
        return null;
    let index = 0;
    const walker = window.document.createTreeWalker(cell, NodeFilter.SHOW_TEXT);
    for (let n = walker.nextNode(); n !== null; n = walker.nextNode())
    {
        if (n === hit.offsetNode)
            return index + hit.offset;
        // (Offsets in the cell itself count its children)
        if (hit.offsetNode === cell && cell.childNodes[hit.offset] !== undefined && cell.childNodes[hit.offset]!.contains(n))
            return index;
        index += n.textContent?.length ?? 0;
    }
    return index;
}

function editorFocusLost(): void
{
    editing.value = null;
}

// --- VirtualGrid's Display ---------------------------------------------------------------------

function ensureVisible(target: CellPosition): void
{
    const s = scroller.value;
    if (s === null)
        return;
    const x0 = colLeft(target.columnIndex);
    const x1 = colLeft(target.columnIndex + 1);
    const y0 = target.rowIndex * ROW;
    const y1 = y0 + ROW;
    let left = s.scrollLeft;
    let top = s.scrollTop;
    if (x0 < left)
        left = x0;
    else if (x1 > left + s.clientWidth)
        left = x1 - s.clientWidth;
    if (y0 < top)
        top = y0;
    else if (y1 > top + s.clientHeight)
        top = y1 - s.clientHeight;
    // Java: smoothScrollToEnsureVisible
    if (left !== s.scrollLeft || top !== s.scrollTop)
        s.scrollTo({ left, top, behavior: "smooth" });
}

const display: VirtualGrid.Display = {
    getHeight: () => scroller.value?.clientHeight ?? 0,
    smoothScrollToEnsureVisible: ensureVisible,
    redoLayout: () => { layout.bump(); return null; },
    sizesOrPositionsChanged: () => layout.bump(),
    requestFocus: () => scroller.value?.focus({ preventScroll: true }),
    keyboardActivate,
    startEditing: (pos, character) => void startEditing(null, pos, character),
};

function onScroll(): void
{
    const s = scroller.value;
    // (A scroll can arrive after the grid has gone)
    if (s === null)
        return;
    scrollTop.value = s.scrollTop;
    scrollLeft.value = s.scrollLeft;
    props.grid.setLogicalScrollRow(Math.floor(s.scrollTop / ROW));
}

let resizeObserver: ResizeObserver | null = null;
onMounted(() =>
{
    const s = scroller.value!;
    resizeObserver = new ResizeObserver(() =>
    {
        viewWidth.value = s.clientWidth;
        viewHeight.value = s.clientHeight;
    });
    resizeObserver.observe(s);
    viewWidth.value = s.clientWidth;
    viewHeight.value = s.clientHeight;
    props.grid.setDisplay(display);
});
onBeforeUnmount(() =>
{
    clearHover();
    resizeObserver?.disconnect();
    stopNudge();
    props.grid.setDisplay(null);
});

// Java: View's picking modes (and TableHighlights.highlightAtScreenPos): a pane over the grid, which
// highlights what can be picked under the pointer, and picks it on a click
let picked: Picked | null = null;
const pickCursor = shallowRef<string | undefined>(undefined);

function pickAt(client: { x: number, y: number }): void
{
    const mode = props.picking ?? null;
    if (mode === null || scroller.value === null)
        return;
    const canvas = scroller.value.firstElementChild!.getBoundingClientRect();
    const p = { x: client.x - canvas.left, y: client.y - canvas.top };
    const inView = scroller.value.getBoundingClientRect();
    const pos = client.x >= inView.left && client.x < inView.right && client.y >= inView.top && client.y < inView.bottom ? cellAt(p) : null;
    let result: { picked: Picked, bounds: RectangleBounds } | null = null;
    for (const d of pos === null ? [] : props.displays)
    {
        if (!d.contains(pos!))
            continue;
        if (mode.kind === "table")
        {
            if (mode.include(d.info.id, null))
                result = { picked: { table: d.info.id, column: null }, bounds: new RectangleBounds(d.getPosition(), d.getBottomRightIncl()) };
        }
        else
        {
            const c = d.getColumnAt(pos!);
            if (c !== null && mode.include(d.info.id, c.column))
                result = { picked: { table: d.info.id, column: c.column }, bounds: c.bounds };
            else if (mode.kind === "tableOrColumn" && mode.include(d.info.id, null))
                result = { picked: { table: d.info.id, column: null }, bounds: new RectangleBounds(d.getPosition(), d.getBottomRightIncl()) };
        }
        if (result !== null)
            break;
    }
    picked = result?.picked ?? null;
    pickCursor.value = picked !== null ? "pointer" : undefined;
    if (result === null)
    {
        if (highlight.value?.type === "SELECT")
            highlight.value = null;
        return;
    }
    // The arrow goes from the area's centre to the nearest point of the dialog (Java: getWindowTargetPoint)
    const b = result.bounds;
    const left = colLeft(b.topLeftIncl.columnIndex);
    const top = b.topLeftIncl.rowIndex * ROW;
    const centre = { x: canvas.left + (left + colLeft(b.bottomRightIncl.columnIndex + 1)) / 2, y: canvas.top + (top + (b.bottomRightIncl.rowIndex + 1) * ROW) / 2 };
    const target = mode.target();
    const clamp = (low: number, v: number, high: number): number => Math.max(low, Math.min(v, high));
    const arrowTo = target === null ? null : { x: clamp(target.left, centre.x, target.right) - canvas.left, y: clamp(target.top, centre.y, target.bottom) - canvas.top };
    highlight.value = { type: "SELECT", bounds: [b], arrowTo: [arrowTo] };
}

function pickMove(e: PointerEvent): void
{
    pickAt({ x: e.clientX, y: e.clientY });
}

function pickClick(e: MouseEvent): void
{
    if (e.button === 0 && picked !== null)
        props.picking?.onPick(picked);
}

function pickWheel(e: WheelEvent): void
{
    scroller.value?.scrollBy(e.deltaX, e.deltaY);
}

watch(() => props.picking ?? null, mode =>
{
    picked = null;
    pickCursor.value = undefined;
    if (highlight.value?.type === "SELECT")
        highlight.value = null;
    // Highlight immediately:
    if (mode?.startPoint !== null && mode?.startPoint !== undefined)
        pickAt(mode.startPoint);
});

defineExpose({
    scroller: () => scroller.value,
    editor: () => editing.value === null ? null : editor.value,
    _test_windowChanges: () => windowChanges,
});
</script>

<template>
  <div class="table-grid">
    <div
      v-if="picking"
      class="pick-pane"
      data-testid="pick-pane"
      :style="{ cursor: pickCursor }"
      @mousedown.prevent
      @pointermove="pickMove"
      @click="pickClick"
      @wheel.prevent="pickWheel"
    />
    <div
      class="resizable-column-header"
      data-testid="column-resize-bar"
      :style="{ cursor: barCursor }"
      @pointerdown="barPointerDown"
      @pointermove="barPointerMove"
      @pointerup="barPointerUp"
      @dblclick="barDoubleClick"
    >
      <svg
        class="column-edges"
        :width="viewWidth"
        height="10"
      >
        <g
          v-for="edge in columnEdges"
          :key="edge.column"
          :transform="`translate(${edge.x - scrollLeft}, 0)`"
        >
          <line
            class="column-header-line"
            x1="-0.5"
            y1="0"
            x2="-0.5"
            y2="10"
          />
          <path
            v-if="edge.column > 0"
            class="column-header-arrow"
            d="M -3.5 2.5 L -5.5 4.5 L -3.5 6.5 M 2.5 2.5 L 4.5 4.5 L 2.5 6.5"
          />
        </g>
      </svg>
    </div>
    <ContextMenu :items="() => menuItems">
      <div
        ref="scroller"
        class="grid-scroller"
        tabindex="0"
        data-testid="grid"
        @scroll.passive="onScroll"
        @keydown="onKeyDown"
        @pointerdown="onPointerDown"
        @click="onClick"
        @focusout="onFocusOut"
        @contextmenu.capture="onContextMenu"
        @pointermove="onPointerMove"
        @pointerleave="clearHover"
      >
        <div
          class="grid-canvas"
          :style="{ width: canvasSize.width + 'px', height: canvasSize.height + 'px' }"
        >
          <div
            class="grid-vlines"
            :style="{ width: canvasSize.width + 'px', height: viewHeight + 'px' }"
          >
            <div
              v-for="x in verticalLines"
              :key="x"
              class="grid-vline"
              :style="{ left: x + 'px' }"
            />
          </div>
          <CommentView
            v-for="c in comments ?? []"
            :key="'comment-' + c.info.id"
            :display="c"
            :grid="grid"
            :layout="layout"
          />
          <GridTable
            v-for="d in displays"
            :key="d.getSortKey()"
            :display="d"
            :grid="grid"
            :layout="layout"
            :table-selected="tableSelected(d)"
            :drag-source="tableDrag?.display === d && tableDrag.pointer !== null"
            @window-changed="windowChanges++"
          />
          <DocumentTextField
            v-if="editing !== null"
            :key="editing.id"
            ref="editor"
            class="cell-editor table-data-cell"
            :document="editing.document"
            expanded
            :style="editorStyle"
            @focus-lost="editorFocusLost"
          />
          <button
            v-if="createTableButton !== null"
            type="button"
            tabindex="-1"
            class="create-table-grid-button"
            :style="createTableButton.style"
            @mousedown.stop
            @click.stop="e => createTable(createTableButton!.position, { x: e.clientX, y: e.clientY })"
          >
            {{ t("create.table") }}
          </button>
          <template
            v-for="(shape, i) in highlightShapes"
            :key="'highlight' + i"
          >
            <div
              class="pick-table-overlay"
              :class="highlight?.type === 'SOURCE' ? 'pick-source' : 'pick-select'"
              :style="shape.rect"
            />
            <svg
              v-if="shape.path !== null"
              class="table-highlight-arrow-svg"
              :style="{ left: shape.centre.x + 'px', top: shape.centre.y + 'px' }"
            >
              <path
                class="table-highlight-arrow"
                :class="highlight?.type === 'SOURCE' ? 'pick-source' : 'pick-select'"
                :d="shape.path"
              />
            </svg>
          </template>
          <div
            v-if="hoverTip !== null"
            class="virtual-grid-tooltip-flow"
            :style="{ left: hoverTip.left + 'px', top: hoverTip.top + 'px' }"
          >
            {{ hoverTip.text }}
          </div>
          <div
            v-if="selectionRect !== null"
            class="virt-grid-selection-overlay"
            data-testid="selection"
            :style="selectionRect"
          />
          <template v-if="dragOverlays !== null">
            <div
              class="move-table-dest-overlay-snapped"
              :style="dragOverlays.snapped"
            />
            <div
              class="move-table-dest-overlay-free"
              :style="dragOverlays.free"
            />
          </template>
        </div>
      </div>
    </ContextMenu>
  </div>
</template>

<style scoped>
.table-grid {
    position: relative;
    /* (The grid's layers, and the pick pane, stay within it, under the dialogs and menus) */
    isolation: isolate;
    display: flex;
    flex-direction: column;
    font-family: var(--font-main);
}
/* virtual-grid.scss: derive($table-empty-background, ±20%) */
.resizable-column-header {
    flex: none;
    height: 10px;
    overflow: hidden;
    background: rgb(225 225 225);
    border-bottom: 1px solid rgb(174 174 174);
    box-sizing: border-box;
    touch-action: none;
}
.column-edges {
    display: block;
}
.column-header-line, .column-header-arrow {
    stroke: rgb(174 174 174);
    fill: none;
}
.grid-scroller {
    flex: 1;
    min-height: 0;
    position: relative;
    /* (The grid's layers stay within it, under the dialogs and menus) */
    isolation: isolate;
    overflow: auto;
    outline: none;
    background: var(--table-empty-background);
}
.grid-canvas {
    position: relative;
    /* The horizontal grid lines (Java: VirtualGridLineSupplier's row dividers), on the bottom edge of
       each row: */
    background-image: linear-gradient(to bottom, transparent calc(var(--grid-row-height) - 1px), var(--table-divider) calc(var(--grid-row-height) - 1px));
    background-size: 100% var(--grid-row-height);
}
.grid-vlines {
    position: sticky;
    top: 0;
    left: 0;
}
/* virtual-grid.scss: 3 px outlines, outside the rectangle */
.virt-grid-selection-overlay, .move-table-dest-overlay-snapped, .move-table-dest-overlay-free {
    position: absolute;
    z-index: 5;
    pointer-events: none;
}
/* virtual-grid.scss: .create-table-grid-button */
.create-table-grid-button {
    position: absolute;
    z-index: 5;
    box-sizing: border-box;
    padding: 0 4px;
    margin: 0;
    font-family: var(--font-main);
    font-size: 14px;
}
.virt-grid-selection-overlay {
    outline: 3px solid var(--focus-color);
}
.move-table-dest-overlay-snapped {
    outline: 3px solid black;
}
.move-table-dest-overlay-free {
    background: rgb(0 0 0 / 0.1);
}
.cell-editor {
    position: absolute;
    z-index: 6;
}
/* Java: View's pickPaneMouse, over the whole grid */
.pick-pane {
    position: absolute;
    inset: 0;
    z-index: 5;
}
/* virtual-grid.scss: .pick-table-overlay (3 px outside), .table-highlight-arrow */
.pick-table-overlay {
    position: absolute;
    z-index: 5;
    pointer-events: none;
    background: var(--table-pick-overlay-fill);
    outline: 3px solid var(--table-pick-overlay-stroke);
}
.pick-table-overlay.pick-source {
    background: var(--table-source-overlay-fill);
    outline-color: var(--table-source-overlay-stroke);
}
.table-highlight-arrow-svg {
    position: absolute;
    z-index: 5;
    width: 1px;
    height: 1px;
    overflow: visible;
    pointer-events: none;
}
.table-highlight-arrow {
    fill: none;
    stroke-width: 3;
    stroke-linecap: round;
    stroke-linejoin: round;
    stroke: var(--table-pick-overlay-stroke);
}
.table-highlight-arrow.pick-source {
    stroke: var(--table-source-overlay-stroke);
}
/* virtual-grid.scss: .virtual-grid-tooltip-flow (at most 200 px wide, Java: HoverTip) */
.virtual-grid-tooltip-flow {
    position: absolute;
    z-index: 7;
    max-width: 200px;
    padding: 3px;
    border: 1px solid black;
    border-radius: 5px;
    background: rgb(255 255 235);
    box-shadow: 1px 1px 6px rgb(179 179 179 / 0.6);
    font-size: 80%;
    white-space: pre-wrap;
    overflow-wrap: anywhere;
    pointer-events: none;
}
.grid-vline {
    position: absolute;
    top: 0;
    width: 1px;
    height: 100%;
    background: var(--table-divider);
}
</style>
