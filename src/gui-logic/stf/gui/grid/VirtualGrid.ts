// Port of xyz.columnal.gui.grid.VirtualGrid (stf module): the logical model of the grid of
// tables, which the GUI's table canvas shows.  It keeps the grid areas (tables) apart, tracks the
// grid's size, the column widths and the selection, and moves the selection with the keyboard.
//
// PORT-NOTE: Java's VirtualGrid is also the JavaFX node that draws the grid, with its own
// scrolling, scroll bars and node recycling, which are rebuilt in the GUI (PLAN.md §2b).  The parts
// of the logic that need the display (the visible height, scrolling a cell into view, laying out,
// and the node suppliers' activation and editing of cells) go through the Display, which the GUI
// sets with setDisplay.  The keyboard actions, which Java binds to keys in its Container, are
// methods here; their Java keys are in the comments.
//
// PORT-DEFERRED (Phase 8): the JavaFX node and its layout (getNode, Container, redoLayout,
// updateClip, getVisibleBounds, getRectangleBoundsScreen, getCellPositionAt, setEffectOnNonOverlays,
// addMousePane, getContainerChildren), scrolling (scrollXLayoutBy, scrollYLayoutBy,
// redoLayoutAfterScroll, scrollClampX/Y, getScrollGroup, smooth scrolling, scroll bars, nudge
// scrolling and NudgeScrollSpeed), the node suppliers (addNodeSupplier, getFloatingSupplier,
// CreateTableButtonSupplier, addNewButtonVisibleListener, HoverTip), the resizable column bar and
// calcPrefColumnWidth (which asks the suppliers for a column's preferred width, clamped to between
// MIN_COL_WIDTH and 600), the selection rectangle overlay, and the _test_ methods about rendering.
import type { AbsColIndex, AbsRowIndex } from "../../../../engine/anns/Annotations.js";
import { CellPosition } from "../../../../engine/data/data/CellPosition.js";
import { SimpleObjectProperty } from "../../../../engine/java/JavaFXBeans.js";
import { Either } from "../../../../engine/utility-adt/utility/adt/Either.js";
import { Pair } from "../../../../engine/utility-adt/utility/adt/Pair.js";
import { Utility } from "../../../../engine/utility/utility/Utility.js";
import type { CellSelection } from "./CellSelection.js";
import type { GridArea } from "./GridArea.js";
import { GridWithColumnWidths } from "./GridWithColumnWidths.js";
import { RectangleBounds } from "./RectangleBounds.js";

export class VirtualGrid extends GridWithColumnWidths
{
    public static readonly MIN_COL_WIDTH = 20;
    private static readonly MAX_EXTRA_ROW_COLS = 12;
    /** @internal Java: private */
    public static readonly rowHeight = 24;

    // How many columns beyond last table to show in the grid
    // (logical, not to do with rendering/scrolling)
    private readonly columnsToRight: number;
    // Ditto for rows
    private readonly rowsToBottom: number;
    private readonly gridAreas: GridArea[] = [];
    // A set of pluggable callbacks:
    private readonly manager: VirtualGrid.VirtualGridManager | null;
    private readonly selectionListeners: VirtualGrid.SelectionListener[] = [];
    private display: VirtualGrid.Display | null = null;

    // Where is our theoretical scroll position?  (Java uses this, and the container's height, to
    // know how many rows are visible.)  Set by the GUI through setLogicalScrollRow.
    private logicalScrollRowIndex: AbsRowIndex = CellPosition.row(0);

    private readonly currentKnownLastRowIncl = new SimpleObjectProperty<AbsRowIndex>(CellPosition.row(0));
    // Java: currentKnownLastRowIncl.isBound(), after bindVisibleRowsTo
    private currentKnownLastRowInclBound = false;
    private readonly currentColumns = new SimpleObjectProperty<AbsColIndex>(CellPosition.col(0));

    private cachedColumnLeftX: number[] | null = null;

    // null means the grid doesn't have focus:
    private readonly selection = new SimpleObjectProperty<CellSelection | null>(null);

    // A sort of mutex to stop re-entrance to the updateSizeAndPositions() method:
    private updatingSizeAndPositions = false;
    private suppressSelectionUpdate = false;

    /** Java: VirtualGrid(VirtualGridManager, columnsToRight, rowsToBottom, String... styleClasses); the style classes are the GUI's. */
    public constructor(virtualGridManager: VirtualGrid.VirtualGridManager | null, columnsToRight: number, rowsToBottom: number)
    {
        super();
        this.manager = virtualGridManager;
        this.columnsToRight = columnsToRight;
        this.rowsToBottom = rowsToBottom;
        this.currentKnownLastRowIncl.set(CellPosition.row(rowsToBottom));
        this.currentColumns.set(CellPosition.col(columnsToRight));

        this.selection.addListener((_prop, oldVal, s) =>
        {
            //System.out.println("Selection now: " + s);
            if (this.suppressSelectionUpdate)
                return;
            if (s !== null)
            {
                this.display?.smoothScrollToEnsureVisible(s.positionToEnsureInView());
            }
            const updaters: ((bounds: unknown) => void)[] = [];
            for (let i = 0; i < this.selectionListeners.length;)
            {
                const selectionListener = this.selectionListeners[i]!;
                const outcome = selectionListener(oldVal, s);
                if (outcome.getFirst() === VirtualGrid.ListenerOutcome.REMOVE)
                    this.selectionListeners.splice(i, 1);
                else
                    i++;
                const updater = outcome.getSecond();
                if (updater !== null)
                    updaters.push(updater);
            }
            const bounds = this.display?.redoLayout() ?? null;
            for (const updater of updaters)
            {
                updater(bounds);
            }
        });
    }

    /** TS-only: the GUI's display of this grid (see the PORT-NOTE at the top). */
    public setDisplay(display: VirtualGrid.Display | null): void
    {
        this.display = display;
        // Java: once the container is in a scene, updateSizeAndPositions runs after its first layout:
        if (display !== null)
            this.updateSizeAndPositions();
    }

    /** TS-only: the row at the top of the view, as the GUI scrolls (Java's logicalScrollRowIndex). */
    public setLogicalScrollRow(row: AbsRowIndex): void
    {
        this.logicalScrollRowIndex = row;
    }

    // Java: private; here public for the GUI, which needs it to lay out the columns.
    public sumColumnWidths(startColIndexIncl: AbsColIndex, endColIndexExcl: AbsColIndex): number
    {
        if (this.cachedColumnLeftX === null || endColIndexExcl >= this.cachedColumnLeftX.length)
        {
            const length = Math.max(endColIndexExcl + 1, this.currentColumns.get() + 1);
            this.cachedColumnLeftX = new Array<number>(length);

            let x = 0;
            for (let i = 0; i < this.cachedColumnLeftX.length; i++)
            {
                this.cachedColumnLeftX[i] = x;
                x += this.getColumnWidth(i);
            }
        }

        return this.cachedColumnLeftX[endColIndexExcl]! - this.cachedColumnLeftX[startColIndexIncl]!;
    }

    public getCustomisedColumnWidths(): ReadonlyMap<AbsColIndex, number>
    {
        return new Map(this.customisedColumnWidths);
    }

    /** TS-only: the number of columns in the grid (Java's currentColumns). */
    public getCurrentColumns(): AbsColIndex
    {
        return this.currentColumns.get();
    }

    /** TS-only: the last row in the grid (Java's currentKnownLastRowIncl). */
    public getCurrentKnownLastRowIncl(): AbsRowIndex
    {
        return this.currentKnownLastRowIncl.get();
    }

    private getLastSelectableRowGlobal(): AbsRowIndex
    {
        return CellPosition.row(this.currentKnownLastRowIncl.get());
    }

    // Java: overloaded select(CellSelection) and select(CellSelection, boolean animateFlash)
    public select(cellSelection: CellSelection, animateFlash: boolean = false): void
    {
        this.selectInternal(cellSelection, animateFlash);
    }

    // Only private method allows null selection:
    private selectInternal(cellSelection: CellSelection | null, animateFlash: boolean): void
    {
        const old = this.selection.get();
        if (old !== null)
            old.notifySelected(false, false);
        this.selection.set(cellSelection);
        if (cellSelection !== null)
        {
            this.display?.requestFocus();
            cellSelection.notifySelected(true, animateFlash);
        }
    }

    public selectionIncludes(gridArea: GridArea): boolean
    {
        const curSel = this.selection.get();
        return curSel !== null ? curSel.includes(gridArea) : false;
    }

    /** TS-only: the current selection, which the GUI draws (Java's selection rectangle overlay reads it). */
    public getSelection(): CellSelection | null
    {
        return this.selection.get();
    }

    // Selects cell so that you can navigate around with keyboard
    public findAndSelect(target: Either<CellPosition, CellSelection>): void
    {
        const s = target.either<CellSelection | null>(p =>
        {
            // See if the position is in a grid area:
            for (const gridArea of this.gridAreas)
            {
                if (gridArea.contains(p))
                {
                    return gridArea.getSelectionForSingleCell(p);
                }
            }
            if (p.rowIndex > 0 && p.columnIndex > 0)
                return new VirtualGrid.EmptyCellSelection(this, p);
            else
                return null;
        },
            s => s
        );
        if (s !== null)
            this.select(s, true);
    }

    public positionOrAreaChanged(): void
    {
        // This calls container.redoLayout():
        this.updateSizeAndPositions();
    }

    public _test_setColumnWidth(columnIndex: number, width: number): void
    {
        this.setColumnWidth(CellPosition.col(columnIndex), width, false);
    }

    public setColumnWidth(columnIndex: AbsColIndex, width: number, sizedByUser: boolean): void
    {
        // This is an exact comparison, but that happens if you double-click empty column:
        if (width === GridWithColumnWidths.DEFAULT_COLUMN_WIDTH)
            this.customisedColumnWidths.delete(CellPosition.col(columnIndex));
        else
            this.customisedColumnWidths.set(CellPosition.col(columnIndex), width);
        this.cachedColumnLeftX = null;
        this.updateSizeAndPositions();
        if (sizedByUser && this.manager !== null)
            this.manager.notifyColumnSizeChanged();
    }

    public _test_getSelection(): CellSelection | null
    {
        return this.selection.get();
    }

    // Used internally, but also during testing.
    public calcPageHeight(): number
    {
        return Math.floor((this.display?.getHeight() ?? 0) / VirtualGrid.rowHeight) - 1;
    }

    private updateSizeAndPositions(): void
    {
        if (this.updatingSizeAndPositions)
            return;
        this.updatingSizeAndPositions = true;

        // Three things to do:
        //   - Get each grid area to update its known size (which may involve calling us back)
        //   - Check for overlaps between tables, and reshuffle if needed
        //   - Update our known overall grid size

        // It's okay to ask row sizes beforehand because reshuffling only moves sideways.
        // If in future we also reshuffle down, this code needs rewriting:
        const maxExtra: AbsRowIndex = VirtualGrid.MAX_EXTRA_ROW_COLS;
        const currentLastVisibleRow: AbsRowIndex = CellPosition.row(Math.trunc((this.display?.getHeight() ?? 0) / VirtualGrid.rowHeight)) + this.logicalScrollRowIndex;
        const lastRows: AbsRowIndex[] = Utility.mapList(this.gridAreas, gridArea => gridArea.getAndUpdateBottomRow(currentLastVisibleRow + maxExtra, () => this.updateSizeAndPositions()));

        // The plan to fix overlaps: we go from the left-most column across to
        // the right-most, keeping track of which tables exist in this column.
        // If for any given column, we find an overlap, we pick one table
        // to remain in this column, then punt any overlappers to the right
        // until they no longer overlap.  Then we continue this process,
        // making sure to take account that tables may have moved, and thus the
        // furthest column may also have changed.

        // Pairs each grid area with its integer priority.  Starts in order of table left-most index:
        // (Java's sort is stable)
        const gridAreas: Pair<number, GridArea>[] = [...this.gridAreas]
            .sort((a, b) => a.getPosition().columnIndex - b.getPosition().columnIndex || (a.getSortKey() < b.getSortKey() ? -1 : a.getSortKey() > b.getSortKey() ? 1 : 0))
            .map((x, i) => new Pair(i, x));

        // Any currently open grid areas.  These will not overlap with each other vertically:
        const openGridAreas: Pair<number, GridArea>[] = [];

        // Note: gridAreas.size() may change during the loop!  But nothing at position
        // before i will be modified or looked at.
        gridAreaLoop: for (let i = 0; i < gridAreas.length; i++)
        {
            const cur = gridAreas[i]!;

            // Check for overlap with open grid areas:
            for (const openGridArea of openGridAreas)
            {
                if (this.overlap(openGridArea.getSecond(), cur.getSecond()))
                {
                    // Shunt us sideways so that we don't overlap, and add to right point in list
                    // We may overlap more tables, but that is fine, we will get shunted again
                    // next time round if needed
                    let curPos = cur.getSecond().getPosition();
                    curPos = new CellPosition(curPos.rowIndex, openGridArea.getSecond().getBottomRightIncl().columnIndex + CellPosition.col(1));
                    cur.getSecond().setPosition(curPos);

                    // Now need to add us to the gridAreas list at correct place.  We don't
                    // worry about removing ourselves as it's more hassle than it's worth.

                    // The right place is the end, or the first time that we compare less
                    // when comparing left-hand edge coordinates (and secondarily, priority)
                    for (let j = i + 1; j < gridAreas.length; j++)
                    {
                        const lhs = gridAreas[j]!.getSecond().getPosition().columnIndex;
                        if (curPos.columnIndex < lhs
                                 || (curPos.columnIndex === lhs && cur.getFirst() < gridAreas[j]!.getFirst()))
                        {
                            gridAreas.splice(j, 0, cur);
                            continue gridAreaLoop;
                        }
                    }

                    gridAreas.push(cur);
                    continue gridAreaLoop;
                }
            }
            // Close any grid areas that we have gone to the right of:
            for (let k = openGridAreas.length - 1; k >= 0; k--)
            {
                if (openGridAreas[k]!.getSecond().getBottomRightIncl().columnIndex < cur.getSecond().getPosition().columnIndex)
                    openGridAreas.splice(k, 1);
            }

            // Add ourselves to the open areas:
            openGridAreas.push(cur);
        }

        this.currentColumns.set(
                CellPosition.col(gridAreas.reduce((max, g) => Math.max(max, g.getSecond().getBottomRightIncl().columnIndex + 1), 0)
                    + this.columnsToRight));
        if (!this.currentKnownLastRowInclBound)
        {
            this.currentKnownLastRowIncl.set(lastRows.reduce((max, r) => Math.max(max, r), CellPosition.row(0)) + CellPosition.row(this.rowsToBottom));
        }
        this.updatingSizeAndPositions = false;

        // Java: redoes the layout, tells the node suppliers that sizes or positions changed, and
        // updates the column bar and scroll bars:
        this.display?.sizesOrPositionsChanged();
    }

    public bindVisibleRowsTo(srcGrid: VirtualGrid): void
    {
        this.currentKnownLastRowInclBound = true;
        this.currentKnownLastRowIncl.set(srcGrid.currentKnownLastRowIncl.get());
        srcGrid.currentKnownLastRowIncl.addListener((_p, _o, newNum) =>
        {
            this.currentKnownLastRowIncl.set(newNum);
        });
        this.currentKnownLastRowIncl.addListener(() =>
        {
            this.display?.redoLayout();
        });
    }

    private overlap(a: GridArea, b: GridArea): boolean
    {
        const aLeftIncl = a.getPosition().columnIndex;
        const aRightIncl = a.getBottomRightIncl().columnIndex;
        const aTopIncl = a.getPosition().rowIndex;
        const aBottomIncl = a.getBottomRightIncl().rowIndex;

        const bLeftIncl = b.getPosition().columnIndex;
        const bRightIncl = b.getBottomRightIncl().columnIndex;
        const bTopIncl = b.getPosition().rowIndex;
        const bBottomIncl = b.getBottomRightIncl().rowIndex;
        const distinctHoriz = aLeftIncl > bRightIncl || bLeftIncl > aRightIncl;
        const distinctVert = aTopIncl > bBottomIncl || bTopIncl > aBottomIncl;
        const overlap = !(distinctHoriz || distinctVert);
        return overlap;
    }

    private activateCell(cellPosition: CellPosition): void
    {
        this.display?.keyboardActivate(cellPosition);
    }

    public addGridAreas(gridAreas: readonly GridArea[]): void
    {
        this.gridAreas.push(...gridAreas);
        for (const gridArea of gridAreas)
        {
            gridArea.addedToGrid(this);
        }
        this.updateSizeAndPositions();
    }

    public removeGridArea(gridArea: GridArea): void
    {
        const index = this.gridAreas.indexOf(gridArea);
        if (index !== -1)
            this.gridAreas.splice(index, 1);
        this.updateSizeAndPositions();
    }

    public getGridAreas(): readonly GridArea[]
    {
        return [...this.gridAreas];
    }

    /**
     * For the given gridArea, find the other grid areas which touch it.
     * PORT-NOTE: Java's getTouchingRectangles gives their graphical bounds, relative to the grid
     * area's top left; the GUI works those out from these.
     */
    public getTouchingRectangleBounds(gridArea: GridArea): RectangleBounds[]
    {
        // Make a rectangle one bigger in each dimension, and see if that touches:
        const overSize = new RectangleBounds(
            gridArea.getPosition().offsetByRowCols(-1, -1),
            gridArea.getBottomRightIncl().offsetByRowCols(1, 1)
        );
        return this.gridAreas
            .filter(g => g !== gridArea)
            .map(g => new RectangleBounds(g.getPosition(), g.getBottomRightIncl()))
            .filter(r => r.touches(overSize));
    }

    public addSelectionListener(selectionListener: VirtualGrid.SelectionListener): void
    {
        this.selectionListeners.push(selectionListener);
    }

    public removeSelectionListener(selectionListener: VirtualGrid.SelectionListener): void
    {
        const index = this.selectionListeners.indexOf(selectionListener);
        if (index !== -1)
            this.selectionListeners.splice(index, 1);
    }

    public onNextSelectionChange(onChange: (selection: CellSelection | null) => void): void
    {
        this.addSelectionListener((_old, s) =>
        {
            onChange(s);
            return new Pair(VirtualGrid.ListenerOutcome.REMOVE, null);
        });
    }

    public gotoRow(window: unknown): void
    {
        this.selection.get()?.gotoRow(window);
    }

    public _test_keyboardMoveTo(target: CellPosition): void
    {
        this.suppressSelectionUpdate = true;
        this.ctrlHome();
        for (let i = 1; i < target.rowIndex; i++)
        {
            this.move(false, 1, 0);
        }
        let attempts = 0;
        const maxAttempts = target.columnIndex + 1;
        while ((this._test_getSelection()?.positionToEnsureInView().columnIndex ?? Number.MAX_SAFE_INTEGER) < target.columnIndex && attempts++ < maxAttempts)
        {
            this.move(false, 0, 1);
        }
        // Update:
        this.suppressSelectionUpdate = false;
        this.move(false, 1, 0);
        this.move(false, -1, 0);
    }

    // --- The keyboard actions (Java: in Container, bound to keys) ---------------------------

    /** Java: losing focus clears the selection, then redoes the layout. */
    public focusLost(): void
    {
        this.selectInternal(null, false);
        this.display?.redoLayout();
    }

    /** Java: Ctrl/Cmd+Home. */
    public ctrlHome(): void
    {
        const topLeft = CellPosition.ORIGIN.offsetByRowCols(1, 1);
        for (const gridArea of this.gridAreas)
        {
            const possibleSel = gridArea.getSelectionForSingleCell(topLeft);
            if (possibleSel !== null)
            {
                this.select(possibleSel);
                return;
            }
        }
        this.select(new VirtualGrid.EmptyCellSelection(this, topLeft));
    }

    /** Java: Home, with or without Shift. */
    public home(extendSelection: boolean): void
    {
        const focusedCellPos = this.selection.get();
        if (focusedCellPos !== null)
        {
            this.select(focusedCellPos.atHome(extendSelection));
        }
    }

    /** Java: End, with or without Shift. */
    public end(extendSelection: boolean): void
    {
        const focusedCellPos = this.selection.get();
        if (focusedCellPos !== null)
        {
            this.select(focusedCellPos.atEnd(extendSelection));
        }
    }

    /**
     * Java: the arrow keys (by one row or column), and Page Up and Page Down (by -calcPageHeight()
     * and calcPageHeight() rows), with or without Shift.
     */
    public move(extendSelection: boolean, rows: number, columns: number): void
    {
        const focusedCellPos = this.selection.get();
        if (focusedCellPos !== null)
        {
            this.findAndSelect(focusedCellPos.move(extendSelection, rows, columns));
        }
    }

    /** Java: F11 or Ctrl/Cmd+C. */
    public copySelection(): void
    {
        this.selection.get()?.doCopy();
    }

    /** Java: Ctrl/Cmd+V. */
    public pasteIntoSelection(): void
    {
        this.selection.get()?.doPaste();
    }

    /** Java: Enter or Space. */
    public activateSelection(): void
    {
        const sel = this.selection.get();
        if (sel !== null)
        {
            this.activateCell(sel.getActivateTarget());
        }
    }

    /** Java: Delete or Backspace. */
    public deleteSelection(): void
    {
        this.selection.get()?.doDelete();
    }

    /** Java: typing a character (one that FXUtility.checkKeyTyped accepts) starts editing the selected cell with it. */
    public typed(character: string): void
    {
        const sel = this.selection.get();
        if (sel !== null)
        {
            const pos = sel.getActivateTarget();
            this.display?.startEditing(pos, character);
        }
    }

    /** @internal For EmptyCellSelection */
    public _getGridAreasInternal(): readonly GridArea[]
    {
        return this.gridAreas;
    }

    /** @internal For EmptyCellSelection */
    public _getManager(): VirtualGrid.VirtualGridManager | null
    {
        return this.manager;
    }

    /** @internal For EmptyCellSelection: Java's getLastSelectableRowGlobal and currentColumns */
    public _getLimits(): { lastRow: AbsRowIndex, columns: AbsColIndex }
    {
        return { lastRow: this.getLastSelectableRowGlobal(), columns: this.currentColumns.get() };
    }
}

export namespace VirtualGrid
{
    export interface VirtualGridManager
    {
        // Java: createTable(CellPosition, Point2D suitablePoint, VirtualGrid); the point is the GUI's
        createTable(cellPosition: CellPosition, suitablePoint: unknown, virtualGrid: VirtualGrid): void;

        pasteIntoEmpty(target: CellPosition): void;

        notifyColumnSizeChanged(): void;
    }

    /** TS-only: what the logic needs from the GUI's display of the grid (see the PORT-NOTE at the top). */
    export interface Display
    {
        // The height of the visible part of the grid, in pixels (Java: container.getHeight())
        getHeight(): number;
        // Java: smoothScrollToEnsureVisible
        smoothScrollToEnsureVisible(target: CellPosition): void;
        // Java: container.redoLayout(), returning the visible bounds (which are the GUI's)
        redoLayout(): unknown;
        // Java: after updateSizeAndPositions, redoes the layout and tells the suppliers
        sizesOrPositionsChanged(): void;
        // Java: container.requestFocus()
        requestFocus(): void;
        // Java: each node supplier's keyboardActivate
        keyboardActivate(cellPosition: CellPosition): void;
        // Java: each node supplier's startEditing(null, pos, character)
        startEditing(cellPosition: CellPosition, character: string): void;
    }

    export enum ListenerOutcome { KEEP, REMOVE }

    /**
     * Returns whether to keep listener, and an optional updater to be run
     * once the bounds have been calculated (the bounds are the GUI's)
     *
     * Java: an interface with one method, selectionChanged(oldSelection, newSelection)
     */
    export type SelectionListener = (oldSelection: CellSelection | null, newSelection: CellSelection | null) => Pair<ListenerOutcome, ((bounds: unknown) => void) | null>;

    /** Java: the private inner class EmptyCellSelection. */
    export class EmptyCellSelection implements CellSelection
    {
        private readonly grid: VirtualGrid;
        private readonly position: CellPosition;

        public constructor(grid: VirtualGrid, position: CellPosition)
        {
            this.grid = grid;
            this.position = position;
        }

        public doCopy(): void
        {
            // Can't copy an empty cell
        }

        public doDelete(): void
        {
            // Can't delete an empty cell
        }

        public doPaste(): void
        {
            const manager = this.grid._getManager();
            if (manager !== null)
                manager.pasteIntoEmpty(this.position);
        }

        public getActivateTarget(): CellPosition
        {
            return this.position;
        }

        public extendTo(_cellPosition: CellPosition): CellSelection | null
        {
            // Can't do multi-select on empty cells:
            return null;
        }

        public atHome(_extendSelection: boolean): CellSelection
        {
            // Should we make home do anything if on empty spot?
            return this;
        }

        public atEnd(_extendSelection: boolean): CellSelection
        {
            // Should we make end do anything if on empty spot?
            return this;
        }

        public move(_extendSelection: boolean, _byRows: number, _byColumns: number): Either<CellPosition, CellSelection>
        {
            const byRows = CellPosition.row(_byRows);
            const byColumns = CellPosition.col(_byColumns);
            const limits = this.grid._getLimits();
            const newPos = new CellPosition(
                Utility.minRow(limits.lastRow, Utility.maxRow(this.position.rowIndex + byRows, CellPosition.row(1))),
                Utility.minCol(limits.columns - CellPosition.col(1), Utility.maxCol(this.position.columnIndex + byColumns, CellPosition.col(1)))
            );
            if (newPos.equals(this.position))
                return Either.right<CellPosition, CellSelection>(this); // Not moving
            // Go through each grid area and see if it contains the position:
            for (const gridArea of this.grid._getGridAreasInternal())
            {
                if (gridArea.contains(newPos))
                {
                    return Either.left<CellPosition, CellSelection>(newPos);
                }
            }
            return Either.right<CellPosition, CellSelection>(new EmptyCellSelection(this.grid, newPos));
        }

        public positionToEnsureInView(): CellPosition
        {
            return this.position;
        }

        public getSelectionDisplayRectangle(): RectangleBounds
        {
            return new RectangleBounds(this.position, this.position);
        }

        public isExactly(cellPosition: CellPosition): boolean
        {
            return this.position.equals(cellPosition);
        }

        public includes(_tableDisplay: GridArea): boolean
        {
            // Empty cell overlaps no grid area:
            return false;
        }

        public gotoRow(_parent: unknown): void
        {
            // Do nothing if not in a table
        }

        public notifySelected(_selected: boolean, _animateFlash: boolean): void
        {

        }

        // Useful for debugging
        public toString(): string
        {
            return "EmptyCellSelection{" +
                    "position=" + this.position.toString() +
                    "}";
        }
    }
}
