<script setup lang="ts">
// Java: HideColumnsDialog (a Hide columns transformation's hidden columns) and CustomColumnDisplayDialog
// (the columns a table's custom display hides), each a HideColumnsPanel with OK and Cancel.
// (docs/gui-spec/transformations.md)
import { shallowRef, watch } from "vue";
import LightDialog from "../components/dialogs/LightDialog.vue";
import HideColumnsPanel from "../components/HideColumnsPanel.vue";
import { t } from "../i18n.js";

const open = defineModel<boolean>("open", { required: true });
const props = defineProps<{
    // (See HideColumnsPanel's)
    srcColumns: readonly string[] | null,
    srcMessage: string,
    initiallyHidden: readonly string[],
}>();
const emit = defineEmits<{ ok: [hidden: readonly string[]] }>();

const hidden = shallowRef<readonly string[]>(props.initiallyHidden);
// (Java makes a new dialog each time)
watch(open, isOpen =>
{
    if (isOpen)
        hidden.value = props.initiallyHidden;
});
</script>

<template>
  <LightDialog
    v-model:open="open"
    :label="t('transformEditor.hide.title')"
    :buttons="['ok', 'cancel']"
    @ok="emit('ok', hidden)"
  >
    <HideColumnsPanel
      v-model:hidden="hidden"
      :src-columns="srcColumns"
      :src-message="srcMessage"
    />
  </LightDialog>
</template>
