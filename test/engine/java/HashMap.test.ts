import { describe, expect, test } from "vitest";
import { HashMap, HashSet } from "../../../src/engine/java/HashMap.js";
import { Decimal } from "../../../src/engine/java/JavaBigDecimal.js";
import { javaEquals, javaHashCode, javaStringHashCode } from "../../../src/engine/java/JavaObject.js";
import { TableId } from "../../../src/engine/identifiers/id/TableId.js";

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
});
