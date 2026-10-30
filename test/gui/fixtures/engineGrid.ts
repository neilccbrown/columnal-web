// Renders the grid (EngineGrid) with its own engine (in the page), and loads a saved file into it.
import { vi } from "vitest";
import { cleanup, render } from "vitest-browser-vue";
import { defineComponent, h, ref } from "vue";
import { InPageTransport } from "../../../src/gui/engine/transports.js";
import { provideEngine, type Engine } from "../../../src/gui/engine/useEngine.js";
import EngineGrid from "../../../src/gui/grid/EngineGrid.vue";

export async function renderEngineGrid(file: string, width = 810, height = 600)
{
    let engine: Engine | null = null;
    const transport = new InPageTransport();
    const gridRef = ref<InstanceType<typeof EngineGrid> | null>(null);
    render(defineComponent(() =>
    {
        engine = provideEngine(transport);
        return () => h(EngineGrid, { ref: gridRef, style: `width: ${width}px; height: ${height}px` });
    }));
    const loaded = engine!;
    await loaded.client.request("load", file);
    await loaded.client.whenIdle();
    const grid = gridRef.value!;
    // Each table's length has arrived:
    await vi.waitUntil(() => grid.displays().length > 0 && grid.displays().every(d => d.info.error !== null || d.getBottomRightIncl().rowIndex > d.getPosition().rowIndex));
    return { grid, scroller: grid.scroller()!, engine: loaded, host: transport.host, // (Within a property, each trial's grid goes before the next)
        unmount: () => cleanup() };
}
