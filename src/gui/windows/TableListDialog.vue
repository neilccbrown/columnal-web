<script setup lang="ts">
// Java: TableListDialog: an editable list of tables (as Concatenate's), each picked by name
// (PickTablePane) or by clicking it in the grid: into the field being edited (if it was in the last
// 200 ms), else added at the end.  It isn't modal.  (docs/gui-spec/transformations.md)
import { markRaw, nextTick, shallowRef, watch } from "vue";
import { Either } from "../../engine/utility-adt/utility/adt/Either.js";
import { IdentifierUtility } from "../../engine/utility/utility/IdentifierUtility.js";
import { TranslationUtility } from "../../engine/utility/utility/TranslationUtility.js";
import ErrorableLightDialog from "../components/dialogs/ErrorableLightDialog.vue";
import ErrorLabel from "../components/dialogs/ErrorLabel.vue";
import FancyList from "../components/FancyList.vue";
import PickTablePane from "../components/PickTablePane.vue";
import type { PickingMode } from "../grid/picking.js";

const open = defineModel<boolean>("open", { required: true });
const props = defineProps<{
    // The tables' names, and the ones which can't be picked (Java: the table being edited)
    tables: readonly string[],
    exclude: readonly string[],
    // Those which can't be picked in the grid (Java picked only from a TableDisplay: not Checks)
    excludeInGrid: readonly string[],
    originalItems: readonly string[],
    centreOn: { readonly x: number, readonly y: number } | null,
}>();
const emit = defineEmits<{
    ok: [tables: string[]],
    picking: [mode: PickingMode | null],
}>();

interface Item
{
    readonly key: number;
    readonly table: string;
}
type Pane = { focus(): void, setContent(table: string | null): void, text(): string, lastFocusedTime(): number };

let nextKey = 0;
const item = (table: string): Item => ({ key: nextKey++, table });
const items = shallowRef<readonly Item[]>(props.originalItems.map(item));
const list = shallowRef<{ addToEnd(item: Item, editImmediately: boolean): void, focusAddButton(): Promise<void>, clearSelection(): void } | null>(null);
const panes = new Map<number, Pane>();

function setPane(key: number, pane: unknown): void
{
    if (pane === null)
        panes.delete(key);
    else
        panes.set(key, pane as Pane);
}

// (The cell's value is what was picked; what is typed since is in its pane, see calculateResult)
function picked(cell: Item, setItem: (item: Item) => void, table: string): void
{
    setItem({ key: cell.key, table });
    void list.value?.focusAddButton();
}

/**
 * The tables, as their fields show them.
 *
 * PORT-NOTE: bug fix.  Java's cells took only a table picked (from the completions or the grid), so a
 * name typed without choosing it was kept as the cell's previous value, and with none, OK gave "Invalid
 * table name".
 */
function calculateResult(): Either<string, string[]>
{
    const r: string[] = [];
    for (const i of items.value)
    {
        const s = IdentifierUtility.asExpressionIdentifier(panes.get(i.key)?.text() ?? i.table);
        if (s === null)
            return Either.left(TranslationUtility.getString("edit.column.invalid.table.name"));
        r.push(s);
    }
    return Either.right(r);
}

// Java: pickTableIfEditing
function pickTableIfEditing(table: string): void
{
    const curTime = Date.now();
    const curEditing = items.value.map(i => panes.get(i.key)).find(p => p !== undefined && p.lastFocusedTime() > curTime - 200);
    if (curEditing !== undefined)
    {
        curEditing.setContent(table);
        void list.value?.focusAddButton();
    }
    else
        list.value?.addToEnd(item(table), false);
}

const picking = markRaw<PickingMode>({
    kind: "table",
    include: table => !props.exclude.includes(table) && !props.excludeInGrid.includes(table),
    onPick: picked => pickTableIfEditing(picked.table),
    target: () => document.querySelector(".table-list-dialog")?.closest(".light-dialog")?.getBoundingClientRect() ?? null,
    startPoint: props.centreOn,
});

watch(open, isOpen =>
{
    emit("picking", isOpen ? picking : null);
    // Java: with no tables, one to edit at once
    if (isOpen && props.originalItems.length === 0)
        void nextTick(() => setTimeout(() => list.value?.addToEnd(item(""), true)));
}, { immediate: true });
</script>

<template>
  <ErrorableLightDialog
    v-model:open="open"
    label="Choose the tables to concatenate"
    resizable
    :modal="false"
    :centre-on="centreOn"
    :calculate-result="calculateResult"
    @ok="r => emit('ok', r)"
  >
    <template #default="{ error }">
      <div class="table-list-dialog">
        <label>Choose the tables to concatenate</label>
        <FancyList
          :ref="(l: unknown) => { list = l as typeof list; }"
          v-model:items="items"
          class="table-list"
          :new-item="() => item('')"
        >
          <template #cell="{ item: cell, editImmediately, setItem }">
            <PickTablePane
              :ref="(p: unknown) => setPane(cell.key, p)"
              :tables="tables"
              :exclude="exclude"
              :initial="cell.table"
              @vue:mounted="() => { if (editImmediately) panes.get(cell.key)?.focus(); }"
              @focus="list?.clearSelection()"
              @picked="(t: string) => picked(cell, setItem, t)"
            />
          </template>
        </FancyList>
        <ErrorLabel :error="error" />
      </div>
    </template>
  </ErrorableLightDialog>
</template>

<style scoped>
.table-list-dialog {
    display: flex;
    flex-direction: column;
    gap: 5px;
}
.table-list {
    min-width: 200px;
    min-height: 150px;
    width: 250px;
    height: 200px;
}
</style>
