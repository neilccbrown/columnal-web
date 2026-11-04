<script setup lang="ts">
// Java: TypesDialog: the user-defined tagged types, with buttons to add, edit and remove them, and
// Close.  It changes the TypeManager it is given (a copy of the project's: the window sends the types
// to the engine when it closes).  (docs/gui-spec/types-and-units.md)
import { shallowRef, useTemplateRef, watch } from "vue";
import type { TaggedTypeDefinition } from "../../../engine/types/data/datatype/TaggedTypeDefinition.js";
import type { TypeManager } from "../../../engine/types/data/datatype/TypeManager.js";
import { InternalException } from "../../../engine/utility-error/error/InternalException.js";
import { UserException } from "../../../engine/utility-error/error/UserException.js";
import { TypesDialog } from "../../../gui-logic/app/gui/TypesDialog.js";
import { showAlert } from "../../alerts.js";
import LightDialog from "../../components/dialogs/LightDialog.vue";
import { t } from "../../i18n.js";
import EditTypeDialog from "./EditTypeDialog.vue";

const open = defineModel<boolean>("open", { required: true });
const props = defineProps<{ typeManager: TypeManager }>();

const types = shallowRef<readonly TaggedTypeDefinition[]>([]);
const selected = shallowRef<number | null>(null);
const list = useTemplateRef<HTMLElement>("list");
// The type being edited (null for a new one), while its dialog shows:
const editing = shallowRef<{ readonly existing: TaggedTypeDefinition | null } | null>(null);
const editOpen = shallowRef(false);

// Java: updateTypesList
function updateTypesList(): void
{
    types.value = [...props.typeManager.getUserTaggedTypes().values()];
    if (selected.value !== null && selected.value >= types.value.length)
        selected.value = null;
}

watch(open, isOpen =>
{
    if (!isOpen)
        return;
    selected.value = null;
    updateTypesList();
}, { immediate: true });

// Java: FXUtility.alertOnErrorFX_
function alertOnError(titleKey: string, run: () => void): void
{
    try
    {
        run();
    }
    catch (e)
    {
        if (!(e instanceof UserException || e instanceof InternalException))
            throw e;
        showAlert({ title: t(titleKey), message: e.getLocalizedMessage() ?? "" });
    }
}

function editType(existing: TaggedTypeDefinition | null): void
{
    editing.value = { existing };
    editOpen.value = true;
}

function edited(newType: TaggedTypeDefinition): void
{
    const existing = editing.value?.existing ?? null;
    if (existing === null)
    {
        alertOnError("error.adding.new.type", () => props.typeManager.registerTaggedType(newType.getTaggedTypeName().getRaw(), newType.getTypeArguments(), newType.getTags()));
    }
    else
    {
        alertOnError("error.saving.type.change", () =>
        {
            props.typeManager.unregisterTaggedType(existing.getTaggedTypeName());
            props.typeManager.registerTaggedType(newType.getTaggedTypeName().getRaw(), newType.getTypeArguments(), newType.getTags());
        });
    }
    updateTypesList();
}

function selectedType(): TaggedTypeDefinition | null
{
    return selected.value === null ? null : types.value[selected.value] ?? null;
}

function remove(): void
{
    const typeDefinition = selectedType();
    if (typeDefinition !== null)
    {
        props.typeManager.unregisterTaggedType(typeDefinition.getTaggedTypeName());
        updateTypesList();
    }
}

// (JavaFX's ListView's keys)
function keydown(e: KeyboardEvent): void
{
    const last = types.value.length - 1;
    if (last < 0)
        return;
    const current = selected.value;
    let next: number;
    switch (e.key)
    {
        case "ArrowDown": next = current === null ? 0 : Math.min(last, current + 1); break;
        case "ArrowUp": next = current === null ? 0 : Math.max(0, current - 1); break;
        case "Home": next = 0; break;
        case "End": next = last; break;
        default: return;
    }
    selected.value = next;
    e.preventDefault();
}
</script>

<template>
  <LightDialog
    v-model:open="open"
    :label="t('types.title')"
    :buttons="['close']"
    resizable
  >
    <div class="types-dialog-content">
      <label>{{ t("types.userDeclared") }}</label>
      <div
        ref="list"
        class="types-list"
        role="listbox"
        tabindex="0"
        @keydown="keydown"
      >
        <div
          v-for="(type, i) in types"
          :key="type.getTaggedTypeName().getRaw()"
          class="list-cell"
          :class="{ selected: i === selected }"
          role="option"
          :aria-selected="i === selected"
          @click="selected = i"
          @dblclick="editType(type)"
        >
          {{ TypesDialog.listText(type) }}
        </div>
      </div>
      <div class="types-dialog-buttons">
        <button
          type="button"
          class="id-types-add"
          @click="editType(null)"
        >
          {{ t("types.add") }}
        </button>
        <button
          type="button"
          class="id-types-edit"
          @click="() => { const s = selectedType(); if (s !== null) editType(s); }"
        >
          {{ t("types.edit") }}
        </button>
        <button
          type="button"
          class="id-types-remove"
          @click="remove"
        >
          {{ t("types.remove") }}
        </button>
      </div>
    </div>
    <EditTypeDialog
      v-if="editing !== null"
      v-model:open="editOpen"
      :type-manager="typeManager"
      :existing="editing.existing"
      @ok="edited"
    />
  </LightDialog>
</template>

<style scoped>
.types-dialog-content {
    display: flex;
    flex-direction: column;
    width: 400px;
}
.types-list {
    height: 300px;
    margin: 10px 0;
    overflow-y: auto;
    border: 1px solid var(--control-border);
    background: var(--list-background, white);
}
.types-list:focus {
    outline: 1px solid var(--focus-color);
}
.list-cell {
    padding: 2px 4px;
    cursor: default;
}
.list-cell.selected {
    background: var(--list-selection-focused);
    color: var(--list-selection-text);
}
/* Java: GUI.borderLeftCenterRight */
.types-dialog-buttons {
    display: flex;
    justify-content: space-between;
}
</style>
