<script setup lang="ts">
// Java: TypesDialog.EditTypeDialog: a tagged type's name, and its tags, either plainly (names, one per
// line or separated by commas) or with type arguments and inner types (a list of tags, each with a type
// editor).  The two tabs follow each other: editing the plain tags resets the inner values' list, and
// while it has no type arguments or inner types, editing the list rewrites the plain tags; otherwise the
// plain tab is disabled.  The logic is in src/gui-logic/app/gui/TypesDialog.ts.
// (docs/gui-spec/types-and-units.md)
import { nextTick, shallowRef, useTemplateRef, watch } from "vue";
import type { Localized } from "../../../engine/anns/Annotations.js";
import { TagType } from "../../../engine/types/data/datatype/DataType.js";
import type { TaggedTypeDefinition } from "../../../engine/types/data/datatype/TaggedTypeDefinition.js";
import type { TypeManager } from "../../../engine/types/data/datatype/TypeManager.js";
import type { JellyType } from "../../../engine/types/jellytype/JellyType.js";
import { Either } from "../../../engine/utility-adt/utility/adt/Either.js";
import { Utility } from "../../../engine/utility/utility/Utility.js";
import { TypesDialog } from "../../../gui-logic/app/gui/TypesDialog.js";
import ErrorableLightDialog from "../../components/dialogs/ErrorableLightDialog.vue";
import ErrorLabel from "../../components/dialogs/ErrorLabel.vue";
import FancyList from "../../components/FancyList.vue";
import { t } from "../../i18n.js";
import TagValueEdit from "./TagValueEdit.vue";

const open = defineModel<boolean>("open", { required: true });
const props = defineProps<{
    typeManager: TypeManager,
    // The type being edited, or null for a new one:
    existing: TaggedTypeDefinition | null,
}>();
const emit = defineEmits<{ ok: [type: TaggedTypeDefinition] }>();

// An inner value's row: its tag to start with, and its tag (or error) now
interface TagItem
{
    readonly key: number;
    readonly initial: TagType<JellyType> | null;
    readonly value: Either<Localized, TagType<JellyType>>;
}

let nextKey = 0;
const typeName = shallowRef("");
const tab = shallowRef<"plain" | "inner">("plain");
const plainTagList = shallowRef("");
const innerValueTypeArgs = shallowRef("");
const tags = shallowRef<readonly TagItem[]>([]);
const plainDisabled = shallowRef(false);
// Remade each time it opens (Java makes a new dialog each time):
const generation = shallowRef(0);
// Java: the tag rows' first values come before the dialog is shown, and change nothing
let ready = false;
const nameField = useTemplateRef<HTMLInputElement>("nameField");

function item(tag: TagType<JellyType> | null, value?: Either<Localized, TagType<JellyType>>): TagItem
{
    return { key: nextKey++, initial: tag, value: value ?? (tag !== null ? Either.right(tag) : Either.left(Utility.universal("Loading"))) };
}

watch(open, isOpen =>
{
    if (!isOpen)
        return;
    generation.value += 1;
    ready = false;
    const existing = props.existing;
    typeName.value = existing?.getTaggedTypeName().getRaw() ?? "";
    plainTagList.value = existing?.getTags().map(t => t.getName()).join("\n") ?? "";
    innerValueTypeArgs.value = existing === null ? "" : TypesDialog.typeArgsText(existing);
    tags.value = existing?.getTags().map(t => item(t)) ?? [];
    tab.value = existing === null || TypesDialog.startsOnPlain(existing) ? "plain" : "inner";
    plainDisabled.value = false;
    // Java: setOnShown, focusing the type name
    void nextTick(() => setTimeout(() =>
    {
        ready = true;
        nameField.value?.focus();
    }));
}, { immediate: true });

// Java: the plain tags' listener: on the plain tab, the inner values become the plain tags
function plainChanged(): void
{
    if (tab.value !== "plain")
        return;
    innerValueTypeArgs.value = "";
    tags.value = TypesDialog.getPlainTags(plainTagList.value).map(p => p.either(() => item(null), name => item(new TagType<JellyType>(name, null))));
}

// Java: innerValueChanged
function innerValueChanged(): void
{
    if (!ready || tab.value !== "inner")
        return;
    const plain = TypesDialog.plainFromInner(innerValueTypeArgs.value, tags.value.map(t => t.value));
    plainDisabled.value = plain === null;
    if (plain !== null)
        plainTagList.value = plain;
}

// The list's changes: a row's tag changing, or rows added, deleted or reordered
function itemsChanged(items: TagItem[]): void
{
    tags.value = items;
    innerValueChanged();
}

function calculateResult(): Either<Localized, TaggedTypeDefinition>
{
    return TypesDialog.calculateResult(typeName.value, tab.value, plainTagList.value, innerValueTypeArgs.value, tags.value.map(t => t.value));
}
</script>

<template>
  <ErrorableLightDialog
    v-model:open="open"
    :label="t('types.edit.title')"
    buttons-to-side
    :calculate-result="calculateResult"
    @ok="type => emit('ok', type)"
  >
    <template #default="{ error }">
      <div
        :key="generation"
        class="edit-type-dialog-content"
      >
        <label class="labelled">
          <span>{{ t("edit.type.name") }}</span>
          <input
            ref="nameField"
            v-model="typeName"
            type="text"
            class="type-name-field"
          >
        </label>
        <div
          class="tab-pane"
          role="tablist"
        >
          <button
            type="button"
            role="tab"
            class="tab type-entry-tab-plain"
            :class="{ selected: tab === 'plain' }"
            :aria-selected="tab === 'plain'"
            :disabled="plainDisabled"
            @click="tab = 'plain'"
          >
            Plain
          </button>
          <button
            type="button"
            role="tab"
            class="tab type-entry-tab-standard"
            :class="{ selected: tab === 'inner' }"
            :aria-selected="tab === 'inner'"
            @click="tab = 'inner'"
          >
            Inner Values
          </button>
        </div>
        <div
          v-show="tab === 'plain'"
          class="tab-content"
          role="tabpanel"
        >
          <label class="plain-tags-label">{{ t("edit.type.plain.tags") }}</label>
          <textarea
            v-model="plainTagList"
            class="type-entry-plain-tags-textarea"
            @input="plainChanged"
          />
        </div>
        <div
          v-show="tab === 'inner'"
          class="tab-content inner-values-tab-content"
          role="tabpanel"
        >
          <label class="labelled inner-values-type-args-pane">
            <span>{{ t("edit.type.args") }}</span>
            <input
              v-model="innerValueTypeArgs"
              type="text"
              class="type-entry-inner-type-args"
              @input="innerValueChanged"
            >
          </label>
          <div class="inner-values-list-header-pane">
            <span>{{ t("edit.type.inner.tag") }}</span>
            <span>{{ t("edit.type.inner.type") }}</span>
          </div>
          <FancyList
            class="inner-value-tag-list"
            :items="tags"
            :new-item="() => item(null)"
            @update:items="itemsChanged"
          >
            <template #cell="{ item: tagItem, editImmediately, setItem }">
              <TagValueEdit
                :key="tagItem.key"
                :type-manager="typeManager"
                :initial="tagItem.initial"
                :edit-immediately="editImmediately"
                @value="v => setItem({ ...tagItem, value: v })"
              />
            </template>
          </FancyList>
        </div>
        <ErrorLabel :error="error" />
      </div>
    </template>
  </ErrorableLightDialog>
</template>

<style scoped>
.edit-type-dialog-content {
    display: flex;
    flex-direction: column;
    gap: 8px;
    width: 600px;
}
.labelled {
    display: flex;
    align-items: center;
    gap: 6px;
}
.labelled > input {
    flex: 1;
}
/* JavaFX's TabPane: tabs along the top, the content in a bordered box */
.tab-pane {
    display: flex;
    gap: 2px;
    border-bottom: 1px solid var(--control-border);
}
.tab {
    padding: 3px 10px;
    border: 1px solid var(--control-border);
    border-bottom: none;
    border-radius: 3px 3px 0 0;
    background: var(--control-background-dark);
    font: inherit;
}
.tab.selected {
    background: var(--control-background);
}
.tab-content {
    display: flex;
    flex-direction: column;
    gap: 6px;
}
.type-entry-plain-tags-textarea {
    height: 200px;
    font: inherit;
}
.inner-values-list-header-pane {
    display: flex;
    justify-content: space-between;
}
.inner-value-tag-list {
    min-height: 200px;
    height: 350px;
}
</style>
