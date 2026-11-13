<script setup lang="ts">
// Java: AggregateSplitByPane: "Calculate each expression once per:" the whole table, or each unique value
// of the columns in the list below (shown only then; with none, choosing it adds one to edit).  Each
// column is typed (with completions of the source's columns containing the text, and "Type column name
// or click on column" above it while focused) or clicked in the grid (pickColumnIfEditing).
// (docs/gui-spec/transformations.md)
import { shallowRef, useId } from "vue";
import type { ColumnId } from "../../engine/identifiers/id/ColumnId.js";
import { AutoComplete } from "../../gui-logic/dialogs-non-expression/gui/dialog/AutoComplete.js";
import { ColumnNameTextField } from "../../gui-logic/dialogs-non-expression/gui/dialog/ColumnNameTextField.js";
import { t } from "../i18n.js";
import ErrorableTextField from "./ErrorableTextField.vue";
import FancyList from "./FancyList.vue";
import HelpBox from "./HelpBox.vue";

const props = defineProps<{
    // The source's columns (for the completions)
    srcColumns: readonly string[],
    originalSplitBy: readonly string[],
}>();

interface Item
{
    readonly key: number;
    readonly text: string;
}
type Field = { focus(): void, setText(text: string): void, lastFocusedTime(): number, value: ColumnId | null };

let nextKey = 0;
const item = (text: string): Item => ({ key: nextKey++, text });
const items = shallowRef<readonly Item[]>(props.originalSplitBy.map(item));
const wholeTable = shallowRef(props.originalSplitBy.length === 0);
const focusedKey = shallowRef<number | null>(null);
const list = shallowRef<{ addToEnd(item: Item, editImmediately: boolean): void, focusAddButton(): Promise<void> } | null>(null);
const fields = new Map<number, Field>();
const radioName = useId();

class ColumnCompletion extends AutoComplete.SimpleCompletion
{
    public constructor(public readonly column: string)
    {
        super(column, null);
    }
}

// Java: ColumnPane's AutoComplete (one per field)
function completions(): AutoComplete.Model<AutoComplete.Completion>
{
    return new AutoComplete.Model<ColumnCompletion>({
        calculateCompletions: s => props.srcColumns.filter(c => c.includes(s)).map(c => new ColumnCompletion(c)),
    }, {
        doubleClick: (_currentText, selectedItem) => selectedItem.column,
        keyboardSelect: (_textBefore, _textAfter, selectedItem) => selectedItem !== null ? selectedItem.column : null,
    }, AutoComplete.WhitespacePolicy.ALLOW_ONE_ANYWHERE_TRIM) as unknown as AutoComplete.Model<AutoComplete.Completion>;
}
const models = new Map<number, AutoComplete.Model<AutoComplete.Completion>>();
function model(key: number): AutoComplete.Model<AutoComplete.Completion>
{
    let m = models.get(key);
    if (m === undefined)
    {
        m = completions();
        models.set(key, m);
    }
    return m;
}

function setField(key: number, field: unknown): void
{
    if (field === null)
        fields.delete(key);
    else
        fields.set(key, field as Field);
}

// (A new field to edit, once it's shown)
function focusLater(key: number): void
{
    setTimeout(() => fields.get(key)?.focus());
}

// Java: the toggle group's listener: the list shows for "each unique value of", with one to edit if empty
function chooseWholeTable(whole: boolean): void
{
    wholeTable.value = whole;
    if (!whole && items.value.length === 0)
        list.value?.addToEnd(item(""), true);
}

/**
 * Java: getItems: the columns (none for "Whole table"), or null if one isn't a valid name.
 *
 * PORT-NOTE: bug fix.  Java only hid the list for "Whole table", so its columns were still the result: an
 * Aggregate split by columns couldn't be made to use the whole table (and with a blank column left in the
 * list, the dialog couldn't be OKed).
 */
function getItems(): string[] | null
{
    if (wholeTable.value)
        return [];
    const r: string[] = [];
    for (const i of items.value)
    {
        const value = ColumnNameTextField.convert(i.text).getValue();
        if (value === null)
            return null;
        r.push(value.getRaw());
    }
    return r;
}

// Java: SplitList.pickColumnIfEditing: into the field edited in the last 200 ms, else added at the end
function pickColumnIfEditing(column: string): void
{
    const curTime = Date.now();
    const curEditing = items.value.map(i => fields.get(i.key)).find(f => f !== undefined && f.lastFocusedTime() > curTime - 200);
    if (curEditing !== undefined)
    {
        curEditing.setText(column);
        void list.value?.focusAddButton();
    }
    else
        list.value?.addToEnd(item(column), false);
}

defineExpose({
    getItems,
    pickColumnIfEditing,
    // Java: getTimedFocusables (the fields), when last focused
    lastFocusedTime: (): number => Math.max(-1, ...items.value.map(i => fields.get(i.key)?.lastFocusedTime() ?? -1)),
});
</script>

<template>
  <div class="split-by-pane">
    <label class="split-by-header">Calculate each expression<br>once per:</label>
    <div class="split-by-grid">
      <input
        :id="radioName + '-whole'"
        type="radio"
        class="split-by-whole-table"
        :name="radioName"
        :checked="wholeTable"
        @change="chooseWholeTable(true)"
      >
      <label :for="radioName + '-whole'">{{ t("agg.split.whole.table") }}</label>
      <HelpBox help-id="split-by/whole-table" />
      <input
        :id="radioName + '-columns'"
        type="radio"
        class="split-by-columns"
        :name="radioName"
        :checked="!wholeTable"
        @change="chooseWholeTable(false)"
      >
      <label :for="radioName + '-columns'">{{ t("agg.split.columns") }}</label>
      <HelpBox help-id="split-by/by-columns" />
      <FancyList
        :ref="(l: unknown) => { list = l as typeof list; }"
        v-model:items="items"
        class="split-list"
        :style="{ visibility: wholeTable ? 'hidden' : 'visible' }"
        :new-item="() => item('')"
        :add-button-text="t('aggregate.add.column')"
      >
        <template #cell="{ item: cell, editImmediately, setItem }">
          <div
            class="column-pane"
            @focusin="focusedKey = cell.key"
            @focusout="focusedKey = null"
          >
            <label
              class="column-pane-instruction"
              :style="{ visibility: focusedKey === cell.key ? 'visible' : 'hidden' }"
            >{{ t("pick.column.instruction") }}</label>
            <ErrorableTextField
              :ref="(f: unknown) => setField(cell.key, f)"
              :text="cell.text"
              class="split-by-column-field"
              :converter="ColumnNameTextField.convert"
              :auto-complete="model(cell.key)"
              :aria-label="t('agg.split.columns')"
              @vue:mounted="() => { if (editImmediately) focusLater(cell.key); }"
              @update:text="(text: string) => setItem({ key: cell.key, text })"
            />
          </div>
        </template>
      </FancyList>
    </div>
  </div>
</template>

<style scoped>
.split-by-pane {
    display: flex;
    flex-direction: column;
    gap: 5px;
}
/* Java: LabelledGrid: the radio buttons' rows, then the list below them */
.split-by-grid {
    display: grid;
    grid-template-columns: auto 1fr auto;
    align-items: center;
    gap: 5px;
}
.split-list {
    grid-column: 1 / -1;
    min-height: 130px;
}
.column-pane {
    display: flex;
    flex-direction: column;
    margin: 0 2px 2px 5px;
}
.column-pane-instruction {
    font-size: 75%;
    color: rgb(77 77 77);
}
</style>
