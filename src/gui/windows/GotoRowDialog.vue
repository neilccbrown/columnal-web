<script setup lang="ts">
// Java: DataDisplay.GotoRowDialog: a row number (from 1) in the table, given by its number of rows.
// OK does nothing until it is one.  (docs/gui-spec/tables.md)
import { nextTick, shallowRef, useTemplateRef, watch } from "vue";
import { javaParseInt, NumberFormatException } from "../../engine/java/JavaString.js";
import { StyledString } from "../../engine/utility-error/styled/StyledString.js";
import { TranslationUtility } from "../../engine/utility/utility/TranslationUtility.js";
import { Utility } from "../../engine/utility/utility/Utility.js";
import { ErrorableTextField as Conversion } from "../../gui-logic/utility-gui/utility/gui/ErrorableTextField.js";
import LightDialog from "../components/dialogs/LightDialog.vue";
import ErrorableTextField from "../components/ErrorableTextField.vue";
import { t } from "../i18n.js";

const open = defineModel<boolean>("open", { required: true });
const props = defineProps<{
    // The table's rows (Java: currentKnownRows)
    rows: number,
}>();
// The row, from 0:
const emit = defineEmits<{ chosen: [row: number] }>();

const text = shallowRef("");
const value = shallowRef<number | null>(null);
const field = useTemplateRef<{ focus(): void }>("field");

watch(open, isOpen =>
{
    if (!isOpen)
        return;
    text.value = "";
    // Java: setOnShown, focusing the field
    void nextTick(() => setTimeout(() => field.value?.focus()));
}, { immediate: true });

// Java: GotoRowDialog.parseRowNumber
function parseRowNumber(s: string): Conversion.ConversionResult<number>
{
    try
    {
        // User enters one-based, we use zero-based:
        const row = javaParseInt(s);
        if (row >= 1 && row <= props.rows)
            return Conversion.ConversionResult.success(row - 1);
        return Conversion.ConversionResult.error(StyledString.s(TranslationUtility.getString("row.number.invalid") + " (1-" + props.rows + ")"));
    }
    catch (e)
    {
        if (!(e instanceof NumberFormatException))
            throw e;
        return Conversion.ConversionResult.error(StyledString.s(Utility.concatLocal(TranslationUtility.getString("row.not.a.number"), e.message)));
    }
}
</script>

<template>
  <LightDialog
    v-model:open="open"
    :label="t('menu.view.goto.row')"
    :ok-filter="() => value !== null"
    @ok="emit('chosen', value!)"
  >
    <ErrorableTextField
      ref="field"
      v-model:text="text"
      class="goto-row-field"
      :converter="parseRowNumber"
      :aria-label="t('menu.view.goto.row')"
      @update:value="v => { value = v; }"
    />
  </LightDialog>
</template>
