<script setup lang="ts">
// Grid prototype (Phase 7, throwaway): one table on the grid.  Only the rows and columns in view
// (plus a margin) are in the DOM.  The column names stick to the top of the view while the table is
// in view (Java: DataDisplay.ColumnNameItem), and the row labels stick to its left edge (Java:
// RowLabelSupplier), both with CSS position: sticky.
import { computed, inject } from "vue";
import { VirtualGrid } from "../../../gui-logic/stf/gui/grid/VirtualGrid.js";
import type { VersionCounter } from "../../store/EngineStore.js";
import type { GridTableModel } from "./GridTableModel.js";
import { TableAreaBase } from "./TableAreaBase.js";
import { VIEWPORT } from "./viewport.js";

const props = defineProps<{
    display: GridTableModel,
    grid: VirtualGrid,
    layout: VersionCounter,
}>();

const ROW = VirtualGrid.rowHeight;
const HEADER = TableAreaBase.HEADER_ROWS;
// Rows and columns are added and removed in blocks, so that the DOM changes only every few rows:
const ROW_BLOCK = 16;
const viewport = inject(VIEWPORT)!;

const geometry = computed(() =>
{
    props.layout.track();
    props.display.sizeVersion.track();
    const pos = props.display.getPosition();
    const left = props.grid.sumColumnWidths(0, pos.columnIndex);
    const columnLefts: number[] = [];
    const columnWidths: number[] = [];
    for (let i = 0; i < props.display.columnNames.length; i++)
    {
        columnLefts.push(props.grid.sumColumnWidths(0, pos.columnIndex + i) - left);
        columnWidths.push(props.grid.getColumnWidth(pos.columnIndex + i));
    }
    const width = Math.max(columnLefts.at(-1) !== undefined ? columnLefts.at(-1)! + columnWidths.at(-1)! : 0, props.grid.getColumnWidth(pos.columnIndex));
    const rows = props.display.currentKnownRows;
    const digits = Math.max(2, String(rows).length);
    return { left, top: pos.rowIndex * ROW, width, columnLefts, columnWidths, rows, digits };
});

const firstRow = computed(() =>
{
    const g = geometry.value;
    const first = Math.floor((viewport.scrollTop.value - g.top) / ROW) - HEADER;
    return Math.max(0, (Math.floor(first / ROW_BLOCK) - 1) * ROW_BLOCK);
});
const lastRowExcl = computed(() =>
{
    const g = geometry.value;
    const last = Math.ceil((viewport.scrollTop.value + viewport.viewHeight.value - g.top) / ROW) - HEADER;
    return Math.min(g.rows, (Math.ceil(last / ROW_BLOCK) + 1) * ROW_BLOCK);
});
const firstColumn = computed(() =>
{
    const g = geometry.value;
    const x = viewport.scrollLeft.value - g.left;
    let c = 0;
    while (c < g.columnLefts.length - 1 && g.columnLefts[c + 1]! <= x)
        c++;
    return c;
});
const lastColumnExcl = computed(() =>
{
    const g = geometry.value;
    const x = viewport.scrollLeft.value + viewport.viewWidth.value - g.left;
    let c = firstColumn.value;
    while (c < g.columnLefts.length && g.columnLefts[c]! < x)
        c++;
    return c;
});
const visibleRows = computed(() =>
{
    const rows: number[] = [];
    for (let r = firstRow.value; r < lastRowExcl.value; r++)
        rows.push(r);
    return rows;
});
const visibleColumns = computed(() =>
{
    const columns: number[] = [];
    for (let c = firstColumn.value; c < lastColumnExcl.value; c++)
        columns.push(c);
    return columns;
});
const inView = computed(() =>
{
    const g = geometry.value;
    const bottom = g.top + (g.rows + HEADER) * ROW;
    return bottom > viewport.scrollTop.value && g.top < viewport.scrollTop.value + viewport.viewHeight.value
        && g.left + g.width > viewport.scrollLeft.value && g.left < viewport.scrollLeft.value + viewport.viewWidth.value;
});

function cell(row: number, column: number)
{
    return props.display.getCell(row, column);
}

const tableName = props.display.tableName;
const columnNames = props.display.columnNames;
const columnTypes = props.display.columnTypes;

// Column resizing: dragging the right edge of a column name (Java: the resizable column bar).
function startResize(column: number, e: PointerEvent): void
{
    const target = e.currentTarget as HTMLElement;
    target.setPointerCapture(e.pointerId);
    const startX = e.clientX;
    const absColumn = props.display.getPosition().columnIndex + column;
    const startWidth = props.grid.getColumnWidth(absColumn);
    const move = (ev: PointerEvent): void =>
    {
        props.grid.setColumnWidth(absColumn, Math.max(VirtualGrid.MIN_COL_WIDTH, startWidth + ev.clientX - startX), true);
    };
    const up = (): void =>
    {
        target.removeEventListener("pointermove", move);
        target.removeEventListener("pointerup", up);
    };
    target.addEventListener("pointermove", move);
    target.addEventListener("pointerup", up);
    e.stopPropagation();
}
</script>

<template>
  <div
    class="table"
    :class="{ transformation: !display.editable }"
    :data-table="tableName"
    :style="{ left: geometry.left + 'px', top: geometry.top + 'px', width: geometry.width + 'px', height: Math.max(0, geometry.rows + HEADER - 1) * ROW + 'px' }"
  >
    <div class="table-title">
      {{ tableName }}
    </div>
    <div class="column-names">
      <div
        v-for="c in visibleColumns"
        :key="c"
        class="column-name"
        :style="{ left: geometry.columnLefts[c] + 'px', width: geometry.columnWidths[c] + 'px' }"
      >
        {{ columnNames[c] }}
        <div
          class="resize-handle"
          @pointerdown="startResize(c, $event)"
        />
      </div>
    </div>
    <div class="column-types">
      <div
        v-for="c in visibleColumns"
        :key="c"
        class="column-type"
        :style="{ left: geometry.columnLefts[c] + 'px', width: geometry.columnWidths[c] + 'px' }"
      >
        {{ columnTypes[c] }}
      </div>
    </div>
    <div
      v-if="display.error !== null"
      class="table-error"
    >
      {{ display.error }}
    </div>
    <div
      v-if="inView"
      class="data"
      :data-version="display.dataVersion.track()"
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
          class="cell"
          :data-col="c"
          :class="cell(r, c).kind"
          :style="{ left: geometry.columnLefts[c] + 'px', width: geometry.columnWidths[c] + 'px' }"
        >
          {{ cell(r, c).text }}
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
      width: `calc(${geometry.columnLefts.at(-1) ?? 0}px + ${geometry.digits}ch + 8px)`,
      height: geometry.rows * ROW + 'px',
    }"
  >
    <div
      class="row-labels"
      :style="{ width: `calc(${geometry.digits}ch + 8px)` }"
    >
      <template v-if="inView">
        <div
          v-for="r in visibleRows"
          :key="r"
          class="row-label"
          :style="{ top: r * ROW + 'px' }"
        >
          {{ r + 1 }}
        </div>
      </template>
    </div>
  </div>
</template>

<style scoped>
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
    padding: 0 4px;
    line-height: var(--grid-row-height);
    white-space: nowrap;
    overflow: hidden;
}
.transformation .table-title {
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
.resize-handle {
    position: absolute;
    right: 0;
    top: 0;
    width: 5px;
    height: 100%;
    cursor: col-resize;
}
.data {
    position: relative;
}
.row {
    position: absolute;
    left: 0;
    height: var(--grid-row-height);
}
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
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
}
.cell:hover {
    background: var(--table-cell-hover);
}
.cell.number {
    text-align: right;
}
.cell.error {
    color: var(--error-text);
    box-shadow: inset 0 0 0 1px var(--cell-error);
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
