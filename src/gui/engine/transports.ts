// How messages get between the GUI's EngineClient and the EngineHost: through the engine worker, or
// (for GUI tests) within the page.
import { EngineHost } from "./EngineHost.js";
import type { FromEngine, ToEngine } from "./protocol.js";

export interface EngineTransport
{
    send(m: ToEngine): void;
    // Set by the client, to receive the engine's messages:
    onReceive: ((m: FromEngine) => void) | null;
    close(): void;
}

/** The engine in a Web Worker (engineWorker.ts): the app's transport. */
export class WorkerTransport implements EngineTransport
{
    private readonly worker = new Worker(new URL("./engineWorker.ts", import.meta.url), { type: "module" });
    public onReceive: ((m: FromEngine) => void) | null = null;

    public constructor()
    {
        this.worker.onmessage = (e: MessageEvent<FromEngine>) => this.onReceive?.(e.data);
        this.worker.onerror = e => console.error("Engine worker error: " + e.message);
    }

    public send(m: ToEngine): void
    {
        this.worker.postMessage(m);
    }

    public close(): void
    {
        this.worker.terminate();
    }
}

/**
 * The engine in the page, for GUI tests, which can read the engine's objects through `host` (as
 * Java's GUI tests did).  Messages are copied with structuredClone and delivered in a later task,
 * as a worker's are, so whatever couldn't be sent to a worker fails here too.
 */
export class InPageTransport implements EngineTransport
{
    public readonly host: EngineHost;
    public onReceive: ((m: FromEngine) => void) | null = null;
    private closed = false;

    public constructor()
    {
        this.host = new EngineHost(m => this.deliver(() => this.onReceive?.(structuredClone(m))));
    }

    public send(m: ToEngine): void
    {
        const copy = structuredClone(m);
        this.deliver(() => this.host.receive(copy));
    }

    private deliver(f: () => void): void
    {
        setTimeout(() =>
        {
            if (!this.closed)
                f();
        }, 0);
    }

    public close(): void
    {
        this.closed = true;
    }
}
