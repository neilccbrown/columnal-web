import { describe, expect, test } from "vitest";
import { javaEquals } from "../../../src/engine/java/JavaObject.js";
import { ComparableEither } from "../../../src/engine/utility-adt/utility/adt/ComparableEither.js";
import { Either } from "../../../src/engine/utility-adt/utility/adt/Either.js";
import { Pair } from "../../../src/engine/utility-adt/utility/adt/Pair.js";
import { InternalException } from "../../../src/engine/utility-error/error/InternalException.js";

describe("Either and Pair", () =>
{
    test("either, map and flatMap", () =>
    {
        const r = Either.right<string, number>(2);
        const l = Either.left<string, number>("err");
        expect(r.map(x => x * 10).either(e => e, x => String(x))).toBe("20");
        expect(l.map(x => x * 10).either(e => e, x => String(x))).toBe("err");
        expect(r.flatMap(x => Either.left<string, number>("bad" + x)).isLeft()).toBe(true);
        expect(() => r.getLeft("no left")).toThrow(InternalException);
        expect(r.leftToNull()).toBe(2);
    });

    test("mapM stops at the first Left; combineConcatError joins errors", () =>
    {
        expect(Either.mapM([1, 2, 3], x => x < 3 ? Either.right<string, number>(x) : Either.left<string, number>("three")).either(e => e, xs => xs.join())).toBe("three");
        expect(Either.mapM([1, 2], x => Either.right<string, number>(x * 2)).either(e => e, xs => xs.join())).toBe("2,4");
        const combined = Either.combineConcatError(Either.left<string[], number>(["a"]), Either.left<string[], number>(["b"]), (x, y) => x + y);
        expect(combined.either(e => e.join(), x => String(x))).toBe("a,b");
        expect(Either.getRights([Either.left("x"), Either.right(1), Either.right(2)])).toEqual([1, 2]);
    });

    test("equality, as Java's equals", () =>
    {
        expect(javaEquals(Either.right(new Pair(1, "a")), Either.right(new Pair(1, "a")))).toBe(true);
        expect(javaEquals(Either.left(1), Either.right(1))).toBe(false);
        expect(new Pair(1, 2).toString()).toBe("(1, 2)");
    });

    test("ComparableEither orders lefts before rights", () =>
    {
        const items = [ComparableEither.right<string, number>(1), ComparableEither.left<string, number>("b"), ComparableEither.left<string, number>("a")];
        items.sort((x, y) => x.compareTo(y));
        expect(items.map(i => i.either(l => l, r => String(r)))).toEqual(["a", "b", "1"]);
    });
});
