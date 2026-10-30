<script setup lang="ts">
// One table on the grid (Java: DataDisplay's floating column headers, HeadedDisplay's table name row
// and border, RowLabelSupplier's labels, and DataCellSupplier's cells), docs/gui-spec/grid.md.
// Only the rows and columns in its window (gridWindow.ts) are on the page.  The column names stick to
// the top of the view while the table is in view (Java: DataDisplay.ColumnNameItem), and the row
// labels to its left edge (Java: RowLabelSupplier), with CSS position: sticky.
import { computed, inject, shallowRef, watch, watchEffect } from "vue";
import { VirtualGrid } from "../../gui-logic/stf/gui/grid/VirtualGrid.js";
import type { VersionCounter } from "../store/EngineStore.js";
import { type CellDisplay, columnDisplays, numberFontsReady, waitForNumberFonts } from "./cellDisplay.js";
import { EMPTY_WINDOW, tableWindow, type TableWindow } from "./gridWindow.js";
import { GridTableDisplay } from "./GridTableDisplay.js";
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
    return { left, top: pos.rowIndex * ROW, width, columnLefts, columnWidths, rows, digits };
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
    :class="['table-' + display.info.kind, { 'table-selected': tableSelected, 'table-drag-source': dragSource }]"
    :data-table="display.info.id"
    :style="{ left: geometry.left + 'px', top: geometry.top + 'px', width: geometry.width + 'px', height: Math.max(0, geometry.rows + HEADER - 1) * ROW + 'px' }"
  >
    <div class="table-title">
      {{ display.info.id }}
    </div>
    <div class="column-names">
      <div
        v-for="c in visibleColumns"
        :key="c"
        class="column-name"
        :data-abs-col="display.getPosition().columnIndex + c"
        :style="{ left: geometry.columnLefts[c] + 'px', width: geometry.columnWidths[c] + 'px' }"
      >
        {{ display.info.columnNames[c] }}
      </div>
    </div>
    <div class="column-types">
      <div
        v-for="c in visibleColumns"
        :key="c"
        class="column-type"
        :data-abs-col="display.getPosition().columnIndex + c"
        :style="{ left: geometry.columnLefts[c] + 'px', width: geometry.columnWidths[c] + 'px' }"
      >
        {{ display.info.columnTypes[c] }}
      </div>
    </div>
    <div
      v-if="display.info.error !== null"
      class="table-error"
    >
      {{ display.info.error }}
    </div>
    <div class="data">
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
  <div
    v-if="geometry.rows > 0"
    class="row-labels-area"
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
        class="row-label"
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
.table-drag-source {
    filter: blur(2px);
}
.table-transformation .table-title {
    background: var(--table-header-transformation-background-color);
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
</style>
