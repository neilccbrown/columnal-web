// Port of test.gui.PropGridOverlap (tests-gui-grid).  The test only uses the grid's logic (a
// VirtualGrid that isn't shown), so it is a Vitest test of the gui-logic (see
// GUI_LOGIC_TESTS_IN_GUI_MODULES in scripts/port-status.ts).
import { describe, test } from "vitest";
import { CellPosition } from "../../../../src/engine/data/data/CellPosition.js";
import { Utility } from "../../../../src/engine/utility/utility/Utility.js";
import type { GridArea } from "../../../../src/gui-logic/stf/gui/grid/GridArea.js";
import { VirtualGrid } from "../../../../src/gui-logic/stf/gui/grid/VirtualGrid.js";
import { assertFalse } from "../../../support/junit.js";
import { assertThat, Matchers } from "../../../support/hamcrest.js";
import { IntegerGenerator, propertyTest } from "../../../support/quickcheck.js";
import { GenGridAreaList } from "../gen/GenGridAreaList.js";

// For any given pair of tables, if they overlap vertically, checks
// that they are still in the horizontal order that they were originally
// (Unused, as in Java)
export function checkHorizSorted(sortedByOriginalX: readonly GridArea[]): void
{
    // Check that this list is sorted by current X in the cases where they overlap:
    for (let i = 0; i < sortedByOriginalX.length; i++)
    {
        const iPos = sortedByOriginalX[i]!.getPosition();
        for (let j = i; j < sortedByOriginalX.length; j++)
        {
            const jPos = sortedByOriginalX[j]!.getPosition();
            if (Utility.rangeOverlaps(0, iPos.rowIndex, sortedByOriginalX[i]!.getBottomRightIncl().rowIndex, jPos.rowIndex, sortedByOriginalX[j]!.getBottomRightIncl().rowIndex))
            {
                assertThat("Comparing " + String(sortedByOriginalX[i]) + " to " + String(sortedByOriginalX[j]), iPos.columnIndex,
                        Matchers.lessThanOrEqualTo(jPos.columnIndex));
            }
        }
    }
}

function sortByCurrentX(gridAreas: readonly GridArea[]): GridArea[]
{
    return [...gridAreas].sort((a, b) => a.getPosition().columnIndex - b.getPosition().columnIndex);
}

function checkNoOverlap(gridAreas: readonly GridArea[]): void
{
    // Now check that none overlap.  We do a brute force N^2 test as it is simplest:
    for (const a of gridAreas)
    {
        for (const b of gridAreas)
        {
            if (a !== b)
            {
                const aTopLeft = a.getPosition();
                const bTopLeft = b.getPosition();
                const aBottomRightIncl = a.getBottomRightIncl();
                const bBottomRightIncl = b.getBottomRightIncl();
                assertFalse("Overlap " + aTopLeft.toString() + ", " + aBottomRightIncl.toString() + " and " + bTopLeft.toString() + ", " + bBottomRightIncl.toString(),
                    aTopLeft.columnIndex < bBottomRightIncl.columnIndex && aBottomRightIncl.columnIndex > bTopLeft.columnIndex &&
                    aTopLeft.rowIndex < bBottomRightIncl.rowIndex && aBottomRightIncl.rowIndex > bTopLeft.rowIndex
                );
            }
        }
    }
}

describe("PropGridOverlap", () =>
{
    propertyTest("testLoad", [new GenGridAreaList()], (gridAreas: GenGridAreaList.GridAreaList) =>
    {
        const grid = new VirtualGrid(null, 0, 0);
        const _sortedByOriginalX = sortByCurrentX(gridAreas.gridAreas);
        grid.addGridAreas(gridAreas.gridAreas);
        checkNoOverlap(gridAreas.gridAreas);
        //checkHorizSorted(sortedByOriginalX);
    }, { trials: 100 });

    propertyTest("testMove", [new GenGridAreaList(), new IntegerGenerator(), new IntegerGenerator(), new IntegerGenerator()], (gridAreas: GenGridAreaList.GridAreaList, toMove: number, newColumn: number, newRow: number) =>
    {
        const grid = new VirtualGrid(null, 0, 0);
        const _sortedByOriginalX = sortByCurrentX(gridAreas.gridAreas);
        grid.addGridAreas(gridAreas.gridAreas);
        checkNoOverlap(gridAreas.gridAreas);
        //checkHorizSorted(sortedByOriginalX);

        // (Java's Math.abs of Integer.MIN_VALUE is negative, as here with | 0)
        gridAreas.gridAreas[(Math.abs(toMove) | 0) % gridAreas.gridAreas.length]!.setPosition(
                new CellPosition(CellPosition.row((Math.abs(newColumn) | 0) % 25), CellPosition.col((Math.abs(newRow) | 0) % 25))
        );


        checkNoOverlap(gridAreas.gridAreas);
        // TODO
        //checkHorizSortedBy(gridAreas.gridAreas, originalX);
    }, { trials: 100 });

    test("testPair", () =>
    {
        // A particular pair which caused an infinite loop:
        const grid = new VirtualGrid(null, 0, 0);
        const gridAreas = [
                GenGridAreaList.makeGridArea(3, 1, 6, 15),
                GenGridAreaList.makeGridArea(6, 7, 7, 11),

        ];
        grid.addGridAreas(gridAreas);
        checkNoOverlap(gridAreas);
    });
});
