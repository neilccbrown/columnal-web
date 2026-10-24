// Checks that every gui-logic module can be the first one loaded, as test/engine/ModuleLoading.test.ts
// does for the engine (the lexers and savers, for example, import each other).
import { describe, expect, test, vi } from "vitest";

const modules = import.meta.glob(["../../src/gui-logic/**/*.ts"]);

describe("GUI logic modules", () =>
{
    test.each(Object.keys(modules).sort())("%s loads first", async path =>
    {
        vi.resetModules();
        await expect(modules[path]!()).resolves.toBeDefined();
    });
});
