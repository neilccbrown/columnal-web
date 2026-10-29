// The GUI's side of the GUI–engine messages (protocol.ts): makes requests, which resolve with the
// engine's replies, and passes the engine's events to listeners.
import type { EngineApi, EngineError, EngineEvent, EngineMethod, FromEngine } from "./protocol.js";
import type { EngineTransport } from "./transports.js";

type Reply<M extends EngineMethod> = Awaited<ReturnType<EngineApi[M]>>;

/** An exception thrown in the engine, rethrown in the GUI. */
export class EngineRequestError extends Error
{
    public readonly engineStack: string | null;

    public constructor(method: EngineMethod, error: EngineError)
    {
        super(`Engine request ${method} failed: ${error.name}: ${error.message}`);
        this.name = "EngineRequestError";
        this.engineStack = error.stack;
    }
}

export class EngineClient
{
    private readonly transport: EngineTransport;
    private nextRequestId = 0;
    private readonly waiting = new Map<number, { readonly method: EngineMethod, readonly resolve: (value: unknown) => void, readonly reject: (e: Error) => void }>();
    private readonly listeners = new Set<(event: EngineEvent) => void>();

    public constructor(transport: EngineTransport)
    {
        this.transport = transport;
        transport.onReceive = m => this.receive(m);
    }

    public request<M extends EngineMethod>(method: M, ...args: Parameters<EngineApi[M]>): Promise<Reply<M>>
    {
        const requestId = this.nextRequestId++;
        return new Promise<Reply<M>>((resolve, reject) =>
        {
            this.waiting.set(requestId, { method, resolve: resolve as (value: unknown) => void, reject });
            this.transport.send({ kind: "request", requestId, method, args });
        });
    }

    /** Listens to the engine's events; returns a function to stop. */
    public listen(listener: (event: EngineEvent) => void): () => void
    {
        this.listeners.add(listener);
        return () => this.listeners.delete(listener);
    }

    /** Resolves once every request so far is answered and the engine has no work waiting. */
    public async whenIdle(): Promise<void>
    {
        await this.request("idle");
    }

    public close(): void
    {
        this.transport.close();
        for (const w of this.waiting.values())
            w.reject(new Error("Engine closed before answering " + w.method));
        this.waiting.clear();
    }

    private receive(m: FromEngine): void
    {
        if (m.kind === "event")
        {
            for (const listener of [...this.listeners])
                listener(m.event);
            return;
        }
        const w = this.waiting.get(m.requestId);
        if (w === undefined)
            return;
        this.waiting.delete(m.requestId);
        if (m.ok)
            w.resolve(m.value);
        else
            w.reject(new EngineRequestError(w.method, m.error));
    }
}
