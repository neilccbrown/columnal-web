<script setup lang="ts">
// Open project (Java: a FileChooser's open dialog, for .clmnl files): the stored projects, the most
// recently saved first; one is chosen by double-clicking it, or selecting it and OK (or Enter).  A
// file can be uploaded instead, which becomes a stored project, and a project can be deleted (not one
// open in a tab).  (docs/gui-spec/projects.md)
import { shallowRef, useTemplateRef, watch } from "vue";
import LightDialog from "../components/dialogs/LightDialog.vue";
import { t } from "../i18n.js";
import { useAppContext } from "../project/appContext.js";
import type { ProjectSummary } from "../project/ProjectStore.js";

const open = defineModel<boolean>("open", { required: true });
const emit = defineEmits<{ chosen: [id: string] }>();

const context = useAppContext();
const projects = shallowRef<readonly ProjectSummary[]>([]);
// The projects open in a tab (whose locks are held), which can't be deleted:
const openIds = shallowRef<ReadonlySet<string>>(new Set());
const selected = shallowRef<string | null>(null);
const confirmingDelete = shallowRef(false);
const upload = useTemplateRef<HTMLInputElement>("upload");
const list = useTemplateRef<HTMLElement>("list");

async function refresh(): Promise<void>
{
    projects.value = await context.store.list();
    const held = (await navigator.locks.query()).held ?? [];
    openIds.value = new Set(held.map(l => l.name ?? "").filter(n => n.startsWith("columnal-project-")).map(n => n.slice("columnal-project-".length)));
    if (selected.value !== null && !projects.value.some(p => p.id === selected.value))
        selected.value = null;
}

watch(open, isOpen =>
{
    if (isOpen)
    {
        selected.value = null;
        void refresh().then(() => list.value?.focus());
    }
});

function choose(id: string): void
{
    open.value = false;
    emit("chosen", id);
}

function keydown(e: KeyboardEvent): void
{
    const index = projects.value.findIndex(p => p.id === selected.value);
    if (e.key === "ArrowDown" || e.key === "ArrowUp")
    {
        const next = projects.value[Math.max(0, Math.min(projects.value.length - 1, index + (e.key === "ArrowDown" ? 1 : -1)))];
        if (next !== undefined)
            selected.value = next.id;
        e.preventDefault();
    }
}

async function uploaded(): Promise<void>
{
    const file = upload.value?.files?.[0];
    if (file === undefined)
        return;
    const id = await context.store.create(file.name.replace(/\.clmnl$/i, ""), await file.text());
    upload.value!.value = "";
    choose(id);
}

async function deleteSelected(): Promise<void>
{
    if (selected.value !== null)
        await context.store.delete(selected.value);
    await refresh();
}

function savedText(p: ProjectSummary): string
{
    return t("project.open.saved", new Date(p.saved).toLocaleString());
}
</script>

<template>
  <LightDialog
    v-model:open="open"
    :label="t('project.open.dialogTitle')"
    :ok-filter="() => selected !== null"
    @ok="selected !== null && emit('chosen', selected)"
  >
    <div class="open-project">
      <div
        ref="list"
        class="project-list"
        role="listbox"
        tabindex="0"
        :aria-label="t('project.open.dialogTitle')"
        @keydown="keydown"
      >
        <div
          v-for="p in projects"
          :key="p.id"
          class="project-item"
          :class="{ selected: p.id === selected }"
          role="option"
          :aria-selected="p.id === selected"
          @click="selected = p.id"
          @dblclick="choose(p.id)"
        >
          <span class="project-name">{{ p.name }}</span>
          <span class="project-saved">{{ savedText(p) }}</span>
        </div>
        <div
          v-if="projects.length === 0"
          class="project-none"
        >
          {{ t("project.open.none") }}
        </div>
      </div>
      <div class="project-actions">
        <button
          type="button"
          class="upload-button"
          @click="upload?.click()"
        >
          {{ t("project.open.upload") }}
        </button>
        <input
          ref="upload"
          class="upload-input"
          type="file"
          accept=".clmnl,text/plain"
          hidden
          @change="uploaded"
        >
        <button
          type="button"
          class="delete-button"
          :disabled="selected === null || openIds.has(selected)"
          @click="confirmingDelete = true"
        >
          {{ t("project.open.delete") }}
        </button>
      </div>
    </div>
  </LightDialog>
  <LightDialog
    v-model:open="confirmingDelete"
    :label="t('project.open.delete')"
    @ok="deleteSelected"
  >
    {{ t("project.open.delete.confirm", projects.find(p => p.id === selected)?.name ?? "") }}
  </LightDialog>
</template>

<style scoped>
.open-project {
    display: flex;
    flex-direction: column;
    gap: 0.5em;
    width: 30em;
}
.project-list {
    height: 15em;
    overflow-y: auto;
    border: 1px solid var(--control-border);
    background: var(--list-background, white);
}
.project-list:focus {
    outline: 1px solid var(--focus-color);
}
.project-item {
    display: flex;
    justify-content: space-between;
    gap: 1em;
    padding: 2px 4px;
    cursor: default;
}
.project-item.selected {
    background: var(--list-selection-focused);
    color: var(--list-selection-text);
}
.project-saved {
    color: var(--text-color-faint);
    font-size: 85%;
}
.project-item.selected .project-saved {
    color: var(--focus-color-text-faint);
}
.project-none {
    padding: 4px;
    color: var(--text-color-faint);
}
.project-actions {
    display: flex;
    gap: 0.5em;
}
</style>
