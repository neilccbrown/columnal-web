<script setup lang="ts">
// Grid prototype (Phase 7, throwaway): loads a saved file into the engine and shows its tables on
// the grid, with a panel of timings.  Open /src/gui/prototype/grid/ on the dev server, which shows
// the golden file input-01.rec; ?big=N adds a data table of N rows (and a Calculate on it).
// window.__proto has the measurements that scripts/prototype/measure-grid.mjs runs.
import { markRaw, onBeforeUnmount, shallowRef, useTemplateRef, watch } from "vue";
import type { CellPosition } from "../../../engine/data/data/CellPosition.js";
import { TableManager } from "../../../engine/data/data/TableManager.js";
import { Workers } from "../../../engine/utility/utility/Workers.js";
import { TransformationManager } from "../../../engine/transformations/transformations/TransformationManager.js";
import { VirtualGrid } from "../../../gui-logic/stf/gui/grid/VirtualGrid.js";
import { TableManagerStore, VersionCounter } from "../../store/EngineStore.js";
import GridView from "./GridView.vue";
import { fetchTime, ProtoTableDisplay, timings } from "./ProtoTableDisplay.js";
import type { GridPrototypeApp } from "./GridPrototypeApp.js";

const props = defineProps<{
    // The saved file to show:
    fileText: string,
    // For tests: called once the file is loaded.
    onReady?: (app: GridPrototypeApp) => void,
}>();

const fileText = props.fileText;

const tableManager = markRaw(new TableManager(TransformationManager.getInstance(), { getHandledContent: () => new Map() }));
const store = new TableManagerStore(tableManager);
const layout = new VersionCounter();
const grid = markRaw(new VirtualGrid({
    createTable: () => {},
    pasteIntoEmpty: () => {},
    notifyColumnSizeChanged: () => {},
}, 10, 20));

const displays = shallowRef<readonly ProtoTableDisplay[]>(markRaw([]));
// Java: View's TableManagerListener makes a TableDisplay for each new table and removes the old:
watch(store.tables, tables =>
{
    const t0 = performance.now();
    const existing = new Map(displays.value.map(d => [d.table, d]));
    const removed = displays.value.filter(d => !tables.includes(d.table));
    for (const d of removed)
        grid.removeGridArea(d);
    const next = tables.map(t => existing.get(t) ?? markRaw(new ProtoTableDisplay(t)));
    const added = next.filter(d => !existing.has(d.table));
    if (added.length > 0)
        grid.addGridAreas(added);
    displays.value = markRaw(next);
    timings.push({ what: `make displays (${added.length} added, ${removed.length} removed)`, ms: performance.now() - t0 });
}, { immediate: true });

const start = performance.now();
const loaded = tableManager.loadAll(fileText, () => {});
timings.push({ what: "load file", ms: performance.now() - start });
for (const e of loaded.errors)
    console.error(e.toPlain());
props.onReady?.({ tableManager, grid, displays: () => displays.value });

// The timings panel:
const shownTimings = shallowRef<readonly { what: string, ms: number }[]>([]);
const timer = setInterval(() =>
{
    if (shownTimings.value.length !== timings.length)
        shownTimings.value = [...timings];
}, 250);
onBeforeUnmount(() => clearInterval(timer));

const gridView = useTemplateRef<InstanceType<typeof GridView>>("gridView");

// --- Measurements, for scripts/prototype/measure-grid.ts -----------------------------------------

interface FrameStats
{
    frames: number;
    meanMs: number;
    p95Ms: number;
    maxMs: number;
    over20Ms: number;
    over50Ms: number;
}

function stats(intervals: number[]): FrameStats
{
    const sorted = [...intervals].sort((a, b) => a - b);
    return {
        frames: sorted.length,
        meanMs: sorted.reduce((a, b) => a + b, 0) / Math.max(1, sorted.length),
        p95Ms: sorted[Math.floor(sorted.length * 0.95)] ?? 0,
        maxMs: sorted.at(-1) ?? 0,
        over20Ms: sorted.filter(x => x > 20).length,
        over50Ms: sorted.filter(x => x > 50).length,
    };
}

// Scrolls by (dx, dy) every frame for the given number of frames, and times the frames.
function scrollBenchmark(dx: number, dy: number, frames: number): Promise<FrameStats>
{
    const scroller = gridView.value!.scroller()!;
    return new Promise(resolve =>
    {
        const intervals: number[] = [];
        let last = -1;
        let n = 0;
        const step = (t: number): void =>
        {
            if (last >= 0)
                intervals.push(t - last);
            last = t;
            if (n++ >= frames)
            {
                resolve(stats(intervals));
                return;
            }
            scroller.scrollBy(dx, dy);
            requestAnimationFrame(step);
        };
        requestAnimationFrame(step);
    });
}

// Times each frame until the engine's work queue and the render have settled:
function framesUntilIdle(maxFrames: number): Promise<FrameStats>
{
    return new Promise(resolve =>
    {
        const intervals: number[] = [];
        let last = -1;
        let quiet = 0;
        const step = (t: number): void =>
        {
            if (last >= 0)
                intervals.push(t - last);
            last = t;
            quiet = workQueueIdle() ? quiet + 1 : 0;
            if (quiet >= 10 || intervals.length >= maxFrames)
                resolve(stats(intervals));
            else
                requestAnimationFrame(step);
        };
        requestAnimationFrame(step);
    });
}

function workQueueIdle(): boolean
{
    return Workers.getTaskList().length === 0;
}

function tablePosition(name: string): CellPosition | null
{
    return displays.value.find(d => d.table.getId().getRaw() === name)?.getPosition() ?? null;
}

function scrollToTable(name: string, row: number): void
{
    const d = displays.value.find(x => x.table.getId().getRaw() === name);
    const scroller = gridView.value!.scroller()!;
    if (d !== undefined)
        scroller.scrollTo({ left: grid.sumColumnWidths(0, d.getPosition().columnIndex) - 50, top: (d.getPosition().rowIndex + row) * VirtualGrid.rowHeight, behavior: "instant" });
}

Object.assign(window, {
    __proto: {
        timings,
        fetchTime,
        scrollBenchmark,
        framesUntilIdle,
        tablePosition,
        scrollToTable,
        selection: () => grid.getSelection()?.toString() ?? null,
        tableLength: (name: string) => displays.value.find(d => d.table.getId().getRaw() === name)?.currentKnownRows ?? null,
        domNodes: () => document.querySelectorAll("*").length,
    },
});
</script>

<template>
  <div class="prototype">
    <aside class="timings">
      <strong>Grid prototype</strong>
      <span
        v-for="(t, i) in shownTimings"
        :key="i"
      >{{ t.what }}: {{ t.ms.toFixed(0) }} ms</span>
    </aside>
    <GridView
      ref="gridView"
      class="grid"
      :grid="grid"
      :displays="displays"
      :layout="layout"
      :table-manager="tableManager"
    />
  </div>
</template>

<style>
@import "../../styles/fonts.css";
@import "../../styles/tokens.css";

html, body, #app {
    height: 100%;
    margin: 0;
}
body {
    font-family: var(--font-main);
    font-size: var(--font-size-main);
    color: var(--text-color);
}
</style>

<style scoped>
.prototype {
    display: flex;
    flex-direction: column;
    height: 100%;
}
.timings {
    display: flex;
    flex-wrap: wrap;
    gap: 4px 16px;
    padding: 4px 8px;
    font-size: 12px;
    background: var(--status-bar-background);
    border-bottom: 1px solid var(--status-bar-border);
}
.grid {
    flex: 1;
    min-height: 0;
}
</style>
