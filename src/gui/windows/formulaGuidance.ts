// Java: DataCellSupplier.makeTransformGuidance (table-gui): the guidance shown when a data cell's text
// starts with "=", which walks through making a Calculate (GuidanceWindow.vue shows it).
import { Pair } from "../../engine/utility-adt/utility/adt/Pair.js";
import { VirtualGrid } from "../../gui-logic/stf/gui/grid/VirtualGrid.js";
import { elementFinder, lookupCondition, type Condition, type Guidance } from "../components/guidance.js";

/**
 * Java: EmptyCellSelectedCondition: when a single cell is selected.
 *
 * PORT-NOTE: possible Java bug, kept: any single cell (a data cell too), not only an empty one.
 */
function emptyCellSelected(grid: VirtualGrid): Condition
{
    return onSatisfied =>
    {
        let stopped = false;
        grid.addSelectionListener((_old, newSelection) =>
        {
            if (stopped)
                return new Pair(VirtualGrid.ListenerOutcome.REMOVE, null);
            if (newSelection !== null && newSelection.isExactly(newSelection.getActivateTarget()))
            {
                setTimeout(onSatisfied);
                return new Pair(VirtualGrid.ListenerOutcome.REMOVE, null);
            }
            return new Pair(VirtualGrid.ListenerOutcome.KEEP, null);
        });
        return () =>
        {
            stopped = true;
        };
    };
}

/**
 * The steps, for the cell of the table (whose bounds, on the page, the step asking for the source table
 * highlights; null if not known).
 */
export function formulaGuidance(grid: VirtualGrid, srcTableBounds: (() => DOMRect | null) | null): Guidance
{
    // Introduction:
    return { content: "Data tables cannot contain formulas.  To perform a calculation, create a Calculate transformation.", condition: { buttonKey: "guidance.show.me" }, highlight: null, next: () =>
    // Empty cell
    ({ content: "To create a transformation, click on an empty cell.", condition: emptyCellSelected(grid), highlight: null, next: () =>
    // New... button
    ({ content: "Click the New... button.", condition: lookupCondition(".id-new-transform"), highlight: elementFinder(".id-create-table"), next: () =>
    // Transform
    ({ content: "Click the Transform button.", condition: lookupCondition(".pick-transformation-tile-pane"), highlight: elementFinder(".id-new-transform"), next: () =>
    // Calculate
    ({ content: "Click the Calculate button.", condition: lookupCondition(".pick-table-dialog"), highlight: elementFinder(".id-transform-calculate"), next: () =>
    // Click source table
    ({ content: "Click on the table you want to use in the calculation", condition: lookupCondition(".expression-editor"), highlight: srcTableBounds, next: () =>
    // Enter the formula
    ({ content: "Enter the column name and expression you want to calculate, then click Ok.", condition: lookupCondition(".expression-editor", false), highlight: null, next: () => null }) }) }) }) }) }) };
}
