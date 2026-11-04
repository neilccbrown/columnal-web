<script setup lang="ts">
// Java: TypesDialog.EditTypeDialog.TagValueEdit: a tag's name, and its inner type (a type editor; empty
// for none), in a row of the inner values' list.  It gives the tag, or the error, as they change.
import { onMounted, shallowRef, useTemplateRef } from "vue";
import type { Localized } from "../../../engine/anns/Annotations.js";
import { TypeExpression } from "../../../engine/expressions/transformations/expression/type/TypeExpressions.js";
import type { TagType } from "../../../engine/types/data/datatype/DataType.js";
import type { TypeManager } from "../../../engine/types/data/datatype/TypeManager.js";
import type { JellyType } from "../../../engine/types/jellytype/JellyType.js";
import type { Either } from "../../../engine/utility-adt/utility/adt/Either.js";
import { InternalException } from "../../../engine/utility-error/error/InternalException.js";
import { UserException } from "../../../engine/utility-error/error/UserException.js";
import { Log } from "../../../engine/utility/log/Log.js";
import { TypesDialog } from "../../../gui-logic/app/gui/TypesDialog.js";
import { t } from "../../i18n.js";
import TypeEditor from "../../lexeditor/TypeEditor.vue";

const props = defineProps<{
    typeManager: TypeManager,
    initial: TagType<JellyType> | null,
    editImmediately: boolean,
}>();
const emit = defineEmits<{ value: [value: Either<Localized, TagType<JellyType>>] }>();

const tagName = shallowRef(props.initial?.getName() ?? "");
const nameField = useTemplateRef<HTMLInputElement>("nameField");

// Java: TypeExpression.fromJellyType(initial inner), or blank
let startingExpression: TypeExpression | null = null;
const inner = props.initial?.getInner() ?? null;
if (inner !== null)
{
    try
    {
        startingExpression = TypeExpression.fromJellyType(inner, props.typeManager);
    }
    catch (e)
    {
        if (!(e instanceof InternalException || e instanceof UserException))
            throw e;
        Log.log(e);
    }
}
let latest: TypeExpression | null = startingExpression;

// Java: updateCurrentValue (latest is null when only the name has changed)
function updateCurrentValue(newLatest: TypeExpression | null): void
{
    if (newLatest !== null)
        latest = newLatest;
    if (latest === null)
        return;
    emit("value", TypesDialog.tagValue(props.typeManager, tagName.value, latest));
}

onMounted(() =>
{
    if (props.editImmediately)
        nameField.value?.focus();
});
</script>

<template>
  <div class="tag-value-edit">
    <input
      ref="nameField"
      v-model="tagName"
      type="text"
      class="tag-name-field"
      :placeholder="t('edit.type.inner.tag.prompt')"
      @input="updateCurrentValue(null)"
    >
    <div class="tag-inner-type">
      <TypeEditor
        :type-manager="typeManager"
        :original-content="startingExpression"
        :require-concrete-type="false"
        :empty-allowed="true"
        @change="updateCurrentValue"
      />
    </div>
  </div>
</template>

<style scoped>
.tag-value-edit {
    display: flex;
    align-items: center;
    gap: 4px;
}
.tag-name-field {
    width: 10em;
    flex: none;
}
.tag-inner-type {
    flex: 1;
    min-width: 0;
}
</style>
