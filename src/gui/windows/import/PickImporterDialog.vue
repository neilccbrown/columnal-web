<script setup lang="ts">
// Java: ImporterManager.PickImporterDialog: "Pick importer for <file>", and the importers (the one for
// the file's extension selected, ignoring case, if there is one); OK with none: "Pick an importer".
import { shallowRef, useTemplateRef, watch } from "vue";
import { Either } from "../../../engine/utility-adt/utility/adt/Either.js";
import ErrorableLightDialog from "../../components/dialogs/ErrorableLightDialog.vue";
import ErrorLabel from "../../components/dialogs/ErrorLabel.vue";
import type { ImporterInfo } from "../../engine/protocol.js";
import { t } from "../../i18n.js";
import PickImporterPane from "./PickImporterPane.vue";

const open = defineModel<boolean>("open", { required: true });
const props = defineProps<{ fileName: string, importers: readonly ImporterInfo[], guess: number | null }>();
const emit = defineEmits<{ chosen: [importer: number] }>();

// (Java: the first selected, then the guess)
const selected = shallowRef<number | null>(props.guess ?? (props.importers.length > 0 ? 0 : null));
const pane = useTemplateRef<InstanceType<typeof PickImporterPane>>("pane");

watch(open, isOpen =>
{
    if (isOpen)
        setTimeout(() => pane.value?.focus());
}, { immediate: true });

function calculateResult(): Either<string, number>
{
    return selected.value !== null ? Either.right(selected.value) : Either.left(t("importer.error.nopick"));
}
</script>

<template>
  <ErrorableLightDialog
    v-model:open="open"
    :label="'Pick importer for ' + fileName"
    :calculate-result="calculateResult"
    @ok="i => emit('chosen', i)"
  >
    <template #default="{ error }">
      <div class="pick-importer">
        <label>Pick importer for {{ fileName }}</label>
        <PickImporterPane
          ref="pane"
          v-model:selected="selected"
          :importers="importers"
        />
        <ErrorLabel :error="error" />
      </div>
    </template>
  </ErrorableLightDialog>
</template>

<style scoped>
.pick-importer {
    display: flex;
    flex-direction: column;
    gap: 4px;
    width: 22em;
}
</style>
