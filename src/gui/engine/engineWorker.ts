// The engine worker's entry point (WorkerTransport starts it): an EngineHost answering the page.
import { EngineHost } from "./EngineHost.js";
import type { FromEngine, ToEngine } from "./protocol.js";

const host = new EngineHost((m: FromEngine) => self.postMessage(m));
self.onmessage = (e: MessageEvent<ToEngine>) => host.receive(e.data);
