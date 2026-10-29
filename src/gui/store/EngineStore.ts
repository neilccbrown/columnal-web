// The engine store adapter (PLAN.md §2b): how the Vue GUI follows changes in the engine.
//
// Engine objects are never made reactive: Vue's proxies would break their #private fields and
// change their identity.  Instead each thing the GUI shows has a version counter, a shallowRef
// that the engine's listeners increment.  A component reads the counter (track()) in a computed
// or render, then reads the engine object directly; when the counter changes, Vue re-runs it.
import { markRaw, shallowRef, type ShallowRef } from "vue";
import type { DataSource } from "../../engine/data/data/DataSource.js";
import type { GridComment } from "../../engine/data/data/GridComment.js";
import type { Table } from "../../engine/data/data/Table.js";
import type { TableManager } from "../../engine/data/data/TableManager.js";
import type { Transformation } from "../../engine/data/data/Transformation.js";
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

/**
 * Follows a TableManager's list of tables and comments.  (Java's View is the TableManagerListener
 * and makes a TableDisplay for each table.)
 */
export class TableManagerStore implements TableManager.TableManagerListener
{
    public readonly tableManager: TableManager;
    // The tables, in the order they were added; a new array (never mutated) on each change:
    public readonly tables: ShallowRef<readonly Table[]> = shallowRef(markRaw([]));
    public readonly comments: ShallowRef<readonly GridComment[]> = shallowRef(markRaw([]));

    public constructor(tableManager: TableManager)
    {
        this.tableManager = markRaw(tableManager);
        tableManager.addListener(this);
        this.tables.value = markRaw([...tableManager.getAllTables()]);
    }

    public removeTable(t: Table, _tablesRemaining: number): void
    {
        this.tables.value = markRaw(this.tables.value.filter(x => x !== t));
    }

    public addSource(dataSource: DataSource): void
    {
        this.addTable(dataSource);
    }

    public addTransformation(transformation: Transformation): void
    {
        this.addTable(transformation);
    }

    private addTable(table: Table): void
    {
        if (!this.tables.value.includes(table))
            this.tables.value = markRaw([...this.tables.value, markRaw(table)]);
    }

    public addComment(gridComment: GridComment): void
    {
        this.comments.value = markRaw([...this.comments.value, markRaw(gridComment)]);
    }

    public removeComment(gridComment: GridComment): void
    {
        this.comments.value = markRaw(this.comments.value.filter(x => x !== gridComment));
    }
}

/**
 * Follows the list of tables in the engine worker, from its events.  (TableManagerStore is the same
 * for an engine in the page.)
 */
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
