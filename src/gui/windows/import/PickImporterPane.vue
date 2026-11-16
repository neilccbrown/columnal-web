<script setup lang="ts">
// Java: ImporterManager.PickImporterPane: the importers, as "name (*.ext, ...)", one selected (the first,
// unless one was guessed from a file's extension); clicked, or Up and Down, to select.
import { useTemplateRef } from "vue";
import type { ImporterInfo } from "../../engine/protocol.js";

const props = defineProps<{ importers: readonly ImporterInfo[] }>();
// The importer's index, or null for none:
const selected = defineModel<number | null>("selected", { required: true });
const list = useTemplateRef<HTMLElement>("list");

function keydown(e: KeyboardEvent): void
{
    if (e.key === "ArrowDown" || e.key === "ArrowUp")
    {
        const index = (selected.value ?? -1) + (e.key === "ArrowDown" ? 1 : -1);
        selected.value = Math.max(0, Math.min(props.importers.length - 1, index));
        e.preventDefault();
    }
}

defineExpose({ focus: () => list.value?.focus() });
</script>

<template>
  <div
    ref="list"
    class="importer-list"
    role="listbox"
    tabindex="0"
    @keydown="keydown"
  >
    <div
      v-for="(imp, i) in importers"
      :key="i"
      class="importer-item"
      :class="{ selected: i === selected }"
      role="option"
      :aria-selected="i === selected"
      @click="selected = i"
    >
      {{ imp.name + " (" + imp.fileTypes.join(", ") + ")" }}
    </div>
  </div>
</template>

<style scoped>
.importer-list {
    height: 8em;
    overflow-y: auto;
    border: 1px solid var(--control-border);
    background: var(--list-background, white);
}
.importer-item {
    padding: 1px 4px;
    cursor: default;
}
.importer-item.selected {
    background: var(--list-selection-focused);
    color: var(--list-selection-text);
}
</style>
