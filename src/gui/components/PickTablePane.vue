<script setup lang="ts">
// Java: PickTablePane: a field for a table's name, with completions of the tables' names containing the
// text (but not those excluded), and "Click on a table or type table name" above it while focused.
// Choosing a completion (Enter or Tab, or a double click), or Enter on the exact name of a table, picks
// that table; so does setContent (a table clicked in the grid).  (docs/gui-spec/transformations.md)
import { PopoverAnchor, PopoverContent, PopoverPortal, PopoverRoot } from "reka-ui";
import { shallowRef, useTemplateRef } from "vue";
import { TableId } from "../../engine/identifiers/id/TableId.js";
import { AutoComplete } from "../../gui-logic/dialogs-non-expression/gui/dialog/AutoComplete.js";
import { t } from "../i18n.js";
import AutoCompleteField from "./AutoCompleteField.vue";

const props = withDefaults(defineProps<{
    // The tables' names, and those which can't be picked
    tables: readonly string[],
    exclude: readonly string[],
    initial?: string,
    fieldWidth?: number | null,
}>(), {
    initial: "",
    fieldWidth: null,
});
const emit = defineEmits<{
    // Java: setResultAndFinishEditing
    picked: [table: string],
    // Java: currentlyEditing, the field's focus
    focus: [],
    blur: [],
}>();

class TableCompletion extends AutoComplete.SimpleCompletion
{
    public constructor(public readonly t: string)
    {
        super(t, null);
    }
}

const text = shallowRef(props.initial);
const fieldFocused = shallowRef(false);
const field = useTemplateRef<{ focus(): void, setContentDirect(text: string): void }>("field");
// Java: TimedFocusable's lastEditTimeMillis: when the field last gained or lost the focus
let lastEditTimeMillis = -1;

function complete(table: string): string
{
    emit("picked", table);
    return new TableId(table).getOutput();
}

const model = new AutoComplete.Model<TableCompletion>({
    calculateCompletions: s => props.tables.filter(table => !props.exclude.includes(table) && new TableId(table).getOutput().includes(s)).map(table => new TableCompletion(table)),
}, {
    doubleClick: (_currentText, selectedItem) => complete(selectedItem.t),
    keyboardSelect: (textBefore, textAfter, selectedItem) =>
    {
        if (selectedItem !== null)
            return complete(selectedItem.t);
        const table = props.tables.find(table => table === textBefore + textAfter);
        if (table !== undefined)
            return complete(table);
        return null;
    },
}, AutoComplete.WhitespacePolicy.ALLOW_ONE_ANYWHERE_TRIM);

function focusChanged(focused: boolean): void
{
    fieldFocused.value = focused;
    lastEditTimeMillis = Date.now();
    if (focused)
        emit("focus");
    else
        emit("blur");
}

defineExpose({
    // Java: focusEntryField
    focus: (): void => field.value?.focus(),
    // Java: setContent, which picks the table
    setContent: (table: string | null): void =>
    {
        field.value?.setContentDirect(table ?? "");
        if (table !== null)
            emit("picked", table);
    },
    // Java: getValue (the text, which may not be a valid name)
    text: (): string => text.value,
    // Java: TimedFocusable.lastFocusedTime
    lastFocusedTime: (): number => fieldFocused.value ? Date.now() : lastEditTimeMillis,
    reset: (value: string): void => { text.value = value; },
});
</script>

<template>
  <div
    class="pick-table-pane"
    :style="fieldWidth === null ? undefined : { '--pick-table-field-width': fieldWidth + 'px' }"
  >
    <!-- Java: an Instruction, shown above the field while it is focused -->
    <PopoverRoot :open="fieldFocused">
      <PopoverAnchor as-child>
        <div>
          <AutoCompleteField
            ref="field"
            v-model:text="text"
            :model="model"
            field-class="pick-table-field"
            :aria-label="t('pick.table.instruction')"
            @focus="focusChanged(true)"
            @blur="focusChanged(false)"
          />
        </div>
      </PopoverAnchor>
      <PopoverPortal>
        <PopoverContent
          side="top"
          align="start"
          :side-offset="-1"
          :avoid-collisions="false"
          class="instruction-label"
          @open-auto-focus.prevent
          @close-auto-focus.prevent
          @interact-outside.prevent
        >
          {{ t("pick.table.instruction") }}
        </PopoverContent>
      </PopoverPortal>
    </PopoverRoot>
  </div>
</template>

<style scoped>
.pick-table-pane {
    padding: 4px;
}
.pick-table-pane :deep(.pick-table-field) {
    box-sizing: border-box;
    width: var(--pick-table-field-width, 100%);
}
</style>

<style>
/* (In a portal) general.scss: .instruction > .instruction-label, just above the field */
.instruction-label {
    z-index: 1001;
    padding: 3px;
    background: white;
    border: 1px solid rgb(179 179 179);
    color: rgb(77 77 77);
    font-family: var(--font-main);
    font-size: 75%;
    white-space: nowrap;
}
</style>
