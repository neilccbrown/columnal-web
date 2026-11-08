<script setup lang="ts">
// One table on the grid (Java: DataDisplay's floating column headers, HeadedDisplay's table name row
// and border, RowLabelSupplier's labels, and DataCellSupplier's cells), docs/gui-spec/grid.md.
// Only the rows and columns in its window (gridWindow.ts) are on the page.  The column names stick to
// the top of the view while the table is in view (Java: DataDisplay.ColumnNameItem), and the row
// labels to its left edge (Java: RowLabelSupplier), with CSS position: sticky.
import { computed, inject, onBeforeUnmount, onMounted, shallowRef, useTemplateRef, watch, watchEffect } from "vue";
import { TableId } from "../../engine/identifiers/id/TableId.js";
import { VirtualGrid } from "../../gui-logic/stf/gui/grid/VirtualGrid.js";
import { EntireTableSelection } from "../../gui-logic/table-gui/gui/table/EntireTableSelection.js";
import { TableNameTextField } from "../../gui-logic/table-gui/gui/table/TableNameTextField.js";
import ErrorableTextField from "../components/ErrorableTextField.vue";
import { useEngine } from "../engine/useEngine.js";
import type { VersionCounter } from "../store/EngineStore.js";
import { type CellDisplay, columnDisplays, numberFontsReady, waitForNumberFonts } from "./cellDisplay.js";
import { EMPTY_WINDOW, tableWindow, type TableWindow } from "./gridWindow.js";
import { GridTableDisplay } from "./GridTableDisplay.js";
import { useTableActions } from "./tableActions.js";
import { useHighlight } from "./highlights.js";
import TableHatView from "./TableHatView.vue";
import { RectangleBounds } from "../../gui-logic/stf/gui/grid/RectangleBounds.js";
import { VIEWPORT } from "./viewport.js";

const props = defineProps<{
    display: GridTableDisplay,
    grid: VirtualGrid,
    layout: VersionCounter,
    // Selected as an entire table (Java: the table header's table-selected style):
    tableSelected: boolean,
    // Being dragged to a new position (Java: CellStyle.TABLE_DRAG_SOURCE, a blur):
    dragSource: boolean,
}>();
const emit = defineEmits<{
    // The window changed (for tests: Java counted its layouts)
    windowChanged: [],
}>();

const ROW = VirtualGrid.rowHeight;
const HEADER = GridTableDisplay.HEADER_ROWS;
const BLOCK = GridTableDisplay.ROW_BLOCK;
const viewport = inject(VIEWPORT)!;
const tableActions = useTableActions();
const engine = useEngine();
const collapsed = computed(() => props.display.info.display === "COLLAPSED");

// --- The table name (Java: HeadedDisplay.TableHeaderItem's TableNameTextField) -------------------
const nameText = shallowRef(props.display.info.id);
watch(() => props.display.info.id, id => { nameText.value = id; });
const nameField = useTemplateRef<{ focus(): void, isFocused(): boolean }>("nameField");
// Java: new TableNameTextField(tableManager, initialTableName, false, ...): not another table's name
const nameConverter = (text: string): ReturnType<ReturnType<typeof TableNameTextField.converter>> =>
    TableNameTextField.converter(engine.tables.tables.value.map(t => new TableId(t.id)), new TableId(props.display.info.id), false)(text);

// The name field's width (Java: getTableNameWidth, for the hat), as it sizes to its text:
const title = useTemplateRef<HTMLElement>("title");
const nameWidth = shallowRef(0);
let nameObserver: ResizeObserver | null = null;
onMounted(() =>
{
    const input = title.value?.querySelector("input");
    if (input === null || input === undefined)
        return;
    nameObserver = new ResizeObserver(() => { nameWidth.value = input.offsetWidth; });
    nameObserver.observe(input);
});
onBeforeUnmount(() =>
{
    nameObserver?.disconnect();
    if (flashTimer !== null)
        clearTimeout(flashTimer);
});

// Java: TableNameTextField's Enter, which selects the entire table (taking the focus from the field)
function nameEnter(e: KeyboardEvent): void
{
    e.preventDefault();
    e.stopPropagation();
    props.grid.select(new EntireTableSelection(props.display, props.display.getPosition().columnIndex));
}

// Java: renameTableOperation, on the field's focus loss, if the name is valid and has changed
function nameFocusLost(value: TableId | null): void
{
    if (value !== null && value.getRaw() !== props.display.info.id)
        props.display.renameTable(value.getRaw());
}

// Java: the header's middle click (on the field only while it isn't focused) cycles the columns shown
function titleMiddleClick(e: MouseEvent): void
{
    if (e.button !== 1 || nameField.value?.isFocused() === true)
        return;
    e.preventDefault();
    props.display.headerMiddleClicked();
}

// Java: HeadedDisplay.flashHeader, the header brightening and back, twice
const flashing = shallowRef(false);
let flashTimer: ReturnType<typeof setTimeout> | null = null;
watch(() => props.display.flashVersion.track(), () =>
{
    flashing.value = false;
    if (flashTimer !== null)
        clearTimeout(flashTimer);
    // (The next frame, so that the animation restarts)
    requestAnimationFrame(() =>
    {
        flashing.value = true;
        flashTimer = setTimeout(() => { flashing.value = false; }, 1200);
    });
});

// Java: a hat's source link's middle click, which selects the source table
function selectTable(tableId: string): void
{
    const target = props.grid.getGridAreas().find(a => a instanceof GridTableDisplay && a.info.id === tableId);
    if (target instanceof GridTableDisplay)
        props.grid.select(new EntireTableSelection(target, target.getPosition().columnIndex));
}

// Java: editSourceLink's hovering: TableHighlights.highlightAtScreenPos, the source table (SOURCE),
// with an arrow to where the pointer was
const highlight = useHighlight();
function hoverSource(hover: { readonly tableId: string, readonly at: { readonly x: number, readonly y: number } } | null): void
{
    if (highlight === null)
        return;
    const source = hover === null ? undefined : props.grid.getGridAreas().find(a => a instanceof GridTableDisplay && a.info.id === hover.tableId);
    if (hover === null || source === undefined)
    {
        // Java: stopHighlightingGridArea
        highlight.value = null;
        return;
    }
    highlight.value = { type: "SOURCE", bounds: [new RectangleBounds(source.getPosition(), source.getBottomRightIncl())], arrowTo: [hover.at] };
}

// --- The column headers (Java: DataDisplay's ColumnNameItem and ColumnTypeItem) -------------------
// Java: ColumnHeaderOps.getPrimaryEditOperation, on a click
function editColumn(column: number, focus: "name" | "type"): void
{
    const name = props.display.info.columnNames[column];
    if (name !== undefined && props.display.info.columnHeaderEditable[column] === true)
        tableActions?.editColumn(props.display, name, focus);
}

// Java: ExpandTableArrowSupplier's arrows (DOWN_ARROW, RIGHT_ARROW)
const DOWN_ARROW = "\u2193";
const RIGHT_ARROW = "\u27F6";
const showAddRowArrows = computed(() => props.display.info.canAppendRows && props.display.info.columnNames.length > 0 && !collapsed.value);
const showAddColumnArrows = computed(() => props.display.info.canAddColumn && props.display.info.columnNames.length > 0 && !collapsed.value);

const geometry = computed(() =>
{
    props.layout.track();
    props.display.sizeVersion.track();
    const pos = props.display.getPosition();
    const left = props.grid.sumColumnWidths(0, pos.columnIndex);
    const columnLefts: number[] = [];
    const columnWidths: number[] = [];
    for (let i = 0; i < props.display.info.columnNames.length; i++)
    {
        columnLefts.push(props.grid.sumColumnWidths(0, pos.columnIndex + i) - left);
        columnWidths.push(props.grid.getColumnWidth(pos.columnIndex + i));
    }
    const width = Math.max(columnLefts.length > 0 ? columnLefts.at(-1)! + columnWidths.at(-1)! : 0, props.grid.getColumnWidth(pos.columnIndex));
    const rows = props.display.currentKnownRows;
    const digits = Math.max(2, String(rows).length);
    // Java: the table's whole width, to its bottom right (with any column of add-column arrows)
    const wholeWidth = props.grid.sumColumnWidths(0, props.display.getBottomRightIncl().columnIndex + 1) - left;
    return { left, top: pos.rowIndex * ROW, width, columnLefts, columnWidths, rows, digits, wholeWidth };
});

const win = shallowRef<TableWindow>(EMPTY_WINDOW);
watchEffect(() =>
{
    const g = geometry.value;
    const next = tableWindow(win.value, {
        dataTop: g.top + HEADER * ROW,
        rows: g.rows,
        rowHeight: ROW,
        blockSize: BLOCK,
        columnLefts: g.columnLefts.map(x => g.left + x),
        right: g.left + g.width,
        viewLeft: viewport.scrollLeft.value,
        viewTop: viewport.scrollTop.value,
        viewWidth: viewport.viewWidth.value,
        viewHeight: viewport.viewHeight.value,
    });
    if (next !== win.value)
        win.value = next;
});
watch(win, () => emit("windowChanged"));


// Asks for the rows in the window that aren't here (again after the worker skips a request):
watchEffect(() =>
{
    props.display.dataVersion.track();
    props.display.sizeVersion.track();
    props.display.ensureRows(win.value.firstBlock * BLOCK, win.value.lastBlockExcl * BLOCK);
});

const visibleRows = computed(() =>
{
    const rows: number[] = [];
    for (let r = win.value.firstBlock * BLOCK; r < Math.min(win.value.lastBlockExcl * BLOCK, geometry.value.rows); r++)
        rows.push(r);
    return rows;
});
const visibleColumns = computed(() =>
{
    const columns: number[] = [];
    // (The header rows are shown for the columns in view even when no data rows are)
    const first = win.value.lastColumnExcl > 0 ? win.value.firstColumn : 0;
    const last = win.value.lastColumnExcl > 0 ? win.value.lastColumnExcl : geometry.value.columnLefts.length;
    for (let c = first; c < last; c++)
        columns.push(c);
    return columns;
});

void waitForNumberFonts();

// The displays of the cells on the page, by column then row (from the window's first row):
const cellDisplays = computed(() =>
{
    props.display.dataVersion.track();
    const info = props.display.info;
    const rows = visibleRows.value;
    const byColumn = new Map<number, (CellDisplay | null)[]>();
    for (const c of visibleColumns.value)
    {
        const isNumber = info.columnNumber[c] ?? false;
        // (The formatter measures the number fonts, so waits for them)
        if (isNumber && !numberFontsReady.value)
            continue;
        byColumn.set(c, columnDisplays(rows.map(r => props.display.getCell(r, c)), info.columnEditable[c] ?? false, isNumber, geometry.value.columnWidths[c]!));
    }
    return byColumn;
});

function cell(row: number, column: number): CellDisplay | null
{
    return cellDisplays.value.get(column)?.[row - (visibleRows.value[0] ?? 0)] ?? null;
}
watchEffect(() =>
{
    props.display.setPage(win.value.firstBlock * BLOCK, Math.min(win.value.lastBlockExcl * BLOCK, geometry.value.rows), cell);
});

</script>

<template>
  <div
    class="table"
    :class="['table-' + display.info.kind, { 'table-check': display.info.check !== null, 'table-selected': tableSelected, 'table-drag-source': dragSource, 'table-collapsed': collapsed }]"
    :data-table="display.info.id"
    :style="{ left: geometry.left + 'px', top: geometry.top + 'px', width: geometry.width + 'px', height: (display.info.check !== null ? 2 * ROW : collapsed ? ROW : Math.max(0, geometry.rows + HEADER - 1) * ROW) + 'px' }"
  >
    <div
      ref="title"
      class="table-title table-display-table-title"
      :class="[display.info.check !== null ? 'check-table-title' : display.info.kind === 'data' ? 'immediate-table-title' : 'transformation-table-title', { flashing, 'check-failing': display.info.check?.failing === true }]"
      @mousedown="e => { if (e.button === 1) e.preventDefault(); }"
      @auxclick="titleMiddleClick"
    >
      <ErrorableTextField
        ref="nameField"
        v-model:text="nameText"
        class="table-name-text-field text-field"
        :converter="nameConverter"
        :editable="display.info.canRename"
        tabindex="-1"
        :style="{ width: `min(calc(100% - 16px), max(30px, calc(${nameText.length}ch + 6px)))` }"
        @keydown.enter="nameEnter"
        @focus-lost="nameFocusLost"
      />
    </div>
    <!-- Java: CheckDisplay's result, below the name.  PORT-DEFERRED: clicking it (or Enter on it) to
         show why it failed (ExplanationDisplay, Phase 11 step 7) -->
    <div
      v-if="display.info.check !== null"
      class="check-result"
      :title="display.info.check.text"
    >
      {{ display.info.check.text }}
    </div>
    <template v-else-if="!collapsed">
      <div class="column-names">
        <div
          v-for="c in visibleColumns"
          :key="c"
          class="column-name column-title table-display-column-title"
          :class="[...(display.info.columnHeaderClasses[c] ?? []), { 'column-title-edit': display.info.columnHeaderEditable[c] }]"
          :data-abs-col="display.getPosition().columnIndex + c"
          :data-col="c"
          :title="display.info.columnNames[c]"
          :style="{ left: geometry.columnLefts[c] + 'px', width: geometry.columnWidths[c] + 'px' }"
          @click="editColumn(c, 'name')"
        >
          {{ display.info.columnNames[c] }}
        </div>
      </div>
      <div class="column-types">
        <div
          v-for="c in visibleColumns"
          :key="c"
          class="column-type table-display-column-type"
          :class="{ 'column-title-edit': display.info.columnHeaderEditable[c] }"
          :data-abs-col="display.getPosition().columnIndex + c"
          :data-col="c"
          :title="display.info.columnTypes[c]"
          :style="{ left: geometry.columnLefts[c] + 'px', width: geometry.columnWidths[c] + 'px' }"
          @click="editColumn(c, 'type')"
        >
          {{ display.info.columnTypes[c] }}
        </div>
      </div>
    </template>
    <div
      v-if="display.info.error !== null"
      class="table-error"
    >
      {{ display.info.error }}
    </div>
    <div
      v-if="!collapsed && display.info.check === null"
      class="data"
    >
      <div
        v-for="r in visibleRows"
        :key="r"
        class="row"
        :data-row="r"
        :style="{ top: r * ROW + 'px' }"
      >
        <div
          v-for="c in visibleColumns"
          :key="c"
          class="cell table-data-cell"
          :data-col="c"
          :class="[display.info.columnStyles[c], { loading: cell(r, c) === null, 'has-error': cell(r, c)?.hasError, 'align-right': cell(r, c)?.alignRight }]"
          :style="{ left: geometry.columnLefts[c] + 'px', width: geometry.columnWidths[c] + 'px' }"
        >
          <span
            v-for="(span, i) in cell(r, c)?.spans ?? []"
            :key="i"
            :class="span.classes"
          >{{ span.text }}</span>
        </div>
      </div>
    </div>
  </div>
  <TableHatView
    v-if="display.info.hat !== null"
    :hat="display.info.hat"
    :table-id="display.info.id"
    :table-left="geometry.left"
    :table-top="geometry.top"
    :whole-table-width="geometry.wholeWidth"
    :table-name-width="nameWidth"
    @select-table="selectTable"
    @hover-source="hoverSource"
    @link-clicked="(link, point) => tableActions?.hatLinkClicked(display, link, point)"
  />
  <template v-if="showAddRowArrows">
    <button
      v-for="c in visibleColumns"
      :key="'down' + c"
      type="button"
      tabindex="-1"
      class="expand-arrow expand-down"
      title="Click to add row"
      :style="{ left: geometry.left + geometry.columnLefts[c]! + 'px', top: geometry.top + (HEADER + geometry.rows) * ROW + 'px', width: geometry.columnWidths[c] + 'px', height: ROW + 'px' }"
      @mousedown.stop
      @click.stop="display.appendRow()"
    >
      {{ DOWN_ARROW }}
    </button>
  </template>
  <template v-if="showAddColumnArrows">
    <button
      v-for="r in [-2, -1, ...visibleRows]"
      :key="'right' + r"
      type="button"
      tabindex="-1"
      class="expand-arrow expand-right"
      :class="{ 'expand-right-header': r < 0 }"
      title="Click to add column"
      :style="{ left: geometry.left + geometry.width + 'px', top: geometry.top + (HEADER + r) * ROW + 'px', width: grid.getColumnWidth(display.getPosition().columnIndex + display.info.columnNames.length) + 'px', height: ROW + 'px' }"
      @mousedown.stop
      @click.stop="tableActions?.addColumn(display, null)"
    >
      {{ RIGHT_ARROW }}
    </button>
  </template>
  <div
    v-if="geometry.rows > 0 && !collapsed"
    class="row-labels-area"
    :data-table="display.info.id"
    :style="{
      left: `calc(${geometry.left}px - ${geometry.digits}ch - 8px)`,
      top: geometry.top + HEADER * ROW + 'px',
      width: `calc(${geometry.width}px + ${geometry.digits}ch + 8px)`,
      height: geometry.rows * ROW + 'px',
    }"
  >
    <div
      class="row-labels"
      :style="{ width: `calc(${geometry.digits}ch + 8px)` }"
    >
      <div
        v-for="r in visibleRows"
        :key="r"
        class="row-label virt-grid-row-label"
        :data-row="r"
        :style="{ top: r * ROW + 'px' }"
      >
        {{ r + 1 }}
      </div>
    </div>
  </div>
</template>

<style scoped>
/* From stableview.scss and virtual-grid.scss, through tokens.css */
.table {
    position: absolute;
    /* The last data row is in the bottom padding, so the sticky column names stop above it (Java:
       "the furthest down we go is to sit just above the last data row"): */
    padding-bottom: var(--grid-row-height);
    box-shadow: 2px 2px 8px rgb(102 102 102 / 0.6);
    outline: 1px solid var(--table-border-color);
}
.table-title, .column-names, .column-types {
    position: relative;
    height: var(--grid-row-height);
}
.table-title {
    display: flex;
    align-items: center;
    background: var(--table-header-background-color);
    color: var(--table-header-text-color);
    padding: 0 8px;
    line-height: var(--grid-row-height);
    white-space: nowrap;
    overflow: hidden;
}
.table-selected .table-title {
    background: var(--table-header-background-color-selected);
    cursor: move;
}
/* virtual-grid.scss: the table name's .text-field, the header's colour with a border when hovered or
   focused */
.table-title :deep(.table-name-text-field) {
    box-sizing: border-box;
    height: calc(var(--grid-row-height) - 2px);
    margin: 0;
    padding: 0 1px;
    border: 1px solid transparent;
    background: transparent;
    color: inherit;
    font: inherit;
    outline: none;
}
.table-title :deep(.table-name-text-field:hover), .table-title :deep(.table-name-text-field:focus) {
    border-color: var(--table-header-name-border-color);
}
/* Java: ColorAdjust's brightness to 1 (white) and back over 300 ms, four times */
.table-title.flashing {
    animation: header-flash 300ms 4 alternate;
}
@keyframes header-flash {
    to { filter: brightness(0) invert(1); }
}
.table-collapsed {
    padding-bottom: 0;
}
.table-drag-source {
    filter: blur(2px);
}
.table-transformation .table-title {
    background: var(--table-header-transformation-background-color);
}
/* virtual-grid.scss: check-table-title's check-failing */
.table-transformation .table-title.check-failing {
    background: var(--table-header-background-color-check-failing);
}
.table-selected .table-title.check-failing {
    background: var(--table-header-background-color-selected);
}
/* Java: CheckDisplay's two cells, the name and the result (a Label in a cell, check-result) */
.table-check {
    padding-bottom: 0;
}
.check-result {
    height: var(--grid-row-height);
    line-height: var(--grid-row-height);
    padding: 0 2px;
    box-sizing: border-box;
    background: var(--table-cell);
    white-space: pre;
    overflow: hidden;
    text-overflow: ellipsis;
}
.column-names {
    position: sticky;
    top: 0;
    z-index: 2;
}
.column-name, .column-type {
    position: absolute;
    top: 0;
    height: var(--grid-row-height);
    line-height: var(--grid-row-height);
    padding: 0 1px 0 2px;
    box-sizing: border-box;
    background: var(--column-header-background-color);
    color: var(--column-header-text-color);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
}
.column-type {
    font-size: 85%;
}
/* virtual-grid.scss: .column-title-overwritten and .column-title-edit */
.column-name.column-title-overwritten {
    font-weight: bold;
}
.column-title-edit {
    cursor: pointer;
}
.column-title-edit:hover {
    text-decoration: underline;
}
.data {
    position: relative;
}
.row {
    position: absolute;
    left: 0;
    height: var(--grid-row-height);
}
/* virtual-grid.scss .table-data-cell (with .document-text-flow's padding) */
.cell {
    position: absolute;
    top: 0;
    height: var(--grid-row-height);
    line-height: var(--grid-row-height);
    padding: 0 2px;
    box-sizing: border-box;
    background: var(--table-cell);
    border-right: 1px solid var(--table-divider);
    border-bottom: 1px solid var(--table-divider);
    /* (Spaces matter: numbers are padded with them to line up) */
    white-space: pre;
    overflow: hidden;
}
.cell:hover {
    background: var(--table-cell-hover);
}
.cell.align-right {
    text-align: right;
}
.cell.has-error {
    box-shadow: inset 1px 1px 0 1px var(--cell-error);
}
.table-error {
    position: absolute;
    top: calc(var(--grid-row-height) * 3);
    padding: 5px;
    border-radius: 5px;
    color: white;
    background: rgb(110 29 7);
    font-size: 80%;
}
.row-labels-area {
    position: absolute;
    pointer-events: none;
    z-index: 3;
    font-family: var(--font-mono);
    font-size: var(--row-label-font-size);
}
.row-labels {
    position: sticky;
    left: 0;
    height: 100%;
    pointer-events: auto;
    box-shadow: -2px 2px 8px rgb(102 102 102 / 0.4);
}
.row-label {
    position: absolute;
    right: 0;
    width: 100%;
    height: var(--grid-row-height);
    line-height: var(--grid-row-height);
    padding: 0 2px 0 5px;
    box-sizing: border-box;
    text-align: right;
    color: var(--table-row-label-text-color);
    background: var(--table-row-label-background-color);
    border-right: 1px solid var(--table-divider);
    border-bottom: 1px solid var(--table-divider);
}
/* virtual-grid.scss: .expand-arrow */
.expand-arrow {
    position: absolute;
    box-sizing: border-box;
    padding: 0;
    border: none;
    border-radius: 0;
    background: var(--table-cell);
    color: var(--expand-arrow-color);
    font: inherit;
    cursor: pointer;
}
/* (Java whitened all of a table's add-row, or add-column, arrows while one was hovered) */
.expand-arrow:hover {
    background: var(--expand-arrow-color-hover);
}
</style>
