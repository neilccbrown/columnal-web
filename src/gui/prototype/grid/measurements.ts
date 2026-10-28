// Grid prototype (Phase 7, throwaway): the measurements that scripts/prototype/measure-grid.mjs and
// profile-grid.mjs run, as window.__proto.
import type { CellPosition } from "../../../engine/data/data/CellPosition.js";
import { VirtualGrid } from "../../../gui-logic/stf/gui/grid/VirtualGrid.js";
import type { GridTableModel } from "./GridTableModel.js";
import { timings } from "./ProtoTableDisplay.js";

export interface MeasuredApp
{
    scroller(): HTMLElement;
    readonly grid: VirtualGrid;
    displays(): readonly GridTableModel[];
    // Whether the engine has finished its work:
    idle(): boolean;
    readonly extra: object;
}

export interface FrameStats
{
    frames: number;
    meanMs: number;
    p95Ms: number;
    maxMs: number;
    over20Ms: number;
    over50Ms: number;
}

export function frameStats(intervals: number[]): FrameStats
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

export function installMeasurements(app: MeasuredApp): void
{
    // Scrolls by (dx, dy) every frame for the given number of frames, and times the frames.
    function scrollBenchmark(dx: number, dy: number, frames: number): Promise<FrameStats>
    {
        const scroller = app.scroller();
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
                    resolve(frameStats(intervals));
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
                quiet = app.idle() ? quiet + 1 : 0;
                if (quiet >= 10 || intervals.length >= maxFrames)
                    resolve(frameStats(intervals));
                else
                    requestAnimationFrame(step);
            };
            requestAnimationFrame(step);
        });
    }

    function tablePosition(name: string): CellPosition | null
    {
        return app.displays().find(d => d.tableName === name)?.getPosition() ?? null;
    }

    function scrollToTable(name: string, row: number): void
    {
        const d = app.displays().find(x => x.tableName === name);
        const scroller = app.scroller();
        if (d !== undefined)
            scroller.scrollTo({ left: app.grid.sumColumnWidths(0, d.getPosition().columnIndex) - 50, top: (d.getPosition().rowIndex + row) * VirtualGrid.rowHeight, behavior: "instant" });
    }

    Object.assign(window, {
        __proto: {
            timings,
            ...app.extra,
            scrollBenchmark,
            framesUntilIdle,
            tablePosition,
            scrollToTable,
            selection: () => app.grid.getSelection()?.toString() ?? null,
            tableLength: (name: string) => app.displays().find(d => d.tableName === name)?.currentKnownRows ?? null,
            domNodes: () => document.querySelectorAll("*").length,
        },
    });
}
