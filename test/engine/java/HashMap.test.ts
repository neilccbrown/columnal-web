import { describe, expect, test } from "vitest";
import { HashMap, HashSet } from "../../../src/engine/java/HashMap.js";
import { Decimal } from "../../../src/engine/java/JavaBigDecimal.js";
import { javaEquals, javaHashCode, javaStringHashCode } from "../../../src/engine/java/JavaObject.js";
import { TableId } from "../../../src/engine/identifiers/id/TableId.js";
import { TreeMap, TreeSet } from "../../../src/engine/java/TreeMap.js";
import goldenOrder from "./golden/hashmap-order.txt?raw";

describe("HashMap and HashSet", () =>
{
    test("keys are compared with equals/hashCode, not identity", () =>
    {
        const m = new HashMap<TableId, number>();
        m.set(new TableId("T1"), 1);
        m.set(new TableId("T2"), 2);
        expect(m.get(new TableId("T1"))).toBe(1);
        expect(m.has(new TableId("T3"))).toBe(false);
        m.set(new TableId("T1"), 10);
        expect(m.size).toBe(2);
        expect(m.get(new TableId("T1"))).toBe(10);
    });

    test("iterates in insertion order; replacing a value keeps the position", () =>
    {
        const m = new HashMap<string, number>([["b", 1], ["a", 2], ["c", 3]]);
        m.set("b", 4);
        expect([...m.keys()]).toEqual(["b", "a", "c"]);
        m.delete("a");
        m.set("a", 5);
        expect([...m.entries()]).toEqual([["b", 4], ["c", 3], ["a", 5]]);
    });

    test("numbers are equal by value regardless of how they were written", () =>
    {
        const s = new HashSet([new Decimal("2.50"), new Decimal(2.5), new Decimal(1)]);
        expect(s.size).toBe(2);
        expect(s.has(new Decimal("2.5000"))).toBe(true);
    });

    test("objects without equals use identity, as Java's Object does", () =>
    {
        const a = {};
        const b = {};
        const m = new HashMap<object, string>([[a, "a"], [b, "b"]]);
        expect(m.get(a)).toBe("a");
        expect(m.get({})).toBeUndefined();
        expect(javaHashCode(a)).toBe(javaHashCode(a));
    });

    test("computeIfAbsent, compute and getOrDefault behave as in Java", () =>
    {
        const m = new HashMap<string, number[]>();
        m.computeIfAbsent("x", () => []).push(1);
        m.computeIfAbsent("x", () => []).push(2);
        expect(m.get("x")).toEqual([1, 2]);
        expect(m.getOrDefault("y", [])).toEqual([]);
        m.compute("x", () => null);
        expect(m.has("x")).toBe(false);
    });

    test("equals and hashCode follow Java's Map/Set contracts", () =>
    {
        const a = new HashMap([["k", 1], ["j", 2]]);
        const b = new HashMap([["j", 2], ["k", 1]]);
        expect(javaEquals(a, b)).toBe(true);
        expect(a.hashCode()).toBe(b.hashCode());
        expect(new HashSet([1, 2]).equals(new HashSet([2, 1]))).toBe(true);
    });

    test("String.hashCode matches Java", () =>
    {
        // Values from Java: "".hashCode() == 0, "hello".hashCode() == 99162322, "Columnal".hashCode() == -1610016306
        expect(javaStringHashCode("")).toBe(0);
        expect(javaStringHashCode("hello")).toBe(99162322);
    });

    // Golden values from scripts/golden/hashmap-order.jsh
    test("Java order matches Java's HashMap iteration order", () =>
    {
        for (const line of goldenOrder.split("\n").filter(l => l !== ""))
        {
            const [initial, ops, expected] = line.split("|") as [string, string, string];
            const m = HashMap.javaOrder<string, number>({ initialCapacity: Number(initial) });
            ops.split(" ").filter(o => o !== "").forEach((op, i) =>
            {
                const k = op.substring(1);
                if (op.startsWith("-"))
                    m.delete(k);
                else if (op.startsWith("*"))
                    m.merge(k, i, (a, b) => a + b);
                else if (op.startsWith("?"))
                    m.computeIfAbsent(k, () => i);
                else
                    m.set(k, i);
            });
            expect([...m.keys()].join(" "), line).toEqual(expected);
        }
    });

    test("Java-order sets size their table for the items they copy", () =>
    {
        // Java 17: new HashSet<>(13 items) starts with capacity max(13 / .75 + 1, 16) = 32, the
        // same capacity that adding the items one at a time reaches:
        const items = Array.from({ length: 13 }, (_, i) => "k" + (i + 1));
        const copied = HashSet.javaOrder({}, items);
        const grown = HashSet.javaOrder<string>();
        items.forEach(i => grown.add(i));
        expect([...copied]).toEqual([...grown]);
        expect(HashMap.javaOrder({}, items.map(i => [i, 0] as const)).equals(new Map(items.map(i => [i, 0])))).toBe(true);
    });
});

describe("TreeMap and TreeSet", () =>
{
    test("iterate in sorted order, with keys equal by comparison", () =>
    {
        const m = new TreeMap<string, number>([["b", 1], ["a", 2], ["c", 3]]);
        m.set("b", 4);
        expect([...m.entries()]).toEqual([["a", 2], ["b", 4], ["c", 3]]);
        expect(m.firstKey()).toBe("a");
        expect(m.lastKey()).toBe("c");
        m.merge("a", 5, (x, y) => x + y);
        expect(m.get("a")).toBe(7);
        m.merge("a", 0, () => null);
        expect(m.has("a")).toBe(false);
        // Uses Java String order (UTF-16 code units), not locale order:
        const s = new TreeSet(["b", "B", "a", "\u00e9", "Z"]);
        expect([...s]).toEqual(["B", "Z", "a", "b", "\u00e9"]);
        const byLength = new TreeSet(["bb", "a", "cc"], (x, y) => x.length - y.length);
        expect([...byLength]).toEqual(["a", "bb"]);
    });

    test("equality and hash codes follow Java's Map contract", () =>
    {
        const t = new TreeMap<string, number>([["x", 1], ["y", 2]]);
        const h = new HashMap<string, number>([["y", 2], ["x", 1]]);
        expect(javaEquals(t, h)).toBe(true);
        expect(javaEquals(h, t)).toBe(true);
        expect(javaHashCode(t)).toBe(javaHashCode(h));
        // Java: Map.of("x", 1, "y", 2).hashCode()
        expect(t.hashCode()).toBe((javaStringHashCode("x") ^ 1) + (javaStringHashCode("y") ^ 2));
        expect(t.toString()).toBe("{x=1, y=2}");
    });
});
