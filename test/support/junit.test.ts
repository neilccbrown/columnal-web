import { describe, expect, test } from "vitest";
import { assertThat, Matchers } from "./hamcrest.js";
import { AssertionFailedError, assertEquals, assertFalse, assertNotEquals, assertNotNull, assertNull, assertThrows, assertTrue, AssumptionViolatedError, assumeTrue, fail, javaEquals } from "./junit.js";

class Point
{
    constructor(readonly x: number, readonly y: number)
    {
    }

    public equals(other: unknown): boolean
    {
        return other instanceof Point && other.x === this.x && other.y === this.y;
    }

    public compareTo(other: Point): number
    {
        return this.x - other.x;
    }

    public toString(): string
    {
        return `(${this.x}, ${this.y})`;
    }
}

describe("javaEquals", () =>
{
    test("uses equals methods, and compares lists, maps and sets element-wise", () =>
    {
        expect(javaEquals(new Point(1, 2), new Point(1, 2))).toBe(true);
        expect(javaEquals([new Point(1, 2)], [new Point(1, 2)])).toBe(true);
        expect(javaEquals(new Map([["a", [1]]]), new Map([["a", [1]]]))).toBe(true);
        expect(javaEquals(new Set([1, 2]), new Set([2, 1]))).toBe(true);
        expect(javaEquals([1, 2], [2, 1])).toBe(false);
    });

    test("follows Java rather than JavaScript for numbers and plain objects", () =>
    {
        expect(javaEquals(NaN, NaN)).toBe(true);
        expect(javaEquals(1, 1n)).toBe(false); // Integer vs Long
        expect(javaEquals({ a: 1 }, { a: 1 })).toBe(false); // No equals method: identity
        expect(javaEquals(null, undefined)).toBe(false);
    });
});

describe("JUnit assertions", () =>
{
    test("assertEquals overloads", () =>
    {
        assertEquals(new Point(1, 2), new Point(1, 2));
        assertEquals("message", "a", "a");
        assertEquals(1.0, 1.05, 0.1);
        assertEquals("message", 1.0, 1.05, 0.1);
        expect(() => assertEquals("context", 1, 2)).toThrow("context expected:<1> but was:<2>");
        expect(() => assertEquals(1.0, 1.5, 0.1)).toThrow(AssertionFailedError);
        // Same printed form but different types, as JUnit reports it:
        expect(() => assertEquals(1, 1n)).toThrow("expected:<number<1>> but was:<bigint<1>>");
    });

    test("boolean, null and failure assertions", () =>
    {
        assertTrue(true);
        assertFalse("msg", false);
        assertNull(null);
        assertNotNull(0);
        assertNotEquals(1, 2);
        expect(() => assertTrue("was false", false)).toThrow("was false");
        expect(() => assertNotNull(undefined)).toThrow(AssertionFailedError);
        expect(() => fail("boom")).toThrow("boom");
    });

    test("assertThrows returns the thrown error and checks its type", () =>
    {
        const e = assertThrows(RangeError, () => { throw new RangeError("bad"); });
        expect(e.message).toBe("bad");
        expect(() => assertThrows(RangeError, () => { throw new TypeError("other"); })).toThrow("expected:<RangeError> but was:<TypeError>");
        expect(() => assertThrows(RangeError, () => 1)).toThrow("nothing was thrown");
    });

    test("a failed assumption outside a property test is an error", () =>
    {
        expect(() => assumeTrue(false)).toThrow(AssumptionViolatedError);
    });
});

describe("Hamcrest matchers", () =>
{
    test("comparison and string matchers", () =>
    {
        assertThat(5, Matchers.greaterThanOrEqualTo(5));
        assertThat(5, Matchers.lessThanOrEqualTo(6));
        assertThat(new Point(1, 5), Matchers.comparesEqualTo(new Point(1, 9)));
        assertThat("abcdef", Matchers.startsWith("abc"));
        assertThat(3, Matchers.anyOf(Matchers.equalTo(1), Matchers.equalTo(3)));
        assertThat(3, Matchers.not(4));
        assertThat("reason", true);
        expect(() => assertThat("reason", 3, Matchers.greaterThan(4))).toThrow("Expected: a value greater than <4>");
    });
});
