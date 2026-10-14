// Port of test.TestUnit (tests-functions).
//
// PORT-DEFERRED: testAs and testAsFail need the AsUnit function and the expression parts of
// TFunctionUtil (Phase 4).
import { beforeEach, describe, test } from "vitest";
import { Rational } from "../../../src/engine/java/Rational.js";
import { Unit } from "../../../src/engine/types/data/unit/Unit.js";
import { UnitManager } from "../../../src/engine/types/data/unit/UnitManager.js";
import { Pair } from "../../../src/engine/utility-adt/utility/adt/Pair.js";
import { UserException } from "../../../src/engine/utility-error/error/UserException.js";
import { assertEquals, assertThrows } from "../../support/junit.js";

/**
 * Created by neil on 11/12/2016.
 */
describe("TestUnit", () =>
{
    let mgr: UnitManager;

    beforeEach(() =>
    {
        mgr = new UnitManager();
    });

    test("unitToString", () =>
    {
        const m = mgr.getDeclared("m");
        const g = mgr.getDeclared("g");
        const l = mgr.getDeclared("l");
        const s = mgr.getDeclared("s");
        const d = mgr.getDeclared("USD");
        assertEquals("m", Unit._test_make(m, 1).toString());
        assertEquals("1/m", Unit._test_make(m, -1).toString());
        assertEquals("1/s^2", Unit._test_make(s, -2).toString());
        assertEquals("m/s", Unit._test_make(m, 1, s, -1).toString());
        assertEquals("m/s^2", Unit._test_make(m, 1, s, -2).toString());
        assertEquals("m/(g^3*s^2)", Unit._test_make(m, 1, s, -2, g, -3).toString());
        assertEquals("m/(g^3*l*s^2)", Unit._test_make(m, 1, s, -2, l, -1, g, -3).toString());
        assertEquals("(l*m)/(g^3*s^2)", Unit._test_make(m, 1, s, -2, l, 1, g, -3).toString());
        assertEquals("m/(USD*s^2)", Unit._test_make(m, 1, d, -1, s, -2).toString());
        assertEquals("1/(USD*s^2)", Unit._test_make(s, -2, d, -1).toString());
        assertEquals("1/(USD*g^3*s^2)", Unit._test_make(g, -3, s, -2, d, -1).toString());
    });

    test("parse", () =>
    {
        const m = mgr.getDeclared("m");
        const g = mgr.getDeclared("g");
        const l = mgr.getDeclared("l");
        const s = mgr.getDeclared("s");
        assertEquals(Unit._test_make(m, 1), mgr.loadUse("m"));
        assertEquals(Unit._test_make(m, 2), mgr.loadUse("m^2"));
        assertEquals(Unit._test_make(m, 2), mgr.loadUse("m*m"));
        assertEquals(Unit._test_make(m, 3), mgr.loadUse("m^3"));
        assertEquals(Unit._test_make(m, 3), mgr.loadUse("m*m*m"));
        assertEquals(Unit._test_make(m, 3), mgr.loadUse("m^2*m"));
        assertEquals(Unit._test_make(m, 3), mgr.loadUse("m*m^2"));
        assertEquals(Unit._test_make(), mgr.loadUse("m^0"));
        assertEquals(Unit._test_make(), mgr.loadUse("m/m"));
        assertEquals(Unit._test_make(m, -2), mgr.loadUse("m^-2"));
        assertEquals(Unit._test_make(m, -2), mgr.loadUse("1/m^2"));
        assertEquals(Unit._test_make(m, -2), mgr.loadUse("(1/m)*(m^-1)"));
        assertEquals(Unit._test_make(m, 1, s, -2), mgr.loadUse("m/s^2"));
        assertEquals(Unit._test_make(m, 1, s, -2), mgr.loadUse("(m/s^2)"));
        assertEquals(Unit._test_make(m, 1, s, -2), mgr.loadUse("m*s^-2"));
        assertEquals(Unit._test_make(m, 1, s, -2), mgr.loadUse("(m/s)/s"));
        assertEquals(Unit._test_make(m, 1, s, -2), mgr.loadUse("m/(s*s)"));
        assertEquals(Unit._test_make(m, 1, s, -2), mgr.loadUse("m/(s^2)"));
        assertEquals(Unit._test_make(m, 1, s, -2), mgr.loadUse("m*(s^-2)"));
        assertEquals(Unit._test_make(m, 2, s, -2), mgr.loadUse("m*(m/s^2)"));
        assertEquals(Unit._test_make(m, 1, s, -2, l, 1, g, -3), mgr.loadUse("(m*l)/(g^3*s^2)"));
        assertEquals(Unit._test_make(m, 1, s, -2, l, 1, g, -3), mgr.loadUse("((m*l)/(g^3*s)) / s"));
        assertEquals(Unit._test_make(m, 1, s, -2, l, 1, g, -3), mgr.loadUse("((m*l)/(g^3*s))/s"));
        assertEquals(Unit._test_make(m, 1, s, -2, l, -1, g, -3), mgr.loadUse("m/(g^3*l*s^2)"));
        assertEquals(Unit._test_make(m, 1, s, -2, l, -1, g, -3), mgr.loadUse("m/(g * l * g * s * g*s)"));
        assertEquals(Unit._test_make(m, 1, s, -2, l, -1, g, -3), mgr.loadUse("m/(g * l * g^2*s * s)"));
    });

    test("testCanon", () =>
    {
        const m = mgr.getDeclared("m");
        mgr.getDeclared("g");
        mgr.getDeclared("l");
        const s = mgr.getDeclared("s");
        assertEquals(new Pair(Rational.of("1"), Unit._test_make(m, 1)), mgr.canonicalise(mgr.loadUse("m")));
        assertEquals(new Pair(Rational.of("1/100"), Unit._test_make(m, 1)), mgr.canonicalise(mgr.loadUse("cm")));
        assertEquals(new Pair(Rational.of("1/10000"), Unit._test_make(m, 2)), mgr.canonicalise(mgr.loadUse("cm^2")));
        assertEquals(new Pair(Rational.of("1/1000"), Unit._test_make(m, 1)), mgr.canonicalise(mgr.loadUse("mm")));
        assertEquals(new Pair(Rational.of("1/1000000"), Unit._test_make(m, 2)), mgr.canonicalise(mgr.loadUse("mm^2")));
        assertEquals(new Pair(Rational.of("1/100"), Unit._test_make(m, 1)), mgr.canonicalise(mgr.loadUse("cm")));
        assertEquals(new Pair(Rational.of("254/10000"), Unit._test_make(m, 1)), mgr.canonicalise(mgr.loadUse("inch")));
        assertEquals(new Pair(Rational.of("254/36000000"), Unit._test_make(m, 1, s, -1)), mgr.canonicalise(mgr.loadUse("inch/hour")));
        assertEquals(new Pair(Rational.of("100"), Unit._test_make()), mgr.canonicalise(mgr.loadUse("m/cm")));
        assertEquals(new Pair(Rational.of("1/100"), Unit._test_make()), mgr.canonicalise(mgr.loadUse("cm/m")));
        assertEquals(new Pair(Rational.of("1"), Unit._test_make(m, 1)), mgr.canonicalise(mgr.loadUse("m^3/(m^2)")));
    });

    test("parseFail", () =>
    {
        // This is both parse failures and unknown unit failures
        assertThrows(UserException, () => mgr.loadUse("###"));
        // Need space inbetween to be valid:
        assertThrows(UserException, () => mgr.loadUse("$$"));
        assertThrows(UserException, () => mgr.loadUse("ss"));
        assertThrows(UserException, () => mgr.loadUse("m/s/"));
        assertThrows(UserException, () => mgr.loadUse("m/s/s"));
        assertThrows(UserException, () => mgr.loadUse("m l/(g^3 s) / s"));
        assertThrows(UserException, () => mgr.loadUse("m^0.5"));
        assertThrows(UserException, () => mgr.loadUse("m^-0.5"));
    });
});
