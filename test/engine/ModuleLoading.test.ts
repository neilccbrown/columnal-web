// Checks that every engine module can be the first one loaded.  Ported Java classes import
// each other in cycles; with ES modules, a cycle can mean a class is used (for example, as a
// base class) before its module has run, depending on which module is imported first.  See
// "Class hierarchies split across files" in docs/CONVENTIONS.md.
import { describe, expect, test, vi } from "vitest";

const modules = import.meta.glob(["../../src/engine/**/*.ts", "!../../src/engine/parsers/generated/**"]);

// Base classes that construct their subclasses, so must be loaded through their barrel module
// (TypeExps.ts, JellyTypes.ts); the dependency-cruiser rules "via-barrel-*" enforce this.
const LOADED_VIA_BARREL = new Set([
    "../../src/engine/types/typeExp/TypeExp.ts",
    "../../src/engine/types/jellytype/JellyType.ts",
]);

describe("Engine modules", () =>
{
    test.each(Object.keys(modules).filter(p => !LOADED_VIA_BARREL.has(p)).sort())("%s loads first", async path =>
    {
        vi.resetModules();
        await expect(modules[path]!()).resolves.toBeDefined();
    });
});
