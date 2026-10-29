<script setup lang="ts" generic="R">
// Rebuild of xyz.columnal.utility.gui.ErrorableLightDialog (utility-gui): a LightDialog with an error
// label, and a function which gives either an error or the result.  OK does nothing while there is an
// error (docs/gui-spec/light-dialog.md).  The error label goes where the slot puts it (Java:
// getErrorLabel()), as `<ErrorLabel :error="error" />` with the slot's error.
import { shallowRef, watch } from "vue";
import type { Localized } from "../../../engine/anns/Annotations.js";
import type { Either } from "../../../engine/utility-adt/utility/adt/Either.js";
import { t } from "../../i18n.js";
import LightDialog from "./LightDialog.vue";

const open = defineModel<boolean>("open", { required: true });
const props = withDefaults(defineProps<{
    label: string,
    buttonsToSide?: boolean,
    centreOn?: { readonly x: number, readonly y: number } | null,
    resizable?: boolean,
    // Either an error or the result.  If there is an error, it may be called again.
    calculateResult: () => Either<Localized, R>,
}>(), {
    buttonsToSide: false,
    centreOn: null,
    resizable: false,
});
const emit = defineEmits<{
    ok: [result: R],
    cancel: [],
}>();

const error = shallowRef("");
let result: { value: R } | null = null;

// (Java makes a new dialog each time)
watch(open, () => { error.value = ""; result = null; });

function okFilter(): boolean
{
    let ok = false;
    props.calculateResult().either_(err =>
    {
        result = null;
        error.value = t("error.colon", err);
    }, r =>
    {
        result = { value: r };
        ok = true;
    });
    return ok;
}

function clearError(): void
{
    error.value = "";
}

defineExpose({ clearError });
</script>

<template>
  <LightDialog
    v-model:open="open"
    :label="label"
    :buttons="['cancel', 'ok']"
    :buttons-to-side="buttonsToSide"
    :centre-on="centreOn"
    :resizable="resizable"
    :ok-filter="okFilter"
    @ok="emit('ok', result!.value)"
    @cancel="emit('cancel')"
  >
    <slot
      :error="error"
      :clear-error="clearError"
    />
  </LightDialog>
</template>
