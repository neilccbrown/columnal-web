// Port of test.TestUnit (tests-functions).
import { beforeEach, describe, test } from "vitest";
import { AsUnit } from "../../../src/engine/functions/transformations/function/core/AsUnit.js";
import { Decimal, parseBigDecimal, toPlainString } from "../../../src/engine/java/JavaBigDecimal.js";
import { DataType } from "../../../src/engine/types/data/datatype/DataType.js";
import { DataTypeUtility } from "../../../src/engine/types/data/datatype/DataTypeUtility.js";
import { NumberInfo } from "../../../src/engine/types/data/datatype/NumberInfo.js";
import { Utility } from "../../../src/engine/utility/utility/Utility.js";
import type { Value } from "../../../src/engine/utility/utility/Value.js";
import { assertThat, type Matcher } from "../../support/hamcrest.js";
import { Rational } from "../../../src/engine/java/Rational.js";
import { Unit } from "../../../src/engine/types/data/unit/Unit.js";
import { UnitManager } from "../../../src/engine/types/data/unit/UnitManager.js";
import { Pair } from "../../../src/engine/utility-adt/utility/adt/Pair.js";
import { UserException } from "../../../src/engine/utility-error/error/UserException.js";
import { assertEquals, assertNotNull, assertThrows } from "../../support/junit.js";
import { TFunctionUtil } from "./fixtures/functions/TFunctionUtil.js";
import { DummyManager } from "./fixtures/DummyManager.js";

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

    test("testAs", () =>
    {
        testConvert("3.2808399", "foot", "1", "m");
        testConvert("3.2808399", "foot", "100", "cm");
        testConvert("3.2808399", "foot", "1000", "mm");
        testConvert("6.63655303", "mile", "420492", "inch");
        testConvert("26.8224", "m/s", "60", "mile/hour");
        testConvert("2682.24", "cm*s^-1", "60", "mile/hour");
        testConvert("45645.2419", "mile/hour^2", "5.6681247", "m/(s*s)");
        testConvert("817684.876315", "inch^3/minute", "223.32424", "l/s");
        testConvert("817684.876315", "inch^3/minute", "223324.24", "ml/s");
        testConvert("817684.876315", "(inch*inch*inch)/minute", "223.32424", "l*s^-1");

        //TODO add failure tests, like converting scalar to/from units, or unrelated units, or m/s to m/s^2 etc
    });

    test("testAsFail", () =>
    {
        assertThrows(UserException, () => test_("1", "m", "1", "s"));
        assertThrows(UserException, () => test_("1", "mm", "1", "s"));
        assertThrows(UserException, () => test_("1", "m", "1", "m/s"));
        assertThrows(UserException, () => test_("1", "1", "1", "m/s"));
        assertThrows(UserException, () => test_("1", "1", "1", "m"));
        assertThrows(UserException, () => test_("1", "m", "1", "1"));
    });

    // Java: test(expected, destUnit, src, srcUnit)
    function testConvert(expected: string, destUnit: string, src: string, srcUnit: string): void
    {
        test_(expected, destUnit, src, srcUnit);
        test_(src, srcUnit, expected, destUnit);
    }

    function test_(expected: string, destUnit: string, src: string, srcUnit: string): void
    {
        // Java unwraps the cause of a RuntimeException; the ported code throws the cause directly.
        const instance = TFunctionUtil.typeCheckFunction(new AsUnit(),
            [
                DummyManager.make().getTypeManager().unitGADTFor(mgr.loadUse(destUnit)),
                DataType.number(new NumberInfo(mgr.loadUse(srcUnit))),
            ]
        );
        assertNotNull(instance);
        // Java passes null for the type argument, which isn't used:
        const num = instance!.getFirst().call([null as unknown as Value, d(src)]);
        assertThat(num, numberMatch(d(expected)));
    }

    function numberMatch(n: Decimal): Matcher<Value>
    {
        return {
            describe: () => toPlainString(n),
            matches(o: Value): boolean
            {
                const cmp = Utility.compareNumbers(o as Decimal, n);
                return cmp === 0 || Utility.compareNumbers(cmp < 0 ? Utility.addSubtractNumbers(n, o as Decimal, false) : Utility.addSubtractNumbers(o as Decimal, n, false), d("0.0001")) < 0;
            },
        };
    }

    function d(s: string): Decimal
    {
        return DataTypeUtility.value(parseBigDecimal(s, false));
    }
});
