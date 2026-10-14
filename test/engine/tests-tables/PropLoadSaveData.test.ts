// Port of test.PropLoadSaveData (tests-tables).
import { describe } from "vitest";
import { CellPosition } from "../../../src/engine/data/data/CellPosition.js";
import type { Column } from "../../../src/engine/data/data/Column.js";
import { GridComment } from "../../../src/engine/data/data/GridComment.js";
import type { Table } from "../../../src/engine/data/data/Table.js";
import { TableManager } from "../../../src/engine/data/data/TableManager.js";
import { SaveTag } from "../../../src/engine/identifiers/id/SaveTag.js";
import type { TableId } from "../../../src/engine/identifiers/id/TableId.js";
import { HashMap } from "../../../src/engine/java/HashMap.js";
import type { JavaRandom } from "../../../src/engine/java/JavaRandom.js";
import { Either } from "../../../src/engine/utility-adt/utility/adt/Either.js";
import { Pair } from "../../../src/engine/utility-adt/utility/adt/Pair.js";
import type { Value } from "../../../src/engine/utility/utility/Value.js";
import { assertEquals } from "../../support/junit.js";
import { propertyTest, SourceOfRandomness } from "../../support/quickcheck.js";
import { TBasicUtil } from "../tests-basic/fixtures/data/TBasicUtil.js";
import { GenRandom } from "../tests-basic/fixtures/gen/GenRandom.js";
import { TTableUtil } from "./fixtures/TTableUtil.js";
import { GenImmediateData } from "./fixtures/gen/GenImmediateData.js";
import { GenTableManager } from "./fixtures/gen/GenTableManager.js";

/**
 * Created by neil on 07/12/2016.
 */
describe("PropLoadSaveData", () =>
{
    function testImmediate(mgr1: TableManager, mgr2: TableManager, original: GenImmediateData.ImmediateData_Mgr, r: JavaRandom): void
    {
        const sourceOfRandomness = new SourceOfRandomness(r);
        const next = [1];
        const comments = TBasicUtil.makeList(sourceOfRandomness, 0, 5, () =>
        {
            const content = Array.from({ length: r.nextInt(3) }, _n => TBasicUtil.generateColumnIds(sourceOfRandomness, r.nextInt(12)).map(c => c.getRaw()).join(" ")).join("\n");

            return new GridComment(SaveTag.generateRandom(), content, new CellPosition(r.nextInt(100), (next[0]!++ * 1000)), 1 + r.nextInt(20), 1 + r.nextInt(20));
        });
        for (const comment of comments)
        {
            original.mgr.addComment(comment);
        }
        const saved = TTableUtil.save(original.mgr);
        try
        {
            //Assume users destroy leading whitespace:
            const savedMangled = saved.replace(/\n +/g, "\n");
            const loaded = toMap(mgr1.loadAll(savedMangled, _w => {}));
            const savedAgain = TTableUtil.save(mgr1);
            const loadedAgain = toMap(mgr2.loadAll(savedAgain, _w => {}));


            assertEquals(saved, savedAgain);
            assertEquals(toMap(new TableManager.Loaded([], original.data, comments)), loaded);
            assertEquals(loaded, loadedAgain);
            assertEquals(original.mgr.getTypeManager().getKnownTaggedTypes(), mgr1.getTypeManager().getKnownTaggedTypes());
            assertEquals(original.mgr.getTypeManager().getKnownTaggedTypes(), mgr2.getTypeManager().getKnownTaggedTypes());
            assertEquals(original.mgr.getUnitManager().getAllDeclared(), mgr1.getUnitManager().getAllDeclared());
            assertEquals(original.mgr.getUnitManager().getAllDeclared(), mgr2.getUnitManager().getAllDeclared());
        }
        catch (t)
        {
            console.error("Original:\n" + saved);
            throw t;
        }
    }

    function toMap(tablesAndComments: TableManager.Loaded): Pair<HashMap<TableId, Table>, readonly GridComment[]>
    {
        return new Pair(new HashMap<TableId, Table>(tablesAndComments.loadedTables.map(t => [t.getId(), t] as const)), tablesAndComments.gridComments);
    }

    propertyTest("testImmediate", [new GenTableManager(), new GenTableManager(), new GenImmediateData({ numTables: { maxTables: 4 } }), new GenRandom()],
        testImmediate, { trials: 20, timeout: 120_000 });

    propertyTest("testImmediateInclError", [new GenTableManager(), new GenTableManager(), new GenImmediateData({ numTables: { maxTables: 4 } }), new GenRandom()],
        (mgr1: TableManager, mgr2: TableManager, original: GenImmediateData.ImmediateData_Mgr, r: JavaRandom) =>
    {
        TBasicUtil.printSeedOnFail(() =>
        {
            // Introduce some errors:
            for (let i = 0; i < 20; i++)
            {
                const table = original.data[r.nextInt(original.data.length)]!;
                if (table.getData().getLength() > 0)
                {
                    const row = r.nextInt(table.getData().getLength());
                    const colIndex = r.nextInt(table.getData().getColumns().length);
                    setInvalid(table.getData().getColumns()[colIndex]!, row, r);
                }
            }

            testImmediate(mgr1, mgr2, original, r);
        });
    }, { trials: 20, timeout: 120_000 });

    function setInvalid(column: Column, row: number, r: JavaRandom): void
    {
        column.getType().setCollapsed(row, Either.left<string, Value>(r.nextInt(10) === 1 ? "@END" : ("@" + r.nextInt())));
    }
});
