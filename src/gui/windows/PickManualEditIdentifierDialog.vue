<script setup lang="ts">
// Java: PickManualEditIdentifierDialog: how a Manual Edit identifies the rows it edits: by a column (its
// name typed, with completions of the columns starting with the text, or clicked in the grid) or by row
// number.  It isn't modal.  (docs/gui-spec/transformations.md)
import { markRaw, nextTick, shallowRef, useId, useTemplateRef, watch } from "vue";
import { ColumnId } from "../../engine/identifiers/id/ColumnId.js";
import { Either } from "../../engine/utility-adt/utility/adt/Either.js";
import { IdentifierUtility } from "../../engine/utility/utility/IdentifierUtility.js";
import { TranslationUtility } from "../../engine/utility/utility/TranslationUtility.js";
import { AutoComplete } from "../../gui-logic/dialogs-non-expression/gui/dialog/AutoComplete.js";
import AutoCompleteField from "../components/AutoCompleteField.vue";
import ErrorableLightDialog from "../components/dialogs/ErrorableLightDialog.vue";
import ErrorLabel from "../components/dialogs/ErrorLabel.vue";
import type { PickingMode } from "../grid/picking.js";
import { t } from "../i18n.js";

const open = defineModel<boolean>("open", { required: true });
const props = defineProps<{
    // Java: startingValue: undefined for none (a new Manual Edit: by column, blank), else the column (null
    // for the row number)
    startingValue: string | null | undefined,
    // The columns which can identify the rows
    columns: readonly string[],
}>();
const emit = defineEmits<{
    // The column, or null for the row number
    ok: [column: string | null],
    picking: [mode: PickingMode | null],
}>();

const byColumn = shallowRef(props.startingValue !== null);
const text = shallowRef(props.startingValue ?? "");
const field = useTemplateRef<{ focus(): void, setContentDirect(text: string): void }>("field");
const content = useTemplateRef<HTMLElement>("content");
const radioName = useId();

class ColumnCompletion extends AutoComplete.SimpleCompletion
{
    public constructor(public readonly column: string)
    {
        super(column, null);
    }
}
const model = markRaw(new AutoComplete.Model<ColumnCompletion>({
    calculateCompletions: s => props.columns.filter(c => c.startsWith(s)).map(c => new ColumnCompletion(c)),
}, {
    doubleClick: (_currentText, selectedItem) => selectedItem.column,
    keyboardSelect: (_textBefore, _textAfter, selectedItem) => selectedItem !== null ? selectedItem.column : null,
}, AutoComplete.WhitespacePolicy.ALLOW_ONE_ANYWHERE_TRIM));

function calculateResult(): Either<string, string | null>
{
    if (!byColumn.value)
        return Either.right(null);
    const id = IdentifierUtility.asExpressionIdentifier(text.value.trim());
    if (id !== null && props.columns.some(c => new ColumnId(c).equals(new ColumnId(id))))
        return Either.right(id);
    return Either.left(TranslationUtility.getString("manual.edit.column.not.found", text.value.trim()));
}

// Java: enableColumnPickingMode while showing: a column with one of the names picks it.
// PORT-NOTE: possible Java bug, kept: a column of any table with one of the names, not only the source's.
const picking = markRaw<PickingMode>({
    kind: "column",
    include: (_table, column) => column !== null && props.columns.includes(column),
    onPick: picked =>
    {
        if (picked.column === null)
            return;
        byColumn.value = true;
        field.value?.setContentDirect(picked.column);
        text.value = picked.column;
    },
    target: () => content.value?.closest(".light-dialog")?.getBoundingClientRect() ?? null,
    startPoint: null,
});

watch(open, isOpen =>
{
    emit("picking", isOpen ? picking : null);
    if (isOpen && byColumn.value)
        void nextTick(() => setTimeout(() => field.value?.focus()));
}, { immediate: true });
</script>

<template>
  <ErrorableLightDialog
    v-model:open="open"
    label="Pick column to use to identify the edited rows"
    :modal="false"
    :calculate-result="calculateResult"
    @ok="r => emit('ok', r)"
  >
    <template #default="{ error }">
      <div
        ref="content"
        class="pick-manual-edit-identifier"
      >
        <label>Pick column to use to identify the edited rows if the source data changes:</label>
        <div class="by-column-row">
          <input
            :id="radioName + '-column'"
            type="radio"
            class="id-manual-edit-bycolumn"
            :name="radioName"
            :checked="byColumn"
            @change="byColumn = true"
          >
          <label :for="radioName + '-column'">{{ t("manual.edit.bycolumn") }}</label>
          <AutoCompleteField
            ref="field"
            v-model:text="text"
            :model="model"
            field-class="manual-edit-column-field"
            :disabled="!byColumn"
            :aria-label="t('manual.edit.bycolumn')"
          />
        </div>
        <div>
          <input
            :id="radioName + '-row'"
            type="radio"
            class="id-manual-edit-byrownum"
            :name="radioName"
            :checked="!byColumn"
            @change="byColumn = false"
          >
          <label :for="radioName + '-row'">{{ t("manual.edit.byrownum") }}</label>
        </div>
        <ErrorLabel :error="error" />
      </div>
    </template>
  </ErrorableLightDialog>
</template>

<style scoped>
.pick-manual-edit-identifier {
    display: flex;
    flex-direction: column;
    gap: 5px;
}
.by-column-row {
    display: flex;
    align-items: center;
    gap: 4px;
}
</style>
