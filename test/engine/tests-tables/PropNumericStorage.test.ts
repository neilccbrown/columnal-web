// Port of test.PropNumericStorage (tests-tables).
import { describe } from "vitest";
import { NumericColumnStorage } from "../../../src/engine/data/data/NumericColumnStorage.js";
import type { Decimal } from "../../../src/engine/java/JavaBigDecimal.js";
import { NumberInfo } from "../../../src/engine/types/data/datatype/NumberInfo.js";
import { ValueClass } from "../../../src/engine/types/data/datatype/DataType.js";
import { Utility } from "../../../src/engine/utility/utility/Utility.js";
import { assertEquals } from "../../support/junit.js";
import { IntegerGenerator, propertyTest } from "../../support/quickcheck.js";
import { TBasicUtil } from "../tests-basic/fixtures/data/TBasicUtil.js";
import { GenNumber } from "../tests-basic/fixtures/gen/GenNumber.js";
import { GenNumbers } from "../tests-basic/fixtures/gen/GenNumbers.js";
import { GenNumbersAsString } from "../tests-basic/fixtures/gen/GenNumbersAsString.js";

/**
 * Created by neil on 05/11/2016.
 */
describe("PropNumericStorage", () =>
{
    propertyTest("testNumbersFromString", [new GenNumbersAsString()], (input: string[]) =>
    {
        const storage = new NumericColumnStorage(NumberInfo.DEFAULT, true);
        for (const s of input)
            storage.addRead(s);

        assertEquals(input.length, storage.filled());

        const out: string[] = [];
        for (let i = 0; i < input.length; i++)
            out.push(Utility.numberToString(ValueClass.cast(ValueClass.NUMBER, storage.getType().getCollapsed(i))));

        const inputLessTrailingZeroes = input.map(s => s.replace(/\.((?:0*[1-9])+)0+$/, ".$1"));

        TBasicUtil.assertEqualList(inputLessTrailingZeroes, out);
    });

    function testNumbers(input: readonly Decimal[]): void
    {
        const storage = new NumericColumnStorage(NumberInfo.DEFAULT, true);
        for (const n of input)
            storage.add(n);

        assertEquals(input.length, storage.filled());

        const out: Decimal[] = [];
        for (let i = 0; i < input.length; i++)
            out.push(Utility.toBigDecimal(ValueClass.cast(ValueClass.NUMBER, storage.getType().getCollapsed(i))));
        TBasicUtil.assertEqualList(Utility.mapList(input, Utility.toBigDecimal), out);
    }

    propertyTest("testNumbers", [new GenNumbers()], (input: Decimal[]) =>
    {
        testNumbers(input);
    });

    propertyTest("testNumbersAdd", [new GenNumbers(), new GenNumber()], (input: Decimal[], n: Decimal) =>
    {
        // These numbers come from a fixed bit size, so may lack
        // a high number
        testNumbers(input);
        // We add a new number which may cause the whole thing to be shifted
        // to higher storage, then test with that:
        input = [...input];
        input.push(n);
        testNumbers(input);
    }, { trials: 1000 });

    function testSet(input: readonly Decimal[], index: number, n: Decimal): void
    {
        const storage = new NumericColumnStorage(NumberInfo.DEFAULT, true);
        for (const orig of input)
            storage.add(orig);

        storage.set(index, n);

        const expected = [...input];
        expected[index] = n;

        assertEquals(expected.length, storage.filled());

        const out: Decimal[] = [];
        for (let i = 0; i < input.length; i++)
            out.push(Utility.toBigDecimal(ValueClass.cast(ValueClass.NUMBER, storage.getType().getCollapsed(i))));
        TBasicUtil.assertEqualList(Utility.mapList(expected, Utility.toBigDecimal), out);
    }

    propertyTest("testNumbersSet", [new GenNumbers(), new IntegerGenerator(), new GenNumber()], (input: Decimal[], index: number, n: Decimal) =>
    {
        // These numbers come from a fixed bit size, so may lack
        // a high number
        testNumbers(input);
        if (input.length !== 0)
        {
            index = Math.abs(index) % input.length;
            testSet(input, index, n);
        }
    }, { trials: 1000 });
});
