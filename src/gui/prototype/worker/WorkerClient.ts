// Worker spike (Phase 7, throwaway): the GUI's side of the engine worker: sends requests, and
// hands the replies to the tables that asked.
import { markRaw, shallowRef, type ShallowRef } from "vue";
import { timings } from "../grid/ProtoTableDisplay.js";
import type { FromWorker, TableInfo, ToWorker } from "./messages.js";
import type { WorkerTableDisplay } from "./WorkerTableDisplay.js";

export class WorkerClient
{
    private readonly worker = new Worker(new URL("./engineWorker.ts", import.meta.url), { type: "module" });
    // The latest list of tables from the worker:
    public readonly tables: ShallowRef<readonly TableInfo[]> = shallowRef(markRaw([]));
    // The displays, by table id and version, which replies are for:
    public readonly displays = new Map<string, WorkerTableDisplay>();
    private readonly lengthCallbacks = new Map<string, (length: number) => void>();
    private readonly editCallbacks = new Map<number, (error: string | null) => void>();
    private nextRequestId = 0;
    // Requests sent and not yet answered (for the measurements' "idle"):
    public outstanding = 0;
    public readonly fetchTime = { ms: 0, cells: 0, roundTripMs: 0, requests: 0 };
    private readonly sentAt = new Map<string, number>();

    public constructor()
    {
        this.worker.onmessage = (e: MessageEvent<FromWorker>) => this.receive(e.data);
    }

    private send(m: ToWorker): void
    {
        if (m.kind !== "load")
            this.outstanding++;
        this.worker.postMessage(m);
    }

    public load(text: string): void
    {
        this.send({ kind: "load", text });
    }

    public requestLength(info: TableInfo, callback: (length: number) => void): void
    {
        this.lengthCallbacks.set(info.id + "@" + info.version, callback);
        this.send({ kind: "length", id: info.id, version: info.version });
    }

    public requestRows(info: TableInfo, firstRow: number, lastRowExcl: number): void
    {
        this.sentAt.set(`${info.id}@${info.version}@${firstRow}`, performance.now());
        this.send({ kind: "fetch", id: info.id, version: info.version, firstRow, lastRowExcl });
    }

    public edit(info: TableInfo, row: number, column: number, text: string): Promise<string | null>
    {
        const requestId = this.nextRequestId++;
        return new Promise(resolve =>
        {
            this.editCallbacks.set(requestId, resolve);
            // (Outstanding until the re-run's list of tables arrives too)
            this.outstanding++;
            this.send({ kind: "edit", id: info.id, version: info.version, row, column, text, requestId });
        });
    }

    private receive(m: FromWorker): void
    {
        if (m.kind !== "tables" || m.what.startsWith("re-run"))
            this.outstanding--;
        switch (m.kind)
        {
            case "tables":
                timings.push({ what: m.what, ms: m.ms });
                this.tables.value = markRaw(m.tables);
                break;
            case "length":
                timings.push({ what: `length of ${m.id} (in worker)`, ms: m.ms });
                this.lengthCallbacks.get(m.id + "@" + m.version)?.(m.length);
                break;
            case "cells":
            case "dropped":
            {
                const key = `${m.id}@${m.version}@${m.firstRow}`;
                if (m.kind === "cells")
                {
                    this.fetchTime.ms += m.ms;
                    this.fetchTime.cells += m.cells.length * (m.cells[0]?.length ?? 0);
                    this.fetchTime.roundTripMs += performance.now() - (this.sentAt.get(key) ?? performance.now());
                    this.fetchTime.requests++;
                }
                this.sentAt.delete(key);
                const d = this.displays.get(m.id);
                if (d !== undefined && d.info.version === m.version)
                    d.received(m.firstRow, m.kind === "cells" ? m.cells : null);
                break;
            }
            case "edited":
                timings.push({ what: "store edited value (in worker)", ms: m.ms });
                if (m.error !== null)
                    this.outstanding--; // (No re-run follows)
                this.editCallbacks.get(m.requestId)?.(m.error);
                this.editCallbacks.delete(m.requestId);
                break;
        }
    }
}
