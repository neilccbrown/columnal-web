<script setup lang="ts">
// Java: ImportChoicesDialog's source and preview grids (a VirtualGrid each, with a RecordSetDataDisplay
// and row labels): the table's column names (and, for the preview, types) above its rows, at a cell of
// the grid, with its row numbers just to its left; 100 px columns, 24 px rows.  Only the rows in view
// are made.  The two grids scroll together (Java: ScrollLock.BOTH): scroll is shared.
import { computed, onMounted, shallowRef, useTemplateRef } from "vue";
import type { CellContent } from "../../engine/protocol.js";

export interface GridTable
{
    readonly columns: readonly { readonly name: string, readonly type: string | null }[];
    readonly rows: readonly (readonly CellContent[])[];
}

const props = defineProps<{
    // Null for none (Java: no columns):
    table: GridTable | null,
    // Whether the types show, below the names:
    types: boolean,
    // The grid cell of the table's names (its first column):
    at: { readonly row: number, readonly column: number },
    // The grid's size, in cells:
    extent: { readonly rows: number, readonly columns: number },
}>();
const scroll = defineModel<{ top: number, left: number }>("scroll", { required: true });

const ROW = 24;
const WIDTH = 100;
const pane = useTemplateRef<HTMLDivElement>("pane");
const height = shallowRef(0);

onMounted(() =>
{
    const element = pane.value!;
    height.value = element.clientHeight;
    new ResizeObserver(() => height.value = element.clientHeight).observe(element);
});

const headerRows = computed(() => props.types ? 2 : 1);
const dataTop = computed(() => props.at.row + headerRows.value);
// The data rows in view (with one either side):
const visibleRows = computed(() =>
{
    const rows = props.table?.rows.length ?? 0;
    const first = Math.max(0, Math.floor(scroll.value.top / ROW) - dataTop.value - 1);
    const last = Math.min(rows, Math.ceil((scroll.value.top + height.value) / ROW) - dataTop.value + 1);
    const r: number[] = [];
    for (let i = first; i < last; i++)
        r.push(i);
    return r;
});

function onScroll(): void
{
    const element = pane.value!;
    if (element.scrollTop !== scroll.value.top || element.scrollLeft !== scroll.value.left)
        scroll.value = { top: element.scrollTop, left: element.scrollLeft };
}

// (Following the other grid's scrolling)
function applyScroll(): void
{
    const element = pane.value;
    if (element !== null && (element.scrollTop !== scroll.value.top || element.scrollLeft !== scroll.value.left))
    {
        element.scrollTop = scroll.value.top;
        element.scrollLeft = scroll.value.left;
    }
}

defineExpose({
    pane: () => pane.value,
    applyScroll,
    ROW,
    WIDTH,
});
</script>

<template>
  <div
    ref="pane"
    class="import-grid"
    @scroll.passive="onScroll"
  >
    <div
      class="import-grid-canvas"
      :style="{ width: extent.columns * WIDTH + 'px', height: extent.rows * ROW + 'px' }"
    >
      <template v-if="table !== null">
        <div
          v-for="(c, i) in table.columns"
          :key="'name' + i"
          class="import-grid-cell import-column-name"
          :style="{ left: (at.column + i) * WIDTH + 'px', top: at.row * ROW + 'px' }"
          :title="c.name"
        >
          {{ c.name }}
        </div>
        <template v-if="types">
          <div
            v-for="(c, i) in table.columns"
            :key="'type' + i"
            class="import-grid-cell import-column-type"
            :style="{ left: (at.column + i) * WIDTH + 'px', top: (at.row + 1) * ROW + 'px' }"
            :title="c.type ?? ''"
          >
            {{ c.type }}
          </div>
        </template>
        <template
          v-for="r in visibleRows"
          :key="r"
        >
          <div
            class="import-grid-cell import-row-label"
            :style="{ left: (at.column - 1) * WIDTH + 'px', top: (dataTop + r) * ROW + 'px' }"
          >
            {{ r + 1 }}
          </div>
          <div
            v-for="(cell, i) in table.rows[r]"
            :key="i"
            class="import-grid-cell import-data-cell"
            :class="{ 'has-error': cell.kind !== 'value' }"
            :style="{ left: (at.column + i) * WIDTH + 'px', top: (dataTop + r) * ROW + 'px' }"
          >
            {{ cell.text }}
          </div>
        </template>
      </template>
      <slot />
    </div>
  </div>
</template>

<style scoped>
.import-grid {
    position: relative;
    overflow: auto;
    /* (virtual-grid.scss: the grid's empty background) */
    background: rgb(225 225 225);
}
.import-grid-canvas {
    position: relative;
}
.import-grid-cell {
    position: absolute;
    box-sizing: border-box;
    width: 100px;
    height: 24px;
    padding: 0 3px;
    line-height: 24px;
    overflow: hidden;
    white-space: pre;
    text-overflow: ellipsis;
    border-right: 1px solid var(--table-border-color);
    border-bottom: 1px solid var(--table-border-color);
}
.import-column-name, .import-column-type {
    color: var(--column-header-text-color);
    background: var(--column-header-background-color);
}
.import-column-name {
    font-weight: bold;
}
.import-column-type {
    font-size: 85%;
}
.import-row-label {
    text-align: right;
    color: var(--table-row-label-text-color);
    background: var(--table-row-label-background-color);
}
.import-data-cell {
    background: var(--table-cell);
}
.import-data-cell.has-error {
    color: var(--cell-error);
}
</style>
