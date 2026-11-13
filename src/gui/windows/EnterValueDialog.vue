<script setup lang="ts">
// Java: EnterValueDialog: a value of a type, typed in a field which recognises it (starting with the
// type's default value, selected), for the column menu's Transform type unwrapping an Optional (the
// value used for None).  (docs/gui-spec/transformations.md)
import { markRaw, nextTick, useTemplateRef, watch } from "vue";
import type { DataType } from "../../engine/types/data/datatype/DataType.js";
import { DataTypeUtility } from "../../engine/types/data/datatype/DataTypeUtility.js";
import { Either } from "../../engine/utility-adt/utility/adt/Either.js";
import { UserException } from "../../engine/utility-error/error/UserException.js";
import type { Value } from "../../engine/utility/utility/Value.js";
import { RecogniserDocument } from "../../gui-logic/stf/gui/dtf/RecogniserDocument.js";
import { TableDisplayUtility } from "../../gui-logic/stf/gui/dtf/TableDisplayUtility.js";
import ErrorableLightDialog from "../components/dialogs/ErrorableLightDialog.vue";
import ErrorLabel from "../components/dialogs/ErrorLabel.vue";
import DocumentTextField from "../components/DocumentTextField.vue";

const open = defineModel<boolean>("open", { required: true });
const props = defineProps<{ dataType: DataType }>();
const emit = defineEmits<{ ok: [value: Value] }>();

const content = useTemplateRef<HTMLElement>("content");
const field = useTemplateRef<{ focus(): void, selectAll(): void }>("field");

let initialContent: string;
try
{
    initialContent = DataTypeUtility.valueToString(DataTypeUtility.makeDefaultValue(props.dataType));
}
catch (e)
{
    // Shouldn't happen when converting default value
    if (!(e instanceof UserException))
        throw e;
    initialContent = "";
}
const recogniser = TableDisplayUtility.recogniser(props.dataType, false);
const document = markRaw(new RecogniserDocument<Value>(initialContent, recogniser.itemClass, recogniser.recogniser, null, () => {},
    () => content.value?.closest(".light-dialog")?.querySelector<HTMLElement>(".ok-button")?.focus(), null));

function calculateResult(): Either<string, Value>
{
    return document.getLatestValue().mapBoth(err => err.error.toPlain(), v => v);
}

watch(open, isOpen =>
{
    if (isOpen)
    {
        void nextTick(() => setTimeout(() =>
        {
            field.value?.focus();
            field.value?.selectAll();
        }));
    }
}, { immediate: true });
</script>

<template>
  <ErrorableLightDialog
    v-model:open="open"
    label="Enter a value"
    :calculate-result="calculateResult"
    @ok="v => emit('ok', v)"
  >
    <template #default="{ error }">
      <div
        ref="content"
        class="enter-value-dialog"
      >
        <DocumentTextField
          ref="field"
          :document="document"
        />
        <ErrorLabel :error="error" />
      </div>
    </template>
  </ErrorableLightDialog>
</template>

<style scoped>
.enter-value-dialog {
    display: flex;
    flex-direction: column;
    gap: 5px;
}
</style>
