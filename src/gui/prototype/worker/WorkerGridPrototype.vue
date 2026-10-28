<script setup lang="ts">
// Worker spike (Phase 7, throwaway): the grid prototype with the engine in a Web Worker
// (engineWorker.ts).  Open /src/gui/prototype/grid/?worker (and &big=N) on the dev server.
import { markRaw, onBeforeUnmount, shallowRef, useTemplateRef, watch } from "vue";
import { CellPosition } from "../../../engine/data/data/CellPosition.js";
import { VirtualGrid } from "../../../gui-logic/stf/gui/grid/VirtualGrid.js";
import { VersionCounter } from "../../store/EngineStore.js";
import GridView from "../grid/GridView.vue";
import { frameStats, installMeasurements } from "../grid/measurements.js";
import { timings } from "../grid/ProtoTableDisplay.js";
import { WorkerClient } from "./WorkerClient.js";
import { WorkerTableDisplay } from "./WorkerTableDisplay.js";

const props = defineProps<{ fileText: string }>();

const client = markRaw(new WorkerClient());
const layout = new VersionCounter();
const grid = markRaw(new VirtualGrid({ createTable: () => {}, pasteIntoEmpty: () => {}, notifyColumnSizeChanged: () => {} }, 10, 20));
const displays = shallowRef<readonly WorkerTableDisplay[]>(markRaw([]));

// The main thread's frames while the worker loads the file, to see whether the page stays responsive:
const loadStart = performance.now();
const loadIntervals: number[] = [];
let lastFrame = -1;
let measuringLoad = true;
const frame = (t: number): void =>
{
    if (lastFrame >= 0)
        loadIntervals.push(t - lastFrame);
    lastFrame = t;
    if (measuringLoad)
        requestAnimationFrame(frame);
};
requestAnimationFrame(frame);

// A replaced table (a new version) takes the place of the old one:
watch(client.tables, tables =>
{
    if (measuringLoad)
    {
        measuringLoad = false;
        const s = frameStats(loadIntervals);
        timings.push({ what: `first tables shown after`, ms: performance.now() - loadStart });
        timings.push({ what: `main thread while loading: ${s.frames} frames, longest`, ms: s.maxMs });
    }
    const old = new Map(displays.value.map(d => [d.info.id, d]));
    const next: WorkerTableDisplay[] = [];
    for (const info of tables)
    {
        const existing = old.get(info.id);
        if (existing !== undefined && existing.info.version === info.version)
        {
            next.push(existing);
            continue;
        }
        const d = markRaw(new WorkerTableDisplay(info, client));
        d.setPosition(existing?.getPosition() ?? new CellPosition(info.row, info.column));
        next.push(d);
    }
    for (const d of displays.value)
        if (!next.includes(d))
            grid.removeGridArea(d);
    const added = next.filter(d => !displays.value.includes(d));
    client.displays.clear();
    for (const d of next)
        client.displays.set(d.info.id, d);
    if (added.length > 0)
        grid.addGridAreas(added);
    displays.value = markRaw(next);
});

client.load(props.fileText);

const shownTimings = shallowRef<readonly { what: string, ms: number }[]>([]);
const timer = setInterval(() =>
{
    if (shownTimings.value.length !== timings.length)
        shownTimings.value = [...timings];
}, 250);
onBeforeUnmount(() => clearInterval(timer));

const gridView = useTemplateRef<InstanceType<typeof GridView>>("gridView");
installMeasurements({
    scroller: () => gridView.value!.scroller()!,
    grid,
    displays: () => displays.value,
    idle: () => client.outstanding === 0,
    extra: { fetchTime: client.fetchTime },
});
</script>

<template>
  <div class="prototype">
    <aside class="timings">
      <strong>Grid prototype (engine in a worker)</strong>
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
