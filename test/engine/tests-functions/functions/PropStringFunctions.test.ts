// Port of test.functions.PropStringFunctions (tests-functions).
// (The Java has propLeft, propRight, propMid and propContains commented out, for the
// functions that are not in FunctionList.)
import { describe, test } from "vitest";
import { FunctionList } from "../../../../src/engine/functions/transformations/function/FunctionList.js";
import type { FunctionDefinition } from "../../../../src/engine/functions/transformations/function/FunctionDefinition.js";
import { StringLength } from "../../../../src/engine/functions/transformations/function/StringLength.js";
import { StringTrim } from "../../../../src/engine/functions/transformations/function/StringTrim.js";
import { ToString } from "../../../../src/engine/functions/transformations/function/ToString.js";
import { doubleValue, intValue, type Decimal } from "../../../../src/engine/java/JavaBigDecimal.js";
import type { JavaRandom } from "../../../../src/engine/java/JavaRandom.js";
import { javaCodePointCount } from "../../../../src/engine/java/JavaString.js";
import { DataType } from "../../../../src/engine/types/data/datatype/DataType.js";
import { DataTypeUtility } from "../../../../src/engine/types/data/datatype/DataTypeUtility.js";
import { assertEquals, assertNotNull, assertTrue, fail } from "../../../support/junit.js";
import { propertyTest } from "../../../support/quickcheck.js";
import { TBasicUtil } from "../../tests-basic/fixtures/data/TBasicUtil.js";
import { GenRandom } from "../../tests-basic/fixtures/gen/GenRandom.js";
import { UnicodeStringGenerator } from "../../tests-basic/fixtures/gen/UnicodeStringGenerator.js";
import { DummyManager } from "../fixtures/DummyManager.js";
import { TFunctionUtil } from "../fixtures/functions/TFunctionUtil.js";
import { GenTypeAndValueGen } from "../fixtures/gen/type/GenTypeAndValueGen.js";

// Guava's CharMatcher.whitespace(), which is Unicode's White_Space property
const isWhitespace = (c: string): boolean => /^\p{White_Space}$/u.test(c);

describe("PropStringFunctions", () =>
{
    propertyTest("propTextLength", [new UnicodeStringGenerator()], (str: string) =>
    {
        const func = new StringLength();
        const checked = TFunctionUtil.typeCheckFunction(func, [DataType.TEXT]);
        if (checked === null)
        {
            fail("Type check failure");
        }
        else
        {
            assertEquals(DataType.NUMBER, checked.getSecond());
            const actual = checked.getFirst().call([DataTypeUtility.value(str)]) as Decimal;
            assertEquals(javaCodePointCount(str), intValue(actual));
            assertTrue(doubleValue(actual) === intValue(actual));
        }
    });

    propertyTest("propTrim", [new UnicodeStringGenerator(), new GenRandom()], (orig: string, r: JavaRandom) =>
    {
        // We don't want any spaces besides the ones we add!
        while (orig.length !== 0 && isWhitespace(orig.charAt(0)))
            orig = orig.substring(1);
        while (orig.length !== 0 && isWhitespace(orig.charAt(orig.length - 1)))
            orig = orig.substring(0, orig.length - 1);


        const func = new StringTrim();
        const checked = TFunctionUtil.typeCheckFunction(func, [DataType.TEXT]);
        if (checked === null)
        {
            fail("Type check failure");
        }
        else
        {
            assertEquals(DataType.TEXT, checked.getSecond());
            const SPACES = " \n\t\r               　";
            let withSpaces = orig;
            const before = r.nextInt(4);
            const after = r.nextInt(4);
            for (let i = 0; i < before; i++)
            {
                withSpaces = "" + SPACES.charAt(r.nextInt(SPACES.length)) + withSpaces;
            }
            for (let i = 0; i < after; i++)
            {
                withSpaces = withSpaces + SPACES.charAt(r.nextInt(SPACES.length));
            }

            const actual = checked.getFirst().call([DataTypeUtility.value(withSpaces)]) as string;
                assertEquals(orig, actual);

        }
    });

    propertyTest("propShow", [new GenTypeAndValueGen()], (typeAndValueGen: GenTypeAndValueGen.TypeAndValueGen) =>
    {
        const toString: FunctionDefinition = new ToString();
        // Will throw if null
        const fromString = FunctionList.lookup(DummyManager.make().getUnitManager(), "from text")!;
        const checkedToString = TFunctionUtil.typeCheckFunction(toString, [typeAndValueGen.getType()], typeAndValueGen.getTypeManager());
        const checkedFromString = TFunctionUtil.typeCheckFunction(fromString, typeAndValueGen.getType(), [DataType.TEXT], typeAndValueGen.getTypeManager());
        if (checkedToString === null || checkedFromString === null)
        {
            fail("Type check failure");
        }
        else
        {
            assertEquals(DataType.TEXT, checkedToString.getSecond());
            assertEquals(typeAndValueGen.getType(), checkedFromString.getSecond());

            for (let i = 0; i < 100; i++)
            {
                const value = typeAndValueGen.makeValue();
                const asString = checkedToString.getFirst().call([value]);
                const roundTripped = checkedFromString.getFirst().call([asString]);
                TBasicUtil.assertValueEqual(asString.toString(), value, roundTripped);
            }
        }
    }, { trials: 200 });

    test("testEscape", () =>
    {
        // Will throw if null
        const toString = FunctionList.lookup(DummyManager.make().getUnitManager(), "to text")!;

        const checkedToString = TFunctionUtil.typeCheckFunction(toString, DataType.TEXT, [DataType.TEXT], null);
        assertNotNull(checkedToString);
        if (checkedToString === null)
            return;
        const f = checkedToString.getFirst();

        assertEquals("\"\"", f.call([DataTypeUtility.value("")]));
        assertEquals("\"hi\"", f.call([DataTypeUtility.value("hi")]));
        assertEquals("\"^q\"", f.call([DataTypeUtility.value("\"")]));
        assertEquals("\"^c^q\"", f.call([DataTypeUtility.value("^\"")]));
        assertEquals("\"^cc^cq\"", f.call([DataTypeUtility.value("^c^q")]));
    });
});
