<script setup lang="ts">
// Java: ExporterManager's PickExporterDialog: the exporters, as "name (*.ext, ...)", the first
// selected; one is chosen by double-clicking it, or selecting it (click, or Up and Down) and OK.
// (Then the window downloads the table, exported: docs/gui-spec/tables.md.)
import { shallowRef, useTemplateRef, watch } from "vue";
import { Either } from "../../engine/utility-adt/utility/adt/Either.js";
import ErrorableLightDialog from "../components/dialogs/ErrorableLightDialog.vue";
import ErrorLabel from "../components/dialogs/ErrorLabel.vue";
import type { ExporterInfo } from "../engine/protocol.js";
import { t } from "../i18n.js";

const open = defineModel<boolean>("open", { required: true });
const props = defineProps<{ exporters: readonly ExporterInfo[] }>();
// The exporter's index:
const emit = defineEmits<{ chosen: [exporter: number] }>();

const selected = shallowRef<number | null>(null);
const list = useTemplateRef<HTMLElement>("list");

watch(open, isOpen =>
{
    if (!isOpen)
        return;
    selected.value = props.exporters.length > 0 ? 0 : null;
    setTimeout(() => list.value?.focus());
}, { immediate: true });

function calculateResult(): Either<string, number>
{
    return selected.value !== null ? Either.right(selected.value) : Either.left(t("exporter.error.nopick"));
}

function choose(index: number): void
{
    open.value = false;
    emit("chosen", index);
}

function keydown(e: KeyboardEvent): void
{
    if (e.key === "ArrowDown" || e.key === "ArrowUp")
    {
        const index = (selected.value ?? -1) + (e.key === "ArrowDown" ? 1 : -1);
        selected.value = Math.max(0, Math.min(props.exporters.length - 1, index));
        e.preventDefault();
    }
}
</script>

<template>
  <ErrorableLightDialog
    v-model:open="open"
    :label="t('data.export.dialogTitle')"
    :calculate-result="calculateResult"
    @ok="choose"
  >
    <template #default="{ error }">
      <div class="pick-exporter">
        <div>Pick Exporter</div>
        <div
          ref="list"
          class="exporter-list"
          role="listbox"
          tabindex="0"
          @keydown="keydown"
        >
          <div
            v-for="(e, i) in exporters"
            :key="i"
            class="exporter-item"
            :class="{ selected: i === selected }"
            role="option"
            :aria-selected="i === selected"
            @click="selected = i"
            @dblclick="choose(i)"
          >
            {{ e.name + " (" + e.fileTypes.join(", ") + ")" }}
          </div>
        </div>
        <ErrorLabel :error="error" />
      </div>
    </template>
  </ErrorableLightDialog>
</template>

<style scoped>
.pick-exporter {
    display: flex;
    flex-direction: column;
    gap: 4px;
    width: 20em;
}
.exporter-list {
    height: 8em;
    overflow-y: auto;
    border: 1px solid var(--control-border);
    background: var(--list-background, white);
}
.exporter-list:focus {
    outline: 1px solid var(--focus-color);
}
.exporter-item {
    padding: 2px 4px;
    cursor: default;
}
.exporter-item.selected {
    background: var(--list-selection-focused);
    color: var(--list-selection-text);
}
</style>
