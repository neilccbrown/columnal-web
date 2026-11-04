<script setup lang="ts">
// The grid of the engine's tables (Java: View's VirtualGrid, with a TableDisplay per table): a
// GridTableDisplay for each table in the engine's "tables" event, kept up to date.
import type { PickingMode } from "./picking.js";
import { markRaw, shallowRef, useTemplateRef, watch } from "vue";
import type { CellPosition } from "../../engine/data/data/CellPosition.js";
import { Either } from "../../engine/utility-adt/utility/adt/Either.js";
import { VirtualGrid } from "../../gui-logic/stf/gui/grid/VirtualGrid.js";
import { useEngine } from "../engine/useEngine.js";
import { GridCommentDisplay } from "./GridCommentDisplay.js";
import { GridTableDisplay } from "./GridTableDisplay.js";
import { useTableActions } from "./tableActions.js";
import TableGrid from "./TableGrid.vue";

const props = defineProps<{
    // Java: View's VirtualGridManager (creating tables, pasting into empty cells, and column widths
    // changing); none, for the tests of the grid alone
    manager?: VirtualGrid.VirtualGridManager | null,
    // While a dialog picks a table or column from the grid:
    picking?: PickingMode | null,
}>();
const engine = useEngine();
const tableActions = useTableActions();
// Java: new VirtualGrid(vgManager, 10, 20), 10 columns to the right and 20 rows below the tables
const grid = markRaw(new VirtualGrid(props.manager ?? null, 10, 20));
const displays = shallowRef<readonly GridTableDisplay[]>([]);
const comments = shallowRef<readonly GridCommentDisplay[]>([]);
const tableGrid = useTemplateRef<InstanceType<typeof TableGrid>>("tableGrid");

watch(engine.tables.tables, tables =>
{
    const old = new Map(displays.value.map(d => [d.info.id, d]));
    const added: GridTableDisplay[] = [];
    const next = tables.map(info =>
    {
        const existing = old.get(info.id);
        if (existing !== undefined)
        {
            old.delete(info.id);
            existing.update(info);
            return existing;
        }
        const display = markRaw(new GridTableDisplay(info, engine.client, tableActions));
        added.push(display);
        return display;
    });
    // Java: View.removeTable: if a removed table was selected, the cell at its position is selected
    let reselect: CellPosition | null = null;
    for (const removed of old.values())
    {
        if (grid.selectionIncludes(removed))
            reselect = removed.getPosition();
        grid.removeGridArea(removed);
    }
    if (added.length > 0)
        grid.addGridAreas(added);
    displays.value = next;
    // (Once the tables have all changed: Java did it as the table was removed, before any table that
    // replaced it was added)
    if (reselect !== null)
        grid.findAndSelect(Either.left(reselect));
}, { immediate: true });

// Java: View's TableManagerListener's addComment and removeComment, a GridCommentDisplay for each
watch(engine.tables.comments, infos =>
{
    const old = new Map(comments.value.map(c => [c.info.id, c]));
    const added: GridCommentDisplay[] = [];
    const next = infos.map(info =>
    {
        const existing = old.get(info.id);
        if (existing !== undefined)
        {
            old.delete(info.id);
            existing.update(info);
            return existing;
        }
        const display = markRaw(new GridCommentDisplay(info, engine.client));
        added.push(display);
        return display;
    });
    // (As View.removeTable does for a selected table)
    let reselect: CellPosition | null = null;
    for (const removed of old.values())
    {
        if (grid.selectionIncludes(removed))
            reselect = removed.getPosition();
        grid.removeGridArea(removed);
    }
    if (added.length > 0)
        grid.addGridAreas(added);
    comments.value = next;
    if (reselect !== null)
        grid.findAndSelect(Either.left(reselect));
}, { immediate: true });

defineExpose({
    grid,
    displays: () => displays.value,
    comments: () => comments.value,
    scroller: () => tableGrid.value?.scroller() ?? null,
    // The cell editor, while a cell is being edited:
    editor: () => tableGrid.value?.editor() ?? null,
    _test_windowChanges: () => tableGrid.value?._test_windowChanges() ?? 0,
});
</script>

<template>
  <TableGrid
    ref="tableGrid"
    :grid="grid"
    :displays="displays"
    :comments="comments"
    :picking="picking"
  />
</template>
