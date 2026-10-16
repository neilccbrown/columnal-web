// Port of test.functions.TestBooleanFunctions (tests-functions).
import { describe, test } from "vitest";
import type { FunctionDefinition } from "../../../../src/engine/functions/transformations/function/FunctionDefinition.js";
import { Not } from "../../../../src/engine/functions/transformations/function/Not.js";
import { Xor } from "../../../../src/engine/functions/transformations/function/Xor.js";
import { DataType } from "../../../../src/engine/types/data/datatype/DataType.js";
import { DataTypeUtility } from "../../../../src/engine/types/data/datatype/DataTypeUtility.js";
import { UnitManager } from "../../../../src/engine/types/data/unit/UnitManager.js";
import { assertEquals, fail } from "../../../support/junit.js";
import { TFunctionUtil } from "../fixtures/functions/TFunctionUtil.js";

describe("TestBooleanFunctions", () =>
{
    // Java: an instance field, created for each test
    new UnitManager();

    test("testNot", () =>
    {
        const func: FunctionDefinition = new Not();
        const checked = TFunctionUtil.typeCheckFunction(func, [DataType.BOOLEAN]);
        if (checked === null)
        {
            fail("Type check failure");
        }
        else
        {
            assertEquals(DataType.BOOLEAN, checked.getSecond());
            // Not too hard to exhaustively test this one:
            assertEquals(true, checked.getFirst().call([DataTypeUtility.value(false)]) as boolean);
            assertEquals(false, checked.getFirst().call([DataTypeUtility.value(true)]) as boolean);
        }
    });

    test("testXor", () =>
    {
        const func: FunctionDefinition = new Xor();
        const checked = TFunctionUtil.typeCheckFunction(func, [DataType.BOOLEAN, DataType.BOOLEAN]);
        if (checked === null)
        {
            fail("Type check failure");
        }
        else
        {
            assertEquals(DataType.BOOLEAN, checked.getSecond());
            // Not too hard to exhaustively test this one:
            assertEquals(true, checked.getFirst().call([DataTypeUtility.value(true), DataTypeUtility.value(false)]) as boolean);
            assertEquals(true, checked.getFirst().call([DataTypeUtility.value(false), DataTypeUtility.value(true)]) as boolean);
            assertEquals(false, checked.getFirst().call([DataTypeUtility.value(true), DataTypeUtility.value(true)]) as boolean);
            assertEquals(false, checked.getFirst().call([DataTypeUtility.value(false), DataTypeUtility.value(false)]) as boolean);
        }
    });

});
