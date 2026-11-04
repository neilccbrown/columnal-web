<script setup lang="ts">
// Java: NewTableDialog (dialogs-non-expression): what to make in an empty cell, as buttons each with
// an explanation (Java: ExplainedButton): data (Data Entry, Import File, Import URL, Comment) on the
// left, and transformations of tables (Transform, Check) on the right, which need a table to exist.
// It is centred on the point given (Java: showAndWaitCentredOn).
import { nextTick, useTemplateRef, watch } from "vue";
import { makeId } from "../menus/menus.js";
import { t } from "../../i18n.js";
import LightDialog from "./LightDialog.vue";

export type DataOrTransform = "DATA" | "IMPORT_FILE" | "IMPORT_URL" | "COMMENT" | "TRANSFORM" | "CHECK";

const open = defineModel<boolean>("open", { required: true });
const props = defineProps<{
    centreOn: { readonly x: number, readonly y: number } | null,
    // Java: transformIsValid, whether there are any tables
    transformIsValid: boolean,
}>();
const emit = defineEmits<{
    // The choice, and where the button was clicked (Java: its last mouse position)
    chosen: [choice: DataOrTransform, point: { x: number, y: number }],
}>();

interface ExplainedButton
{
    readonly choice: DataOrTransform;
    readonly titleKey: string;
    readonly explanationKey: string;
    readonly disabled: boolean;
}

// PORT-DEFERRED: importing, and transformations and checks
// (Phase 11) are disabled until they're built
const NOT_YET: ReadonlySet<DataOrTransform> = new Set(["IMPORT_FILE", "IMPORT_URL", "TRANSFORM", "CHECK"]);
const button = (choice: DataOrTransform, titleKey: string, explanationKey: string, disabled: boolean = false): ExplainedButton =>
    ({ choice, titleKey, explanationKey, disabled: disabled || NOT_YET.has(choice) });

const data = (): readonly ExplainedButton[] => [
    button("DATA", "new.data", "new.data.explanation"),
    button("IMPORT_FILE", "import.file", "import.file.explanation"),
    button("IMPORT_URL", "import.url", "import.url.explanation"),
    button("COMMENT", "new.comment", "new.comment.explanation"),
];
const transforms = (): readonly ExplainedButton[] => [
    button("TRANSFORM", "new.transform", "new.transform.explanation", !props.transformIsValid),
    button("CHECK", "new.check", "new.check.explanation", !props.transformIsValid),
];

const content = useTemplateRef<HTMLElement>("content");
watch(open, isOpen =>
{
    // Java: the Data Entry button has the focus when shown
    if (isOpen)
        void nextTick(() => setTimeout(() => content.value?.querySelector<HTMLElement>("." + makeId("new.data"))?.focus()));
});

function choose(b: ExplainedButton, e: MouseEvent): void
{
    open.value = false;
    const box = (e.currentTarget as HTMLElement).getBoundingClientRect();
    // (A button pressed by keyboard has no mouse position: its centre)
    emit("chosen", b.choice, e.detail === 0 ? { x: box.left + box.width / 2, y: box.top + box.height / 2 } : { x: e.clientX, y: e.clientY });
}
</script>

<template>
  <LightDialog
    v-model:open="open"
    :label="t('create.table')"
    :buttons="['cancel']"
    :centre-on="centreOn"
  >
    <div
      ref="content"
      class="new-table-content"
    >
      <p class="new-explanation">
        Tables are either plain data (left) or transformations of other tables (right)
      </p>
      <div class="new-columns">
        <div
          v-for="(list, i) in [data(), transforms()]"
          :key="i"
          class="new-button-list"
        >
          <button
            v-for="b in list"
            :key="b.choice"
            type="button"
            class="explanation-button"
            :class="makeId(b.titleKey)"
            :disabled="b.disabled"
            :aria-label="t(b.titleKey) + '\n' + t(b.explanationKey)"
            @click="choose(b, $event)"
          >
            <span class="explanation-button-title">{{ t(b.titleKey) }}</span>
            <span class="explanation-button-explanation">{{ t(b.explanationKey) }}</span>
          </button>
        </div>
      </div>
    </div>
  </LightDialog>
</template>

<style scoped>
/* dialogs.scss: .new-button-list, .new-explanation, .explanation-button */
.new-table-content {
    width: 380px;
    height: 290px;
    display: flex;
    flex-direction: column;
}
.new-explanation {
    margin: 0 0 10px;
}
.new-columns {
    flex: 1;
    display: flex;
    justify-content: space-between;
}
.new-button-list {
    width: 45%;
    display: flex;
    flex-direction: column;
    gap: 10px;
}
.explanation-button {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 2px;
    font-family: var(--font-main);
}
.explanation-button-explanation {
    max-width: 85%;
    font-size: 8pt;
    color: rgb(40% 40% 40%);
}
</style>
