<script setup lang="ts">
// Java: PickTableDialog, with its PickTablePane: picks a table by typing its name (with completions of
// the table names) or by clicking it in the grid, which the window lets the user do while this shows
// (it isn't modal; the window's picking mode highlights the table under the pointer).  Choosing one
// closes it.  Cancel is to the side, so the completions don't hide it.  (docs/gui-spec/transformations.md)
import { PopoverAnchor, PopoverContent, PopoverPortal, PopoverRoot } from "reka-ui";
import { nextTick, shallowRef, useTemplateRef, watch } from "vue";
import { TableId } from "../../engine/identifiers/id/TableId.js";
import { AutoComplete } from "../../gui-logic/dialogs-non-expression/gui/dialog/AutoComplete.js";
import AutoCompleteField from "../components/AutoCompleteField.vue";
import LightDialog from "../components/dialogs/LightDialog.vue";
import { t } from "../i18n.js";

const open = defineModel<boolean>("open", { required: true });
const props = defineProps<{
    // The tables' names, and those which can't be picked
    tables: readonly string[],
    exclude: readonly string[],
    centreOn: { readonly x: number, readonly y: number } | null,
}>();
const emit = defineEmits<{ picked: [table: string] }>();

class TableCompletion extends AutoComplete.SimpleCompletion
{
    public constructor(public readonly t: string)
    {
        super(t, null);
    }
}

const text = shallowRef("");
const fieldFocused = shallowRef(false);
const field = useTemplateRef<{ focus(): void }>("field");

function complete(table: string): string
{
    emit("picked", table);
    open.value = false;
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

watch(open, isOpen =>
{
    if (isOpen)
    {
        text.value = "";
        // Java: focusEntryField once shown
        void nextTick(() => setTimeout(() => field.value?.focus()));
    }
}, { immediate: true });
</script>

<template>
  <LightDialog
    v-model:open="open"
    :label="t('pick.table.instruction')"
    :buttons="['cancel']"
    buttons-to-side
    :modal="false"
    :centre-on="centreOn"
  >
    <div class="pick-table-pane pick-table-dialog">
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
              @focus="fieldFocused = true"
              @blur="fieldFocused = false"
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
  </LightDialog>
</template>

<style scoped>
.pick-table-pane {
    padding: 4px;
}
.pick-table-pane :deep(.pick-table-field) {
    width: 400px;
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
