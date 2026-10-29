// How components get the engine: App provides it, and components inject it.
import { inject, markRaw, onBeforeUnmount, provide, type InjectionKey } from "vue";
import { EngineTablesStore } from "../store/EngineStore.js";
import { EngineClient } from "./EngineClient.js";
import type { EngineTransport } from "./transports.js";

export interface Engine
{
    readonly client: EngineClient;
    readonly tables: EngineTablesStore;
}

const ENGINE: InjectionKey<Engine> = Symbol("engine");

/** Starts the engine for this component and its descendants, and stops it when it unmounts. */
export function provideEngine(transport: EngineTransport): Engine
{
    const client = markRaw(new EngineClient(transport));
    const engine: Engine = { client, tables: markRaw(new EngineTablesStore(client)) };
    provide(ENGINE, engine);
    onBeforeUnmount(() =>
    {
        engine.tables.stop();
        client.close();
    });
    return engine;
}

export function useEngine(): Engine
{
    const engine = inject(ENGINE);
    if (engine === undefined)
        throw new Error("useEngine() outside App");
    return engine;
}
