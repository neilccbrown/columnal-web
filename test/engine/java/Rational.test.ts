import { describe, expect, test } from "vitest";
import { Decimal } from "../../../src/engine/java/JavaBigDecimal.js";
import { Rational } from "../../../src/engine/java/Rational.js";

describe("Rational", () =>
{
    test("is kept in lowest terms with a positive denominator", () =>
    {
        expect(Rational.ofLongs(6, -4).toString()).toBe("-3/2");
        expect(Rational.of("254/10000").toString()).toBe("127/5000");
        expect(Rational.of("100").toString()).toBe("100");
        expect(Rational.ofLongs(0, 5)).toBe(Rational.ZERO);
        expect(Rational.ofLongs(-7, -7)).toBe(Rational.ONE);
    });

    test("arithmetic", () =>
    {
        const half = Rational.ofLongs(1, 2);
        const third = Rational.ofLongs(1, 3);
        expect(half.plus(third).toString()).toBe("5/6");
        expect(half.minus(third).toString()).toBe("1/6");
        expect(half.times(third).toString()).toBe("1/6");
        expect(half.divides(third).toString()).toBe("3/2");
        expect(third.reciprocal().toString()).toBe("3");
        expect(half.negate().abs().equals(half)).toBe(true);
        expect(() => Rational.ZERO.reciprocal()).toThrow();
    });

    test("comparison, conversion and integrality", () =>
    {
        expect(Rational.ofLongs(2, 3).compareTo(Rational.ofLongs(3, 4))).toBe(-1);
        expect(Rational.max(Rational.ONE, Rational.NEG_ONE)).toBe(Rational.ONE);
        expect(Rational.ofBigDecimal(new Decimal("2.375")).toString()).toBe("19/8");
        expect(Rational.ofBigDecimal(new Decimal("1e3")).toString()).toBe("1000");
        expect(Rational.of(10).isIntegral()).toBe(true);
        expect(Rational.ofLongs(7, 2).intValue()).toBe(3);
        expect(Rational.ofLongs(-7, 2).doubleValue()).toBe(-3.5);
        expect(Rational.ofLongs(2, 4).equals(Rational.ofLongs(1, 2))).toBe(true);
        expect(Rational.ofLongs(2, 4).hashCode()).toBe(Rational.ofLongs(1, 2).hashCode());
    });
});
