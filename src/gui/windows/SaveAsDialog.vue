<script setup lang="ts">
// Save as (Java: a FileChooser's save dialog): the name of the project to save as.
import { nextTick, shallowRef, useTemplateRef, watch } from "vue";
import LightDialog from "../components/dialogs/LightDialog.vue";
import { t } from "../i18n.js";

const open = defineModel<boolean>("open", { required: true });
const props = defineProps<{ currentName: string }>();
const emit = defineEmits<{ chosen: [name: string] }>();

const name = shallowRef("");
const field = useTemplateRef<HTMLInputElement>("field");
watch(open, isOpen =>
{
    if (isOpen)
    {
        name.value = props.currentName;
        void nextTick(() => field.value?.select());
    }
});
</script>

<template>
  <LightDialog
    v-model:open="open"
    :label="t('project.saveAs.title')"
    :ok-filter="() => name.trim() !== ''"
    @ok="emit('chosen', name.trim())"
  >
    <label class="save-as-label">
      {{ t("project.saveAs.name") }}
      <input
        ref="field"
        v-model="name"
        class="save-as-name"
        type="text"
      >
    </label>
  </LightDialog>
</template>

<style scoped>
.save-as-label {
    display: flex;
    gap: 0.5em;
    align-items: center;
}
.save-as-name {
    width: 20em;
}
</style>
