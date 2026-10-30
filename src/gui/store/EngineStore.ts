// The engine store adapter (PLAN.md §2b): how the Vue GUI follows changes in the engine.
//
// The engine runs in a worker; what the GUI keeps from it (tables' information, rows of cells) is held
// in plain objects that aren't made reactive.  Instead each thing the GUI shows has a version counter,
// a shallowRef bumped when the engine's events or replies change it.  A component reads the counter
// (track()) in a computed or render, then reads the object directly; when the counter changes, Vue
// re-runs it.
import { markRaw, shallowRef, type ShallowRef } from "vue";
import type { EngineClient } from "../engine/EngineClient.js";
import type { TableInfo } from "../engine/protocol.js";

/** A counter that the engine increments when something changes, and the GUI reads to follow it. */
export class VersionCounter
{
    private readonly version: ShallowRef<number> = shallowRef(0);

    /** Called by engine listeners: everything that read track() is updated. */
    public bump(): void
    {
        this.version.value++;
    }

    /** Called in a computed or render, to be re-run after bump(). */
    public track(): number
    {
        return this.version.value;
    }
}

/** Follows the list of tables in the engine worker, from its events. */
export class EngineTablesStore
{
    // The tables, in the engine's order; a new array (never mutated) on each change:
    public readonly tables: ShallowRef<readonly TableInfo[]> = shallowRef(markRaw([]));
    public readonly stop: () => void;

    public constructor(client: EngineClient)
    {
        this.stop = client.listen(event =>
        {
            if (event.kind === "tables")
                this.tables.value = markRaw(event.tables);
        });
    }
}
