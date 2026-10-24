// Tests of the grid logic ported from the GUI module stf (src/gui-logic/stf/gui/grid), derived from
// the GUI tests that use it: TestVirtualGridLayout (testOverlap1, testOverlap2 and testOverlap,
// whose grid areas must not even touch after layout) and TestKeyboardMovement (moving the
// selection with the keyboard, between empty cells and tables).
import { describe, expect, test } from "vitest";
import { CellPosition } from "../../../src/engine/data/data/CellPosition.js";
import { JavaRandom } from "../../../src/engine/java/JavaRandom.js";
import { Utility } from "../../../src/engine/utility/utility/Utility.js";
import type { CellSelection } from "../../../src/gui-logic/stf/gui/grid/CellSelection.js";
import { GridArea } from "../../../src/gui-logic/stf/gui/grid/GridArea.js";
import { RectangleBounds } from "../../../src/gui-logic/stf/gui/grid/RectangleBounds.js";
import { RectangularTableCellSelection } from "../../../src/gui-logic/stf/gui/grid/RectangularTableCellSelection.js";
import { VirtualGrid } from "../../../src/gui-logic/stf/gui/grid/VirtualGrid.js";
import { assertFalse } from "../../support/junit.js";

// TestVirtualGridLayout's BoundsGridArea: a grid area of fixed size, whose cells can be selected
class BoundsGridArea extends GridArea
{
    private readonly size: CellPosition;

    public constructor(bounds: RectangleBounds)
    {
        super();
        this.setPosition(bounds.topLeftIncl);
        this.size = new CellPosition(bounds.bottomRightIncl.rowIndex - bounds.topLeftIncl.rowIndex, bounds.bottomRightIncl.columnIndex - bounds.topLeftIncl.columnIndex);
    }

    protected override updateKnownRows(): void
    {
    }

    protected override recalculateBottomRightIncl(): CellPosition
    {
        return this.getPosition().offsetByRowCols(this.size.rowIndex, this.size.columnIndex);
    }

    public override getSelectionForSingleCell(cellPosition: CellPosition): CellSelection | null
    {
        if (!this.contains(cellPosition))
            return null;
        return new RectangularTableCellSelection(cellPosition.rowIndex, cellPosition.columnIndex, {
            getTopLeftIncl: () => this.getPosition(),
            getBottomRightIncl: () => this.getBottomRightIncl(),
            doCopy: () => {},
            doDelete: () => {},
            gotoRow: () => {},
        });
    }

    public override getSortKey(): string
    {
        return "";
    }
}

function b(x0: number, y0: number, x1: number, y1: number): RectangleBounds
{
    return new RectangleBounds(new CellPosition(CellPosition.row(y0), CellPosition.col(x0)), new CellPosition(CellPosition.row(y1), CellPosition.col(x1)));
}

// TestVirtualGridLayout.checkOverlap:
function checkOverlap(bounds: readonly RectangleBounds[]): void
{
    const virtualGrid = new VirtualGrid(null, 0, 0);
    const gridAreas = Utility.mapList(bounds, r => new BoundsGridArea(r));
    virtualGrid.addGridAreas(gridAreas);
    // Should already not be touching:
    for (const a of gridAreas)
    {
        const aBounds = new RectangleBounds(a.getPosition(), a.getBottomRightIncl());
        for (const other of gridAreas)
        {
            const bBounds = new RectangleBounds(other.getPosition(), other.getBottomRightIncl());
            // Don't check if grid area overlaps itself:
            if (a !== other)
            {
                assertFalse("Bounds " + aBounds.toString() + " should not touch " + bBounds.toString(), aBounds.touches(bBounds));
            }
        }
    }
}

describe("layout", () =>
{
    test("testOverlap1", () =>
    {
        checkOverlap([
            b(1, 1, 2, 3),
            // This should shunt:
            b(2, 2, 3, 2),
        ]);
    });

    test("testOverlap2", () =>
    {
        checkOverlap([
            b(1, 1, 2, 3),
            // This should shunt and cause knock-on shunt:
            b(2, 2, 3, 2),
            b(3, 1, 5, 3),
        ]);
    });

    test("testOverlap", () =>
    {
        for (let trial = 0; trial < 30; trial++)
        {
            const r = new JavaRandom(trial);
            const gridAreas: RectangleBounds[] = [];
            for (let i = 0; i < 20; i++)
            {
                const topLeft = new CellPosition(CellPosition.row(1 + r.nextInt(40)), CellPosition.col(1 + r.nextInt(40)));
                const bottomRight = topLeft.offsetByRowCols(r.nextInt(15), r.nextInt(15));
                gridAreas.push(new RectangleBounds(topLeft, bottomRight));
            }
            checkOverlap(gridAreas);
        }
    });

    test("grid size and column widths", () =>
    {
        const grid = new VirtualGrid(null, 3, 4);
        expect([grid.getCurrentColumns(), grid.getCurrentKnownLastRowIncl()]).toEqual([3, 4]);
        grid.addGridAreas([new BoundsGridArea(b(1, 1, 4, 9))]);
        // Up to the right edge of the table, plus the extra columns and rows:
        expect([grid.getCurrentColumns(), grid.getCurrentKnownLastRowIncl()]).toEqual([5 + 3, 9 + 4]);
        expect(grid.sumColumnWidths(0, 3)).toBe(20 + 100 + 100);
        grid.setColumnWidth(2, 50, false);
        expect(grid.sumColumnWidths(0, 3)).toBe(20 + 100 + 50);
        expect([...grid.getCustomisedColumnWidths()]).toEqual([[2, 50]]);
        // Setting the default width removes the customisation:
        grid.setColumnWidth(2, 100, false);
        expect([...grid.getCustomisedColumnWidths()]).toEqual([]);
    });
});

describe("keyboard", () =>
{
    const selected = (grid: VirtualGrid): string => String(grid.getSelection());

    test("moving between empty cells and a table", () =>
    {
        const grid = new VirtualGrid(null, 2, 2);
        grid.addGridAreas([new BoundsGridArea(b(3, 2, 4, 5))]);
        grid.ctrlHome();
        expect(selected(grid)).toBe("EmptyCellSelection{position=(1, 1)}");
        // Can't go above row 1 or left of column 1:
        grid.move(false, -1, -1);
        expect(selected(grid)).toBe("EmptyCellSelection{position=(1, 1)}");
        grid.move(false, 1, 1);
        expect(selected(grid)).toBe("EmptyCellSelection{position=(2, 2)}");
        // Into the table:
        grid.move(false, 0, 1);
        expect(selected(grid)).toBe("RectTableCellSel[(3, 2)->(3, 2)]");
        // Shift-selection stays in the table:
        grid.move(true, 0, 5);
        expect(selected(grid)).toBe("RectTableCellSel[(3, 2)->(4, 2)]");
        grid.end(true);
        expect(selected(grid)).toBe("RectTableCellSel[(3, 2)->(4, 5)]");
        grid.home(false);
        expect(selected(grid)).toBe("RectTableCellSel[(4, 2)->(4, 2)]");
        // Out of the table, to the right; then the grid stops at its last column:
        grid.move(false, 0, 1);
        expect(selected(grid)).toBe("EmptyCellSelection{position=(5, 2)}");
        grid.move(false, 0, 10);
        expect(selected(grid)).toBe("EmptyCellSelection{position=(6, 2)}");
        // And its last row:
        grid.move(false, 100, 0);
        expect(selected(grid)).toBe("EmptyCellSelection{position=(6, 7)}");
        grid.focusLost();
        expect(grid.getSelection()).toBeNull();
    });

    test("ctrlHome into a table at the top left", () =>
    {
        const grid = new VirtualGrid(null, 0, 0);
        grid.addGridAreas([new BoundsGridArea(b(1, 1, 2, 2))]);
        grid.ctrlHome();
        expect(selected(grid)).toBe("RectTableCellSel[(1, 1)->(1, 1)]");
    });

    test("_test_keyboardMoveTo", () =>
    {
        const grid = new VirtualGrid(null, 5, 5);
        grid.addGridAreas([new BoundsGridArea(b(2, 2, 4, 6))]);
        grid._test_keyboardMoveTo(new CellPosition(4, 3));
        expect(grid.getSelection()!.isExactly(new CellPosition(4, 3))).toBe(true);
    });
});
