<script setup lang="ts">
// Java: EditSortDialog.SortPane: a column to sort by (a field with completions of the source's columns
// containing the text, and "Type column name or click on column" above it while focused) and its
// direction (DirectionButton: the column type's smallest and largest examples, in order, beside a
// triangle pointing the way it sorts; clicking it swaps the direction).
import { computed, onMounted, onUpdated, shallowRef, useTemplateRef } from "vue";
import type { DataType } from "../../engine/types/data/datatype/DataType.js";
import { AutoComplete } from "../../gui-logic/dialogs-non-expression/gui/dialog/AutoComplete.js";
import AutoCompleteField from "../components/AutoCompleteField.vue";
import type { SortDirectionName } from "../engine/protocol.js";
import { sortExamples } from "./sortDirection.js";

const props = defineProps<{
    initialColumn: string,
    initialDirection: SortDirectionName,
    // The source's columns (for the completions), and the type of a column by name (or null)
    srcColumns: readonly string[],
    typeOf: (column: string) => DataType | null,
    editImmediately: boolean,
    // Java: SortList.updateButtonWidths: the widest of the direction buttons
    minButtonWidth: number,
}>();
const emit = defineEmits<{
    value: [column: string, direction: SortDirectionName],
    // The direction button's own width
    buttonWidth: [width: number],
}>();

class ColumnCompletion extends AutoComplete.SimpleCompletion
{
    public constructor(public readonly column: string)
    {
        super(column, null);
    }
}

const text = shallowRef(props.initialColumn);
const direction = shallowRef<SortDirectionName>(props.initialDirection);
const focused = shallowRef(false);
const field = useTemplateRef<{ focus(): void, setContentDirect(text: string): void }>("field");
const button = useTemplateRef<HTMLButtonElement>("button");
let lastEditTimeMillis = -1;

const model = new AutoComplete.Model<ColumnCompletion>({
    calculateCompletions: s => props.srcColumns.filter(c => c.includes(s)).map(c => new ColumnCompletion(c)),
}, {
    doubleClick: (_currentText, selectedItem) => selectedItem.column,
    keyboardSelect: (_textBefore, _textAfter, selectedItem) => selectedItem !== null ? selectedItem.column : null,
}, AutoComplete.WhitespacePolicy.ALLOW_ONE_ANYWHERE_TRIM);

const examples = computed(() => sortExamples(props.typeOf(text.value)));

function textChanged(value: string): void
{
    text.value = value;
    emit("value", value, direction.value);
}

function toggle(): void
{
    direction.value = direction.value === "ASCENDING" ? "DESCENDING" : "ASCENDING";
    emit("value", text.value, direction.value);
}

function focusChanged(f: boolean): void
{
    focused.value = f;
    // Update whether focus is arriving or leaving:
    lastEditTimeMillis = Date.now();
}

// (Its width without the minimum, as JavaFX's prefWidth)
function reportWidth(): void
{
    const b = button.value;
    if (b === null)
        return;
    const min = b.style.minWidth;
    b.style.minWidth = "";
    const width = b.getBoundingClientRect().width;
    b.style.minWidth = min;
    emit("buttonWidth", width);
}
onMounted(() =>
{
    reportWidth();
    if (props.editImmediately)
        setTimeout(() => field.value?.focus());
});
onUpdated(reportWidth);

defineExpose({
    focus: (): void => field.value?.focus(),
    // Java: setContent
    setContent: (column: string): void =>
    {
        field.value?.setContentDirect(column);
        textChanged(column);
    },
    // Java: lastEditTimeMillis
    lastEditTimeMillis: (): number => focused.value ? Date.now() : lastEditTimeMillis,
});
</script>

<template>
  <div class="sort-pane">
    <label
      class="sort-pane-instruction"
      :style="{ visibility: focused ? 'visible' : 'hidden' }"
    >Type column name or click on column</label>
    <AutoCompleteField
      ref="field"
      :text="text"
      :model="model"
      field-class="sort-column-field"
      aria-label="Column"
      @update:text="textChanged"
      @focus="focusChanged(true)"
      @blur="focusChanged(false)"
    />
    <button
      ref="button"
      type="button"
      class="sort-direction-button"
      :style="{ minWidth: minButtonWidth + 'px' }"
      :aria-label="direction === 'ASCENDING' ? 'Ascending' : 'Descending'"
      @click="toggle"
    >
      <span class="sort-direction-labels">
        <span>{{ direction === "ASCENDING" ? examples.small : examples.large }}</span>
        <span>{{ direction === "ASCENDING" ? examples.large : examples.small }}</span>
      </span>
      <svg
        class="sort-direction-icon"
        width="8"
        height="25"
        viewBox="0 0 8 25"
        :style="{ transform: direction === 'ASCENDING' ? undefined : 'rotate(180deg)' }"
      ><polygon points="4,0 8,25 0,25" /></svg>
    </button>
  </div>
</template>

<style scoped>
/* Java: a BorderPane, the instruction above the field, and the button to its right */
.sort-pane {
    display: grid;
    grid-template-columns: 1fr auto;
    grid-template-rows: auto auto;
    align-items: center;
    column-gap: 4px;
}
.sort-pane-instruction {
    grid-column: 1;
    margin-left: 5px;
    font-size: 75%;
    color: rgb(77 77 77);
}
.sort-pane :deep(.sort-column-field) {
    grid-column: 1;
    grid-row: 2;
    margin: 0 2px 2px 5px;
}
.sort-direction-button {
    grid-column: 2;
    grid-row: 1 / 3;
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin: 0 4px;
    padding: 2px 4px;
}
.sort-direction-labels {
    display: flex;
    flex-direction: column;
    align-items: center;
    font-size: 80%;
    line-height: 1.1;
}
.sort-direction-icon {
    margin: 0 1px 0 3px;
}
/* dialogs.scss: .sort-direction-icon */
.sort-direction-icon polygon {
    fill: rgb(128 128 128);
}
</style>
