<script setup lang="ts">
// Java: EditSortDialog: the columns a Sort sorts by, in order (SortPane each, in a FancyList), each typed
// (with completions of the source's columns) or clicked in the grid (a column of the source, or of the
// Sort): into the field being edited (if it was in the last 200 ms), else added at the end.  It isn't
// modal.  (docs/gui-spec/transformations.md)
import { computed, markRaw, nextTick, shallowRef, watch } from "vue";
import { TypeExpression } from "../../engine/expressions/transformations/expression/type/TypeExpressions.js";
import type { DataType } from "../../engine/types/data/datatype/DataType.js";
import type { TypeManager } from "../../engine/types/data/datatype/TypeManager.js";
import { Either } from "../../engine/utility-adt/utility/adt/Either.js";
import { InternalException } from "../../engine/utility-error/error/InternalException.js";
import { UserException } from "../../engine/utility-error/error/UserException.js";
import { IdentifierUtility } from "../../engine/utility/utility/IdentifierUtility.js";
import { TranslationUtility } from "../../engine/utility/utility/TranslationUtility.js";
import ErrorableLightDialog from "../components/dialogs/ErrorableLightDialog.vue";
import ErrorLabel from "../components/dialogs/ErrorLabel.vue";
import FancyList from "../components/FancyList.vue";
import type { ColumnLookupInfo, SortDirectionName } from "../engine/protocol.js";
import type { PickingMode } from "../grid/picking.js";
import SortPane from "./SortPane.vue";

const open = defineModel<boolean>("open", { required: true });
const props = defineProps<{
    // A copy of the project's types and units (for the columns' types)
    typeManager: TypeManager,
    // The tables: us, the Sort, and src, its source
    lookupInfo: ColumnLookupInfo,
    // The columns it sorts by, or null for a new Sort (which starts with one to edit)
    originalSortBy: readonly (readonly [string, SortDirectionName])[] | null,
    // Java: lastScreenPos, where picking starts (and the dialog is centred)
    centreOn: { readonly x: number, readonly y: number } | null,
}>();
const emit = defineEmits<{
    ok: [sortBy: [string, SortDirectionName][]],
    picking: [mode: PickingMode | null],
}>();

interface Item
{
    readonly key: number;
    readonly column: string;
    readonly direction: SortDirectionName;
}
type Pane = { setContent(column: string): void, lastEditTimeMillis(): number };

let nextKey = 0;
const item = (column: string, direction: SortDirectionName): Item => ({ key: nextKey++, column, direction });
const items = shallowRef<readonly Item[]>((props.originalSortBy ?? []).map(([c, d]) => item(c, d)));
const list = shallowRef<{ addToEnd(item: Item, editImmediately: boolean): void, focusAddButton(): Promise<void> } | null>(null);
const panes = new Map<number, Pane>();
const buttonWidths = shallowRef(new Map<number, number>());

// Java: srcTable, and dataWithColumns (the source's columns, else the Sort's)
const table = (id: string | null): ColumnLookupInfo["tables"][number] | null => props.lookupInfo.tables.find(t => t.id === id && t.single) ?? null;
const srcTable = table(props.lookupInfo.src);
const dataWithColumns = srcTable?.columns ?? table(props.lookupInfo.us)?.columns ?? null;
const srcColumns = srcTable?.columns?.map(c => c.name) ?? [];

// Java: calculateTypeOf
function typeOf(column: string): DataType | null
{
    const c = dataWithColumns?.find(c => c.name === column);
    if (c === undefined || c.type === null)
        return null;
    try
    {
        return TypeExpression.parseTypeExpression(c.type).toDataType(props.typeManager);
    }
    catch (e)
    {
        if (!(e instanceof UserException || e instanceof InternalException))
            throw e;
        return null;
    }
}

const minButtonWidth = computed(() => Math.max(0, ...[...buttonWidths.value.values()]));
function buttonWidth(key: number, width: number): void
{
    if (buttonWidths.value.get(key) !== width)
        buttonWidths.value = new Map(buttonWidths.value).set(key, width);
}

function setPane(key: number, pane: unknown): void
{
    if (pane === null)
        panes.delete(key);
    else
        panes.set(key, pane as Pane);
}

function calculateResult(): Either<string, [string, SortDirectionName][]>
{
    const r: [string, SortDirectionName][] = [];
    for (const i of items.value)
    {
        const columnId = IdentifierUtility.asExpressionIdentifier(i.column);
        if (columnId === null)
            return Either.left(TranslationUtility.getString("edit.column.invalid.column.name"));
        r.push([columnId, i.direction]);
    }
    return Either.right(r);
}

// Java: SortList.pickColumnIfEditing
function pickColumnIfEditing(column: string): void
{
    const curTime = Date.now();
    const curEditing = items.value.map(i => panes.get(i.key)).find(p => p !== undefined && p.lastEditTimeMillis() > curTime - 200);
    if (curEditing !== undefined)
    {
        curEditing.setContent(column);
        void list.value?.focusAddButton();
    }
    else
        list.value?.addToEnd(item(column, "ASCENDING"), false);
}

// Java: enableColumnPickingMode, for the source's columns or the Sort's
const picking = markRaw<PickingMode>({
    kind: "column",
    include: (t, column) => column !== null && (t === props.lookupInfo.src || t === props.lookupInfo.us),
    onPick: picked =>
    {
        if (picked.column !== null)
            pickColumnIfEditing(picked.column);
    },
    target: () => document.querySelector(".sort-list-dialog")?.closest(".light-dialog")?.getBoundingClientRect() ?? null,
    startPoint: props.centreOn,
});

watch(open, isOpen =>
{
    emit("picking", isOpen ? picking : null);
    // Java: a new Sort starts with a column to edit
    if (isOpen && props.originalSortBy === null)
        void nextTick(() => setTimeout(() => list.value?.addToEnd(item("", "ASCENDING"), true)));
}, { immediate: true });
</script>

<template>
  <ErrorableLightDialog
    v-model:open="open"
    label="Choose the columns to sort by"
    resizable
    :modal="false"
    :centre-on="centreOn"
    :calculate-result="calculateResult"
    @ok="r => emit('ok', r)"
  >
    <template #default="{ error }">
      <div class="sort-list-dialog">
        <label>Choose the columns to sort by</label>
        <FancyList
          :ref="(l: unknown) => { list = l as typeof list; }"
          v-model:items="items"
          class="sort-list"
          :new-item="() => item('', 'ASCENDING')"
        >
          <template #cell="{ item: cell, editImmediately, setItem }">
            <SortPane
              :ref="(p: unknown) => setPane(cell.key, p)"
              :initial-column="cell.column"
              :initial-direction="cell.direction"
              :src-columns="srcColumns"
              :type-of="typeOf"
              :edit-immediately="editImmediately"
              :min-button-width="minButtonWidth"
              @value="(column: string, direction: SortDirectionName) => setItem({ key: cell.key, column, direction })"
              @button-width="(w: number) => buttonWidth(cell.key, w)"
            />
          </template>
        </FancyList>
        <ErrorLabel :error="error" />
      </div>
    </template>
  </ErrorableLightDialog>
</template>

<style scoped>
.sort-list-dialog {
    display: flex;
    flex-direction: column;
    gap: 5px;
}
.sort-list {
    min-width: 250px;
    min-height: 150px;
    width: 300px;
    height: 250px;
}
</style>
