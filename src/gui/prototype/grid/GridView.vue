<script setup lang="ts">
// Grid prototype (Phase 7, throwaway): the table canvas (Java: VirtualGrid's node), on one native
// scroll container.  The ported VirtualGrid (src/gui-logic) holds the layout, column widths and
// selection, and moves the selection with the keyboard; this shows it, and is its Display.
import { computed, nextTick, onBeforeUnmount, onMounted, provide, shallowRef, useTemplateRef } from "vue";
import { CellPosition } from "../../../engine/data/data/CellPosition.js";
import type { TableManager } from "../../../engine/data/data/TableManager.js";
import { ParseProgress } from "../../../engine/utility/utility/ParseProgress.js";
import { Workers } from "../../../engine/utility/utility/Workers.js";
import { Either } from "../../../engine/utility-adt/utility/adt/Either.js";
import { Pair } from "../../../engine/utility-adt/utility/adt/Pair.js";
import { TableDisplayUtility } from "../../../gui-logic/stf/gui/dtf/TableDisplayUtility.js";
import { VirtualGrid } from "../../../gui-logic/stf/gui/grid/VirtualGrid.js";
import { VersionCounter } from "../../store/EngineStore.js";
import GridTable from "./GridTable.vue";
import type { ProtoTableDisplay } from "./ProtoTableDisplay.js";
import { timings } from "./ProtoTableDisplay.js";
import { VIEWPORT } from "./viewport.js";

const props = defineProps<{
    grid: VirtualGrid,
    displays: readonly ProtoTableDisplay[],
    layout: VersionCounter,
    tableManager: TableManager,
}>();

const ROW = VirtualGrid.rowHeight;
const scroller = useTemplateRef<HTMLDivElement>("scroller");
const canvas = useTemplateRef<HTMLDivElement>("canvas");
const scrollTop = shallowRef(0);
const scrollLeft = shallowRef(0);
const viewWidth = shallowRef(0);
const viewHeight = shallowRef(0);
provide(VIEWPORT, { scrollTop, scrollLeft, viewWidth, viewHeight });

const selectionVersion = new VersionCounter();
props.grid.addSelectionListener(() =>
{
    selectionVersion.bump();
    return new Pair(VirtualGrid.ListenerOutcome.KEEP, null);
});

function colLeft(column: number): number
{
    return props.grid.sumColumnWidths(0, column);
}

// The column containing x (beyond the grid's columns, the columns have the default width):
function colAt(x: number): number
{
    let lo = 0;
    let hi = Math.max(1, props.grid.getCurrentColumns());
    if (x >= colLeft(hi))
        return hi + Math.floor((x - colLeft(hi)) / 100);
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
    props.layout.track();
    const columns = props.grid.getCurrentColumns();
    return {
        width: Math.max(colLeft(columns), viewWidth.value + scrollLeft.value),
        height: Math.max((props.grid.getCurrentKnownLastRowIncl() + 1) * ROW, viewHeight.value),
    };
});

// The vertical grid lines in view (the horizontal ones are the canvas's background):
const firstLineColumn = computed(() => { props.layout.track(); return colAt(scrollLeft.value); });
const lastLineColumn = computed(() => { props.layout.track(); return colAt(scrollLeft.value + viewWidth.value) + 1; });
const verticalLines = computed(() =>
{
    props.layout.track();
    const xs: number[] = [];
    for (let c = firstLineColumn.value; c <= lastLineColumn.value; c++)
        xs.push(colLeft(c) - 1);
    return xs;
});

const selectionRect = computed(() =>
{
    props.layout.track();
    selectionVersion.track();
    const sel = props.grid.getSelection();
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

// --- The cell editor ---------------------------------------------------------------------------

interface Editing
{
    readonly display: ProtoTableDisplay;
    readonly row: number;
    readonly column: number;
    readonly position: CellPosition;
    readonly initialText: string;
    error: string | null;
}
const editing = shallowRef<Editing | null>(null);
const editorInput = useTemplateRef<HTMLInputElement>("editorInput");

function findDisplay(pos: CellPosition): ProtoTableDisplay | null
{
    return props.displays.find(d => d.contains(pos)) ?? null;
}

function startEdit(pos: CellPosition, character: string | null): void
{
    const display = findDisplay(pos);
    if (display === null || !display.editable)
        return;
    const row = display.dataRowAt(pos.rowIndex);
    const column = pos.columnIndex - display.getPosition().columnIndex;
    if (row === null || column < 0 || column >= display.columns.length)
        return;
    editing.value = { display, row, column, position: pos, initialText: character ?? display.getCell(row, column).text, error: null };
    void nextTick(() =>
    {
        const input = editorInput.value;
        if (input !== null)
        {
            input.focus();
            if (character === null)
                input.select();
        }
    });
}

const editorStyle = computed(() =>
{
    const e = editing.value;
    if (e === null)
        return {};
    props.layout.track();
    const left = colLeft(e.position.columnIndex);
    return {
        left: left + "px",
        top: e.position.rowIndex * ROW + "px",
        width: colLeft(e.position.columnIndex + 1) - left + "px",
    };
});

function commitEdit(moveDown: boolean): void
{
    const e = editing.value;
    const input = editorInput.value;
    if (e === null || input === null)
        return;
    const start = performance.now();
    const type = e.display.columns[e.column]!.getType().getType();
    const recogniser = TableDisplayUtility.recogniser(type, true).recogniser;
    const result = recogniser.process(ParseProgress.fromStart(input.value), false).flatMap(s => s.requireEnd());
    if (result.isLeft())
    {
        editing.value = { ...e, error: result.getLeft("error").error.toPlain() };
        return;
    }
    e.display.storeValue(e.row, e.column, result.getRight("value").value);
    editing.value = null;
    const table = e.display.table;
    // Java: TableDisplay's onModify re-runs the dependent tables on the worker queue:
    Workers.onWorkerThread("Updating dependents", Workers.Priority.FETCH, () =>
    {
        const reRunStart = performance.now();
        props.tableManager.reRun(table);
        timings.push({ what: "reRun after edit", ms: performance.now() - reRunStart });
    });
    timings.push({ what: "store edited value", ms: performance.now() - start });
    scroller.value?.focus({ preventScroll: true });
    // Java: Enter selects the cell below
    if (moveDown)
        props.grid.move(false, 1, 0);
}

function cancelEdit(): void
{
    editing.value = null;
    scroller.value?.focus({ preventScroll: true });
}

function onEditorKeyDown(e: KeyboardEvent): void
{
    if (e.key === "Enter")
    {
        commitEdit(true);
        e.preventDefault();
    }
    else if (e.key === "Escape")
    {
        cancelEdit();
        e.preventDefault();
    }
    e.stopPropagation();
}

// --- VirtualGrid's Display -----------------------------------------------------------------------

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
    if (left !== s.scrollLeft || top !== s.scrollTop)
        s.scrollTo({ left, top, behavior: "instant" });
}

const display: VirtualGrid.Display = {
    getHeight: () => scroller.value?.clientHeight ?? 0,
    smoothScrollToEnsureVisible: ensureVisible,
    redoLayout: () => { props.layout.bump(); return null; },
    sizesOrPositionsChanged: () => props.layout.bump(),
    requestFocus: () => scroller.value?.focus({ preventScroll: true }),
    keyboardActivate: pos => startEdit(pos, null),
    startEditing: (pos, character) => startEdit(pos, character),
};

// --- Events ------------------------------------------------------------------------------------

function onScroll(): void
{
    const s = scroller.value!;
    scrollTop.value = s.scrollTop;
    scrollLeft.value = s.scrollLeft;
    props.grid.setLogicalScrollRow(Math.floor(s.scrollTop / ROW));
}

function onKeyDown(e: KeyboardEvent): void
{
    const grid = props.grid;
    const shortcut = e.ctrlKey || e.metaKey;
    switch (e.key)
    {
        case "ArrowUp": grid.move(e.shiftKey, -1, 0); break;
        case "ArrowDown": grid.move(e.shiftKey, 1, 0); break;
        case "ArrowLeft": grid.move(e.shiftKey, 0, -1); break;
        case "ArrowRight": grid.move(e.shiftKey, 0, 1); break;
        case "PageUp": grid.move(e.shiftKey, -grid.calcPageHeight(), 0); break;
        case "PageDown": grid.move(e.shiftKey, grid.calcPageHeight(), 0); break;
        case "Home":
            if (shortcut)
                grid.ctrlHome();
            else
                grid.home(e.shiftKey);
            break;
        case "End": grid.end(e.shiftKey); break;
        case "Enter": case " ": grid.activateSelection(); break;
        case "Delete": case "Backspace": grid.deleteSelection(); break;
        default:
            if ([...e.key].length === 1 && !shortcut && !e.altKey)
                grid.typed(e.key);
            else
                return;
    }
    e.preventDefault();
}

function onMouseDown(e: MouseEvent): void
{
    if (e.button !== 0 || (e.target as HTMLElement).closest(".cell-editor, .resize-handle") !== null)
        return;
    if (editing.value !== null)
        commitEdit(false);
    const rect = canvas.value!.getBoundingClientRect();
    const x = e.clientX - rect.left;
    let row = Math.floor((e.clientY - rect.top) / ROW);
    // A floating column name is shown below its grid row:
    const tableElement = (e.target as HTMLElement).closest(".column-names")?.parentElement;
    if (tableElement !== undefined && tableElement !== null)
        row = Math.round(tableElement.offsetTop / ROW) + 1;
    const pos = new CellPosition(row, colAt(x));
    const sel = props.grid.getSelection();
    if (e.shiftKey && sel !== null)
    {
        const extended = sel.extendTo(pos);
        if (extended !== null)
        {
            props.grid.select(extended);
            e.preventDefault();
            return;
        }
    }
    props.grid.findAndSelect(Either.left(pos));
    e.preventDefault();
}

function onDoubleClick(): void
{
    props.grid.activateSelection();
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
    resizeObserver?.disconnect();
    props.grid.setDisplay(null);
});

defineExpose({ scroller: () => scroller.value });
</script>

<template>
  <div
    ref="scroller"
    class="grid-scroller"
    tabindex="0"
    data-testid="grid"
    @scroll.passive="onScroll"
    @keydown="onKeyDown"
    @mousedown="onMouseDown"
    @dblclick="onDoubleClick"
    @focusout="(e: FocusEvent) => { if (!scroller?.contains(e.relatedTarget as Node | null)) grid.focusLost(); }"
  >
    <div
      ref="canvas"
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
      <GridTable
        v-for="d in displays"
        :key="d.getSortKey()"
        :display="d"
        :grid="grid"
        :layout="layout"
      />
      <div
        v-if="selectionRect !== null"
        class="grid-selection"
        :style="selectionRect"
      />
      <input
        v-if="editing !== null"
        ref="editorInput"
        class="cell-editor"
        :class="{ 'has-error': editing.error !== null }"
        :style="editorStyle"
        :value="editing.initialText"
        :title="editing.error ?? ''"
        @keydown="onEditorKeyDown"
        @blur="commitEdit(false)"
      >
    </div>
  </div>
</template>

<style scoped>
.grid-scroller {
    position: relative;
    overflow: auto;
    outline: none;
    background: var(--table-empty-background);
}
.grid-canvas {
    position: relative;
    /* The horizontal grid lines: */
    background-image: linear-gradient(to bottom, transparent calc(var(--grid-row-height) - 1px), var(--table-divider) calc(var(--grid-row-height) - 1px));
    background-size: 100% var(--grid-row-height);
}
.grid-vlines {
    position: sticky;
    top: 0;
    left: 0;
}
.grid-vline {
    position: absolute;
    top: 0;
    width: 1px;
    height: 100%;
    background: var(--table-divider);
}
.grid-selection {
    position: absolute;
    z-index: 5;
    pointer-events: none;
    outline: 3px solid var(--focus-color);
}
.cell-editor {
    position: absolute;
    z-index: 6;
    height: var(--grid-row-height);
    box-sizing: border-box;
    margin: 0;
    padding: 0 2px;
    border: none;
    outline: 2px solid var(--focus-color);
    font: inherit;
    background: var(--table-cell-editing);
}
.cell-editor.has-error {
    outline-color: var(--editor-error-stroke);
}
</style>
