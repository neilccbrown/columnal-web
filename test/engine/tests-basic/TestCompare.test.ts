// Port of test.TestCompare (tests-basic).
import { describe, test } from "vitest";
import { Decimal, decimalFromDoubleExact } from "../../../src/engine/java/JavaBigDecimal.js";
import { Utility } from "../../../src/engine/utility/utility/Utility.js";
import type { Value } from "../../../src/engine/utility/utility/Value.js";
import { assertEquals } from "../../support/junit.js";

/**
 * Created by neil on 04/12/2016.
 */
// Java: new BigDecimal(double), the exact binary value
function d(v: number): Decimal
{
    return decimalFromDoubleExact(v);
}

// Java: Long, Byte and Integer values; numbers are all canonical Decimals here
function l(i: number): Decimal
{
    return new Decimal(i);
}

function by(i: number): Decimal
{
    return new Decimal(i);
}

function i(n: number): Decimal
{
    return new Decimal(n);
}

function s(str: string): string
{
    return str;
}

function o(...os: Value[]): Value[]
{
    return os;
}

function equal(a: Value[], b: Value[]): void
{
    assertEquals(0, Utility.compareLists(a, b));
    assertEquals(0, Utility.compareLists(b, a));
}

function less(a: Value[], b: Value[]): void
{
    assertEquals(-1, Utility.compareLists(a, b));
    assertEquals(1, Utility.compareLists(b, a));
}

describe("TestCompare", () =>
{
    test("testCompareList", () =>
    {
        equal(o(), o());
        less(o(), o(s("hi")));
        equal(o(s("hi")), o(s("hi")));
        equal(o(s("hi"), s("bye")), o(s("hi"), s("bye")));
        less(o(s("hi"), s("bye")), o(s("hi5"), s("bye")));
        less(o(s("hi"), s("bye")), o(s("hi"), s("bye2")));
        less(o(s("hi"), s("bye")), o(s("hi5")));

        equal(o(i(2), s("hello")), o(i(2), s("hello")));
        less(o(i(1), s("hello")), o(i(2), s("hello")));
        less(o(i(2), s("hello")), o(i(2), s("helloX")));

        equal(o(i(2)), o(by(2)));
        less(o(i(1)), o(by(2)));
        equal(o(l(2)), o(i(2)));
        less(o(l(1)), o(by(2)));

        equal(o(d(1.0)), o(i(1)));
        less(o(d(0.99)), o(i(1)));
        less(o(i(1)), o(d(1.01)));
    });
});
