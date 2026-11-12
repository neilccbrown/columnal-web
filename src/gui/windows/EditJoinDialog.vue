<script setup lang="ts">
// Java: EditJoinDialog: a Join's primary and secondary tables (PickTablePane each), the pairs of columns
// whose values must match (a FancyList of two fields, "=" between), and whether unmatched primary rows
// are kept.  It isn't modal: a table or column clicked in the grid goes into the field focused most
// recently (in the last 500 ms; for a column field, a column of that side's table); Escape doesn't
// close it.  (docs/gui-spec/transformations.md)
import { markRaw, nextTick, shallowRef, useTemplateRef, watch } from "vue";
import { Either } from "../../engine/utility-adt/utility/adt/Either.js";
import { IdentifierUtility } from "../../engine/utility/utility/IdentifierUtility.js";
import { TranslationUtility } from "../../engine/utility/utility/TranslationUtility.js";
import ErrorableLightDialog from "../components/dialogs/ErrorableLightDialog.vue";
import ErrorLabel from "../components/dialogs/ErrorLabel.vue";
import FancyList from "../components/FancyList.vue";
import HelpBox from "../components/HelpBox.vue";
import { makeId } from "../components/menus/menus.js";
import PickTablePane from "../components/PickTablePane.vue";
import type { PickingMode } from "../grid/picking.js";
import { t } from "../i18n.js";

export interface JoinDetails
{
    readonly primary: string;
    readonly secondary: string;
    readonly leftJoin: boolean;
    readonly columns: readonly (readonly [string, string])[];
}

const open = defineModel<boolean>("open", { required: true });
const props = defineProps<{
    // The tables' names, the Join (which can't be picked), and those which can't be picked in the grid
    // (Java picked only from a TableDisplay: not Checks)
    tables: readonly string[],
    join: string,
    excludeInGrid: readonly string[],
    initial: JoinDetails,
}>();
const emit = defineEmits<{
    ok: [details: JoinDetails],
    picking: [mode: PickingMode | null],
}>();

interface Item
{
    readonly key: number;
    readonly primary: string;
    readonly secondary: string;
}
type TablePane = { focus(): void, setContent(table: string | null): void, text(): string, lastFocusedTime(): number };

let nextKey = 0;
const item = (primary: string, secondary: string): Item => ({ key: nextKey++, primary, secondary });
const items = shallowRef<readonly Item[]>(props.initial.columns.map(([a, b]) => item(a, b)));
const leftJoin = shallowRef(props.initial.leftJoin);
const list = shallowRef<{ focusAddButton(): Promise<void> } | null>(null);
const primaryPane = useTemplateRef<TablePane>("primaryPane");
const secondaryPane = useTemplateRef<TablePane>("secondaryPane");
// Java: DualColumnPane's fields, and when each last lost the focus
const fields = new Map<string, HTMLInputElement>();
const lastEdit = new Map<string, number>();

function setField(key: string, el: unknown): void
{
    if (el instanceof HTMLInputElement)
        fields.set(key, el);
    else
        fields.delete(key);
}

// Java: makeCellContent's editImmediately, which focuses the primary column's field once shown
const focusedOnce = new Set<number>();
function primaryFieldRef(key: number, el: unknown, editImmediately: boolean): void
{
    setField(key + "primary", el);
    if (editImmediately && el instanceof HTMLInputElement && !focusedOnce.has(key))
    {
        focusedOnce.add(key);
        setTimeout(() => el.focus());
    }
}

const asTableId = (text: string): string | null => IdentifierUtility.asExpressionIdentifier(text);

function calculateResult(): Either<string, JoinDetails>
{
    const primary = asTableId(primaryPane.value?.text() ?? "");
    const secondary = asTableId(secondaryPane.value?.text() ?? "");
    if (primary === null || secondary === null)
        return Either.left(TranslationUtility.getString("join.invalid.table.names"));
    const columns: [string, string][] = [];
    for (const i of items.value)
    {
        const a = IdentifierUtility.asExpressionIdentifier(i.primary);
        const b = IdentifierUtility.asExpressionIdentifier(i.secondary);
        if (a === null || b === null)
            return Either.left(TranslationUtility.getString("join.invalid.column.names"));
        columns.push([a, b]);
    }
    return Either.right({ primary, secondary, leftJoin: leftJoin.value, columns });
}

type Pick = { readonly kind: "table", readonly set: (table: string) => void } | { readonly kind: "column", readonly table: string, readonly set: (column: string) => void };

/**
 * Java: pick(): of the table fields and the column fields (those whose side's table is named), the one
 * focused in the last 500 ms, earliest first (as Java sorts them).
 */
function pick(): Pick | null
{
    const curTime = Date.now();
    const candidates: [number, Pick][] = [];
    const pp = primaryPane.value;
    const sp = secondaryPane.value;
    if (pp !== null)
        candidates.push([pp.lastFocusedTime(), { kind: "table", set: tbl => pp.setContent(tbl) }]);
    if (sp !== null)
        candidates.push([sp.lastFocusedTime(), { kind: "table", set: tbl => sp.setContent(tbl) }]);
    const primaryTable = asTableId(pp?.text() ?? "");
    const secondaryTable = asTableId(sp?.text() ?? "");
    for (const i of items.value)
    {
        for (const [side, table] of [["primary", primaryTable], ["secondary", secondaryTable]] as const)
        {
            if (table === null)
                continue;
            const key = i.key + side;
            const field = fields.get(key);
            const time = field !== undefined && document.activeElement === field ? Date.now() : lastEdit.get(key) ?? 0;
            candidates.push([time, { kind: "column", table, set: column => setColumn(i.key, side, column) }]);
        }
    }
    return candidates.filter(([time]) => time > curTime - 500).sort(([a], [b]) => a - b)[0]?.[1] ?? null;
}

// Java: the field's setText (which its cell's value follows, as when typed)
function setColumn(key: number, side: "primary" | "secondary", column: string): void
{
    const field = fields.get(key + side);
    if (field === undefined)
        return;
    field.value = column;
    field.dispatchEvent(new Event("input", { bubbles: true }));
}

const picking = markRaw<PickingMode>({
    kind: "tableOrColumn",
    include: (table, column) =>
    {
        const p = pick();
        if (p === null || table === props.join || props.excludeInGrid.includes(table))
            return false;
        return p.kind === "table" ? column === null : column !== null && p.table === table;
    },
    onPick: picked =>
    {
        const p = pick();
        if (p?.kind === "table")
            p.set(picked.table);
        else if (p?.kind === "column" && p.table === picked.table && picked.column !== null)
            p.set(picked.column);
    },
    target: () => document.querySelector(".edit-join-content")?.closest(".light-dialog")?.getBoundingClientRect() ?? null,
    startPoint: null,
});

watch(open, isOpen =>
{
    emit("picking", isOpen ? picking : null);
    if (isOpen)
        void nextTick(() => setTimeout(() => primaryPane.value?.focus()));
}, { immediate: true });
</script>

<template>
  <ErrorableLightDialog
    v-model:open="open"
    :label="t('join.edit.explanation')"
    resizable
    :modal="false"
    :close-on-escape="false"
    :calculate-result="calculateResult"
    @ok="r => emit('ok', r)"
  >
    <template #default="{ error }">
      <div class="edit-join-content">
        <div class="edit-join-top">
          <div class="label-wrap-help">
            <span>{{ t("join.edit.explanation") }}</span>
            <HelpBox help-id="edit-join/tables" />
          </div>
          <div class="edit-join-tables">
            <div>
              <label class="table-label">{{ t("join.edit.table.primary") }}</label>
              <PickTablePane
                ref="primaryPane"
                :tables="tables"
                :exclude="[join]"
                :initial="initial.primary"
                @picked="secondaryPane?.focus()"
              />
            </div>
            <div>
              <label class="table-label">{{ t("join.edit.table.secondary") }}</label>
              <PickTablePane
                ref="secondaryPane"
                :tables="tables"
                :exclude="[join]"
                :initial="initial.secondary"
                @picked="list?.focusAddButton()"
              />
            </div>
          </div>
          <div class="label-wrap-help">
            <span>{{ t("join.edit.columns") }}</span>
            <HelpBox help-id="edit-join/columns" />
          </div>
        </div>
        <FancyList
          :ref="(l: unknown) => { list = l as typeof list; }"
          v-model:items="items"
          class="join-column-list"
          :allow-reordering="false"
          :new-item="() => item('', '')"
        >
          <template #cell="{ item: cell, editImmediately, setItem }">
            <div class="dual-column-pane">
              <input
                :ref="(el: unknown) => primaryFieldRef(cell.key, el, editImmediately)"
                type="text"
                class="text-field join-primary-column"
                :value="cell.primary"
                aria-label="Primary column"
                @input="e => setItem({ ...cell, primary: (e.target as HTMLInputElement).value })"
                @blur="lastEdit.set(cell.key + 'primary', Date.now())"
              >
              <span> = </span>
              <input
                :ref="(el: unknown) => setField(cell.key + 'secondary', el)"
                type="text"
                class="text-field join-secondary-column"
                :value="cell.secondary"
                aria-label="Secondary column"
                @input="e => setItem({ ...cell, secondary: (e.target as HTMLInputElement).value })"
                @blur="lastEdit.set(cell.key + 'secondary', Date.now())"
              >
            </div>
          </template>
        </FancyList>
        <div class="edit-join-left-join">
          <label>
            <input
              v-model="leftJoin"
              type="checkbox"
              :class="makeId('join.isLeftJoin')"
            >
            {{ t("join.isLeftJoin") }}
          </label>
          <HelpBox help-id="edit-join/left-join" />
        </div>
        <ErrorLabel :error="error" />
      </div>
    </template>
  </ErrorableLightDialog>
</template>

<style scoped>
.edit-join-content {
    display: flex;
    flex-direction: column;
    gap: 10px;
    width: 650px;
}
.edit-join-top {
    display: flex;
    flex-direction: column;
    gap: 10px;
}
.label-wrap-help {
    display: flex;
    align-items: center;
    gap: 5px;
}
.edit-join-tables {
    display: flex;
    justify-content: space-between;
    gap: 10px;
}
.edit-join-tables > div {
    flex: 1;
}
.join-column-list {
    min-height: 100px;
}
.dual-column-pane {
    display: flex;
    align-items: center;
    margin: 1px 5px 3px 2px;
}
.dual-column-pane input {
    flex: 1;
}
.edit-join-left-join {
    display: flex;
    align-items: center;
    gap: 5px;
}
</style>
