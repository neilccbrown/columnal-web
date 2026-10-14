// Port of test.data.PropFiles (tests-tables).
import { describe } from "vitest";
import { Utility } from "../../../../src/engine/utility/utility/Utility.js";
import { assertEquals } from "../../../support/junit.js";
import { propertyTest } from "../../../support/quickcheck.js";
import type { GeneratedTextFile } from "../fixtures/data/GeneratedTextFile.js";
import { GenFile } from "../fixtures/gen/GenFile.js";

/**
 * Created by neil on 26/10/2016.
 */
describe("PropFiles", () =>
{
    propertyTest("testLineCount", [new GenFile()], (input: GeneratedTextFile) =>
    {
        assertEqualsMsg("Counting lines for " + input.getCharset().toString(), input.getLineCount(), Utility.countLines(input.getFile(), input.getCharset()));
    }, { timeout: 120_000 });

    function assertEqualsMsg<T>(msg: string, exp: T, act: T): void
    {
        try
        {
            assertEquals(msg, exp, act);
        }
        catch (err)
        {
            console.error("Expected: " + String(exp) + "\n  Actual: " + String(act));
            throw err;
        }
    }
});
