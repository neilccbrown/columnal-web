<script setup lang="ts">
// The grid of the engine's tables (Java: View's VirtualGrid, with a TableDisplay per table): a
// GridTableDisplay for each table in the engine's "tables" event, kept up to date.
import { markRaw, shallowRef, useTemplateRef, watch } from "vue";
import { VirtualGrid } from "../../gui-logic/stf/gui/grid/VirtualGrid.js";
import { useEngine } from "../engine/useEngine.js";
import { GridTableDisplay } from "./GridTableDisplay.js";
import TableGrid from "./TableGrid.vue";

const engine = useEngine();
// Java: new VirtualGrid(vgManager, 10, 20), 10 columns to the right and 20 rows below the tables
const grid = markRaw(new VirtualGrid(null, 10, 20));
const displays = shallowRef<readonly GridTableDisplay[]>([]);
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
        const display = markRaw(new GridTableDisplay(info, engine.client));
        added.push(display);
        return display;
    });
    for (const removed of old.values())
        grid.removeGridArea(removed);
    if (added.length > 0)
        grid.addGridAreas(added);
    displays.value = next;
}, { immediate: true });

defineExpose({
    grid,
    displays: () => displays.value,
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
  />
</template>
