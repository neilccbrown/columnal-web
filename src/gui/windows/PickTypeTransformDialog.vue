<script setup lang="ts">
// Java: PickTypeTransformDialog: "Type to transform into:" and a list of the types a column could be
// transformed into (the first selected; with none, "No suitable destination types" and OK disabled).
// (docs/gui-spec/transformations.md)
import { nextTick, shallowRef, useTemplateRef, watch } from "vue";
import LightDialog from "../components/dialogs/LightDialog.vue";
import ListView from "../components/ListView.vue";
import { t } from "../i18n.js";

const open = defineModel<boolean>("open", { required: true });
const props = defineProps<{
    // The types, as shown
    types: readonly string[],
}>();
const emit = defineEmits<{
    // The index of the type picked
    ok: [index: number],
}>();

const selected = shallowRef<readonly string[]>(props.types.slice(0, 1));
const content = useTemplateRef<HTMLElement>("content");

watch(open, isOpen =>
{
    // Java: the list is focused once shown
    if (isOpen)
        void nextTick(() => setTimeout(() => content.value?.querySelector<HTMLElement>(".destination-type-list")?.focus()));
}, { immediate: true });

function ok(): void
{
    const index = props.types.indexOf(selected.value[0] ?? "");
    if (index !== -1)
        emit("ok", index);
}
</script>

<template>
  <LightDialog
    v-model:open="open"
    :label="t('transformType.header')"
    buttons-to-side
    :ok-disabled="types.length === 0"
    @ok="ok"
  >
    <div
      ref="content"
      class="pick-type-transform"
    >
      <label>{{ t("transformType.header") }}</label>
      <ListView
        v-model:selected="selected"
        class="destination-type-list"
        :items="types"
        placeholder="No suitable destination types"
      />
    </div>
  </LightDialog>
</template>

<style scoped>
.pick-type-transform {
    display: flex;
    flex-direction: column;
}
.destination-type-list {
    margin-top: 10px;
    height: 150px;
}
</style>
