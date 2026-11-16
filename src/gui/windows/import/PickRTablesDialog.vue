<script setup lang="ts">
// Java: RImporter.PickImportsDialog: "Choose tables to import" and the R file's tables, all selected at
// first (a list with several selected: a click selects one, Ctrl/Cmd+click toggles one, Shift+click
// selects a range); OK is disabled while none is selected.
import { computed, shallowRef, useTemplateRef, watch } from "vue";
import LightDialog from "../../components/dialogs/LightDialog.vue";
import { isMac } from "../../shortcuts.js";
import { t } from "../../i18n.js";

const open = defineModel<boolean>("open", { required: true });
const props = defineProps<{ tables: readonly string[] }>();
const emit = defineEmits<{ chosen: [picked: number[]] }>();

const selected = shallowRef<ReadonlySet<number>>(new Set(props.tables.map((_t, i) => i)));
let anchor = 0;
const list = useTemplateRef<HTMLElement>("list");

watch(open, isOpen =>
{
    if (isOpen)
        setTimeout(() => list.value?.focus());
}, { immediate: true });

// (As JavaFX's ListView with multiple selection)
function clicked(i: number, e: MouseEvent): void
{
    if (e.shiftKey)
    {
        const r = new Set<number>();
        for (let j = Math.min(anchor, i); j <= Math.max(anchor, i); j++)
            r.add(j);
        selected.value = r;
        return;
    }
    anchor = i;
    if (isMac() ? e.metaKey : e.ctrlKey)
    {
        const r = new Set(selected.value);
        if (r.has(i))
            r.delete(i);
        else
            r.add(i);
        selected.value = r;
    }
    else
        selected.value = new Set([i]);
}

const picked = computed(() => [...selected.value].sort((a, b) => a - b));
</script>

<template>
  <LightDialog
    v-model:open="open"
    :label="t('choose.tables.to.import')"
    buttons-to-side
    :ok-disabled="selected.size === 0"
    @ok="emit('chosen', picked)"
  >
    <div class="pick-r-tables">
      <label>{{ t("importer.r.pickTables") }}</label>
      <div
        ref="list"
        class="r-table-list"
        role="listbox"
        aria-multiselectable="true"
        tabindex="0"
      >
        <div
          v-for="(name, i) in tables"
          :key="i"
          class="r-table-item"
          :class="{ selected: selected.has(i) }"
          role="option"
          :aria-selected="selected.has(i)"
          @click="e => clicked(i, e)"
        >
          {{ name }}
        </div>
      </div>
    </div>
  </LightDialog>
</template>

<style scoped>
.pick-r-tables {
    display: flex;
    flex-direction: column;
    gap: 10px;
    width: 20em;
}
.r-table-list {
    height: 10em;
    overflow-y: auto;
    border: 1px solid var(--control-border);
    background: var(--list-background, white);
}
.r-table-item {
    padding: 1px 4px;
    cursor: default;
}
.r-table-item.selected {
    background: var(--list-selection-focused);
    color: var(--list-selection-text);
}
</style>
