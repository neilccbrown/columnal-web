// The GUI–engine messages (src/gui/engine): requests, replies and events, through both transports.
import { afterEach, describe, expect, it } from "vitest";
import { EngineClient, EngineRequestError } from "../../../src/gui/engine/EngineClient.js";
import type { EngineEvent, EngineMethod, TableInfo } from "../../../src/gui/engine/protocol.js";
import { InPageTransport, WorkerTransport, type EngineTransport } from "../../../src/gui/engine/transports.js";
import { GRID_FIXTURE } from "../fixtures/gridFixture.js";

let client: EngineClient | null = null;

function start(transport: EngineTransport): { client: EngineClient, tables: () => readonly TableInfo[] }
{
    const c = new EngineClient(transport);
    client = c;
    let tables: readonly TableInfo[] = [];
    c.listen((e: EngineEvent) => { tables = e.tables; });
    return { client: c, tables: () => tables };
}

afterEach(() =>
{
    client?.close();
    client = null;
});

function table(tables: readonly TableInfo[], id: string): TableInfo
{
    const t = tables.find(t => t.id === id);
    expect(t, "table " + id).toBeDefined();
    return t!;
}

describe("in the page", () =>
{
    it("loads, describes the tables, and gives their rows", async () =>
    {
        const transport = new InPageTransport();
        const { client, tables } = start(transport);
        expect(await client.request("load", GRID_FIXTURE)).toEqual([]);
        await client.whenIdle();

        const t = table(tables(), "T");
        expect(t).toMatchObject({ kind: "data", column: 1, row: 1, columnNames: ["N", "Name"], error: null });
        const c = table(tables(), "C");
        expect(c).toMatchObject({ kind: "transformation", column: 4, row: 1, columnNames: ["N", "Name", "Double"] });

        expect(await client.request("length", c.id, c.version)).toBe(3);
        const rows = await client.request("rows", c.id, c.version, 0, 3);
        expect(rows?.map(r => r[2]!.text)).toEqual(["2", "5", "-6"]);
        expect(rows?.[0]![1]).toEqual({ text: "a", kind: "text" });

        // Tests can read the engine's objects directly:
        expect(transport.host.tableManager.getAllTables().map(t => t.getId().getRaw()).sort()).toEqual(["C", "T"]);
    });

    it("saves what it loaded", async () =>
    {
        const { client } = start(new InPageTransport());
        await client.request("load", GRID_FIXTURE);
        const saved = await client.request("save");
        expect(saved).toContain("CALCULATE Double @EXPRESSION");
        expect(saved).toContain("POSITION 4 1");
    });

    it("answers nothing for a replaced table, and skips old rows requests", async () =>
    {
        const { client, tables } = start(new InPageTransport());
        await client.request("load", GRID_FIXTURE);
        await client.whenIdle();
        const t = table(tables(), "T");
        expect(await client.request("length", t.id, t.version + 1000)).toBeNull();
        // Only the newest two requests for a table are done:
        const answers = await Promise.all([0, 1, 2].map(r => client.request("rows", t.id, t.version, r, r + 1)));
        expect(answers.map(a => a?.[0]![0]!.text ?? null)).toEqual([null, "2.5", "-3"]);
    });

    it("reports load errors and failed requests", async () =>
    {
        const { client } = start(new InPageTransport());
        await expect(client.request("load", "not a Columnal file")).rejects.toBeInstanceOf(EngineRequestError);
        await expect(client.request("receive" as EngineMethod as "save")).rejects.toThrow("Unknown engine request: receive");
    });
});

describe("in the worker", () =>
{
    it("loads and gives rows", async () =>
    {
        const { client, tables } = start(new WorkerTransport());
        expect(await client.request("load", GRID_FIXTURE)).toEqual([]);
        await client.whenIdle();
        const c = table(tables(), "C");
        const rows = await client.request("rows", c.id, c.version, 0, 3);
        expect(rows?.map(r => r[2]!.text)).toEqual(["2", "5", "-6"]);
    });
});
