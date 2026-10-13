// Port of test.TestCompleteStringPool (tests-basic).
import { describe } from "vitest";
import { DumbObjectPool } from "../../../src/engine/utility/utility/DumbObjectPool.js";
import { assertEquals } from "../../support/junit.js";
import { propertyTest, StringGenerator } from "../../support/quickcheck.js";

/**
 * Created by neil on 26/10/2016.
 */
describe("TestCompleteStringPool", () =>
{
    const pool = new DumbObjectPool<string>(100, null);

    propertyTest("sameContent", [new StringGenerator()], (s) =>
    {
        assertEquals(s, pool.pool(s));
    });
});
