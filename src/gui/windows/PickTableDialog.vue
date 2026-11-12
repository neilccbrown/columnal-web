<script setup lang="ts">
// Java: PickTableDialog: picks a table by typing its name (PickTablePane, with completions of the table
// names) or by clicking it in the grid, which the window lets the user do while this shows (it isn't
// modal; the window's picking mode highlights the table under the pointer).  Choosing one closes it.
// Cancel is to the side, so the completions don't hide it.  (docs/gui-spec/transformations.md)
import { nextTick, useTemplateRef, watch } from "vue";
import LightDialog from "../components/dialogs/LightDialog.vue";
import PickTablePane from "../components/PickTablePane.vue";
import { t } from "../i18n.js";

const open = defineModel<boolean>("open", { required: true });
defineProps<{
    // The tables' names, and those which can't be picked
    tables: readonly string[],
    exclude: readonly string[],
    centreOn: { readonly x: number, readonly y: number } | null,
}>();
const emit = defineEmits<{ picked: [table: string] }>();

const pane = useTemplateRef<{ focus(): void, reset(value: string): void }>("pane");

function picked(table: string): void
{
    emit("picked", table);
    open.value = false;
}

watch(open, isOpen =>
{
    if (isOpen)
    {
        pane.value?.reset("");
        // Java: focusEntryField once shown
        void nextTick(() => setTimeout(() => pane.value?.focus()));
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
    <PickTablePane
      ref="pane"
      class="pick-table-dialog"
      :tables="tables"
      :exclude="exclude"
      :field-width="400"
      @picked="picked"
    />
  </LightDialog>
</template>
