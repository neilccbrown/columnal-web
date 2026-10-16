// Port of test.functions.PropListFunctions (tests-functions).
import { describe } from "vitest";
import { Max } from "../../../../src/engine/functions/transformations/function/comparison/Max.js";
import { Min } from "../../../../src/engine/functions/transformations/function/comparison/Min.js";
import type { FunctionDefinition } from "../../../../src/engine/functions/transformations/function/FunctionDefinition.js";
import { Count } from "../../../../src/engine/functions/transformations/function/list/Count.js";
import { GetElement } from "../../../../src/engine/functions/transformations/function/list/GetElement.js";
import { Decimal } from "../../../../src/engine/java/JavaBigDecimal.js";
import type { JavaRandom } from "../../../../src/engine/java/JavaRandom.js";
import { DataType, SpecificDataTypeVisitor } from "../../../../src/engine/types/data/datatype/DataType.js";
import { DataTypeUtility } from "../../../../src/engine/types/data/datatype/DataTypeUtility.js";
import { UserException } from "../../../../src/engine/utility-error/error/UserException.js";
import { Utility } from "../../../../src/engine/utility/utility/Utility.js";
import { assertEquals, assertSame, assertTrue, fail } from "../../../support/junit.js";
import { propertyTest } from "../../../support/quickcheck.js";
import { TBasicUtil } from "../../tests-basic/fixtures/data/TBasicUtil.js";
import { GenRandom } from "../../tests-basic/fixtures/gen/GenRandom.js";
import { TFunctionUtil } from "../fixtures/functions/TFunctionUtil.js";
import { GenValueList } from "../fixtures/gen/GenValueList.js";

/**
 * Created by neil on 13/12/2016.
 */
describe("PropListFunctions", () =>
{
    propertyTest("propMinMax", [new GenValueList()], (src: GenValueList.ListAndType) =>
    {
        const minFunction: FunctionDefinition = new Min();
        const maxFunction: FunctionDefinition = new Max();
        const minChecked = TFunctionUtil.typeCheckFunction(minFunction, [src.type]);
        const maxChecked = TFunctionUtil.typeCheckFunction(maxFunction, [src.type]);

        if (minChecked === null || maxChecked === null)
        {
            fail("Type check failure: " + String(minChecked) + " " + String(maxChecked) + " for type" + src.type.toString());
        }
        else if (src.list.size() === 0)
        {
            const minFinal = minChecked;
            const maxFinal = maxChecked;
            TBasicUtil.assertUserException(() => minFinal.getFirst().call([DataTypeUtility.value(src.list)]));
            TBasicUtil.assertUserException(() => maxFinal.getFirst().call([DataTypeUtility.value(src.list)]));
        }
        else
        {
            let expectedMin = src.list.get(0);
            let expectedMax = src.list.get(0);
            for (let i = 1; i < src.list.size(); i++)
            {
                const x = src.list.get(i);
                if (Utility.compareValues(x, expectedMin) < 0)
                    expectedMin = x;
                if (Utility.compareValues(x, expectedMax) > 0)
                    expectedMax = x;
            }

            assertEquals(getInnerType(src.type), minChecked.getSecond());
            assertEquals(getInnerType(src.type), maxChecked.getSecond());
            const minActual = minChecked.getFirst().call([DataTypeUtility.value(src.list)]);
            const maxActual = maxChecked.getFirst().call([DataTypeUtility.value(src.list)]);
            TBasicUtil.assertValueEqual("", expectedMin, minActual);
            TBasicUtil.assertValueEqual("", expectedMax, maxActual);
        }
    });


    propertyTest("propCount", [new GenValueList()], (src: GenValueList.ListAndType) =>
    {
        const func = new Count();
        const checked = TFunctionUtil.typeCheckFunction(func, [src.type]);
        if (checked === null)
        {
            fail("Type check failure");
        }
        else
        {
            assertEquals(DataType.NUMBER, checked.getSecond());
            const actual = checked.getFirst().call([DataTypeUtility.value(src.list)]);
            assertEquals(new Decimal(src.list.size()), actual);
        }
    });

    propertyTest("propElement", [new GenValueList()], (src: GenValueList.ListAndType) =>
    {
        const func = new GetElement();
        let checked = null;
        try
        {
            checked = TFunctionUtil.typeCheckFunction(func, [src.type, DataType.NUMBER]);
        }
        catch
        {
            // This can be ok, if it was empty array,
        }
        if (checked === null)
        {
            fail("Type check failure");
        }
        else
        {
            assertEquals(getInnerType(src.type), checked.getSecond());
            // Try valid values:
            for (let i = 0; i < src.list.size(); i++)
            {
                const actual = checked.getFirst().call([DataTypeUtility.value(src.list), DataTypeUtility.value(new Decimal(i + 1 /* one-based index */))]);
                assertSame(src.list.get(i), actual);
            }
            // Try invalid integer values:
            for (const i of [-2, -1, 0, src.list.size() + 1, src.list.size() + 2])
            {
                try
                {
                    checked.getFirst().call([DataTypeUtility.value(src.list), DataTypeUtility.value(new Decimal(i))]);
                    fail("Expected user exception for index " + i);
                }
                catch (e)
                {
                    if (!(e instanceof UserException))
                        throw e;
                }
            }
            // Try invalid non-integer values:
        }
    });

    propertyTest("propAny", [new GenValueList(), new GenRandom()], (src: GenValueList.ListAndType, r: JavaRandom) =>
    {
        if (src.list.size() === 0)
        {
            //assertFalse(Utility.cast(TestUtil.runExpression("@call function\\\\any(" + DataTypeUtility.valueToString(src.type, src.list, null, true) + ", (? = ?))"), Boolean.class));
        }
        else
        {
            // Check that random element is found:
            const elem = src.list.get(r.nextInt(src.list.size()));
            assertTrue("" + src.type.toString(), Utility.cast(TFunctionUtil.runExpression("@call function\\\\any(" + DataTypeUtility.valueToString(src.list, src.type, false, null) + ", (? = " + DataTypeUtility.valueToString(elem, getInnerType(src.type), false, null) + "))"), Boolean));
        }
    });

    function getInnerType(listType: DataType): DataType
    {
        return listType.apply(new class extends SpecificDataTypeVisitor<DataType>
        {
            public override array(inner: DataType): DataType
            {
                return inner;
            }
        }());
    }
});
