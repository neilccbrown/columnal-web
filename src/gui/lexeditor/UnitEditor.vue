<script setup lang="ts">
// The unit editor (Java: UnitEditor): a TopLevelEditor on the unit lexer.
import { useTemplateRef } from "vue";
import type { TypeManager } from "../../engine/types/data/datatype/TypeManager.js";
import { Expression } from "../../engine/expressions/transformations/expression/Expressions.js";
import type { UnitExpression } from "../../engine/expressions/transformations/expression/UnitExpression.js";
import { UnitLexer } from "../../gui-logic/lex-editor/gui/lexeditor/UnitLexer.js";
import TopLevelEditor from "./TopLevelEditor.vue";
import type { TopLevelEditorApi } from "./TopLevelEditorApi.js";

const props = defineProps<{
    typeManager: TypeManager,
    originalContent: UnitExpression | null,
    disabled?: boolean,
}>();
const emit = defineEmits<{ change: [unit: UnitExpression], typesChanged: [] }>();

const lexer = new UnitLexer(props.typeManager, false);
const original = props.originalContent === null ? null : props.originalContent.save(Expression.SaveDestination.toUnitEditor(props.typeManager.getUnitManager()), true);
const editor = useTemplateRef<TopLevelEditorApi<UnitExpression>>("editor");

defineExpose({ editor: () => editor.value });
</script>

<template>
  <TopLevelEditor
    ref="editor"
    :lexer="lexer"
    :type-manager="typeManager"
    :original-content="original"
    editor-class="unit-editor"
    :disabled="disabled"
    @change="u => emit('change', u)"
    @types-changed="emit('typesChanged')"
  />
</template>
