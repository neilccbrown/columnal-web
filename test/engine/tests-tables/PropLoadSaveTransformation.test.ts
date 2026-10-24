// Port of test.PropLoadSaveTransformation (tests-tables).
import { describe } from "vitest";
import { Table } from "../../../src/engine/data/data/Table.js";
import type { TableManager } from "../../../src/engine/data/data/TableManager.js";
import { assertEquals } from "../../support/junit.js";
import { propertyTest } from "../../support/quickcheck.js";
import { DummyManager } from "../tests-functions/fixtures/DummyManager.js";
import { GenNonsenseTransformation } from "./fixtures/gen/nonsenseTrans/GenNonsenseTransformation.js";
import type { Transformation_Mgr } from "./fixtures/Transformation_Mgr.js";

/**
 * Created by neil on 16/11/2016.
 */
describe("PropLoadSaveTransformation", () =>
{
    propertyTest("testLoadSaveTransformation", [new GenNonsenseTransformation()], (original: Transformation_Mgr) =>
    {
        const mgr1 = new DummyManager();
        const mgr2 = new DummyManager();
        const saved = save(original.mgr);
        try
        {
            //Assume users destroy leading whitespace:
            const savedMangled = saved.replace(/\n +/g, "\n");
            const loaded = mgr1.loadAll(savedMangled, _w => {}).loadedTables[0]!;
            const savedAgain = save(mgr1);
            const loadedAgain = mgr2.loadAll(savedAgain, _w => {}).loadedTables[0]!;


            assertEquals(saved, savedAgain);
            assertEquals(original.transformation, loaded);
            assertEquals(loaded, loadedAgain);
        }
        catch (t)
        {
            console.error("Original:\n" + saved);
            throw t;
        }
    }, { trials: 200 });

    function save(original: TableManager): string
    {
        // This whole bit is single-threaded:
        const r = [""];
        try
        {
            original.save(null, new class extends Table.FullSaver
            {
                public override saveTable(tableSrc: string): void
                {
                    super.saveTable(tableSrc);
                    // May be called multiple times, but that's fine, we just need last one:
                    r[0] = this.getCompleteFile();
                }
            }(null));
        }
        catch (_t)
        {
            // Java ignores any exception here
        }
        return r[0]!;
    }
});
