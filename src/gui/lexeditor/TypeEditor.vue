<script setup lang="ts">
// The type editor (Java: TypeEditor): a TopLevelEditor on the type lexer.
import { useTemplateRef } from "vue";
import type { TypeManager } from "../../engine/types/data/datatype/TypeManager.js";
import { Expression } from "../../engine/expressions/transformations/expression/Expressions.js";
import type { TypeExpression } from "../../engine/expressions/transformations/expression/type/TypeExpression.js";
import { TableAndColumnRenames } from "../../engine/identifiers/id/TableAndColumnRenames.js";
import { TypeLexer } from "../../gui-logic/lex-editor/gui/lexeditor/TypeLexer.js";
import TopLevelEditor from "./TopLevelEditor.vue";
import type { TopLevelEditorApi } from "./TopLevelEditorApi.js";

const props = defineProps<{
    typeManager: TypeManager,
    originalContent: TypeExpression | null,
    requireConcreteType: boolean,
    emptyAllowed: boolean,
    disabled?: boolean,
}>();
const emit = defineEmits<{ change: [type: TypeExpression], typesChanged: [] }>();

const lexer = new TypeLexer(props.typeManager, props.requireConcreteType, props.emptyAllowed);
const original = props.originalContent === null ? null : props.originalContent.save(Expression.SaveDestination.toTypeEditor(props.typeManager), TableAndColumnRenames.EMPTY);
const editor = useTemplateRef<TopLevelEditorApi<TypeExpression>>("editor");

defineExpose({ editor: () => editor.value });
</script>

<template>
  <TopLevelEditor
    ref="editor"
    :lexer="lexer"
    :type-manager="typeManager"
    :original-content="original"
    editor-class="type-editor"
    :disabled="disabled"
    @change="t => emit('change', t)"
    @types-changed="emit('typesChanged')"
  />
</template>
