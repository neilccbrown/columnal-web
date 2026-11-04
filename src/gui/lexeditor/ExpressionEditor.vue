<script setup lang="ts">
// The expression editor (Java: ExpressionEditor): a TopLevelEditor on the expression lexer, which
// checks the expression against the column lookup (in the GUI, a ColumnLookupCopy of the engine's).
// (docs/gui-spec/expression-editor.md)
import { useTemplateRef } from "vue";
import { BracketedStatus } from "../../engine/expressions/transformations/expression/BracketedStatus.js";
import { Expression } from "../../engine/expressions/transformations/expression/Expressions.js";
import type { FunctionLookup } from "../../engine/expressions/transformations/expression/function/FunctionLookup.js";
import type { TypeState } from "../../engine/expressions/transformations/expression/TypeState.js";
import type { ColumnId } from "../../engine/identifiers/id/ColumnId.js";
import { TableAndColumnRenames } from "../../engine/identifiers/id/TableAndColumnRenames.js";
import type { ObjectExpression } from "../../engine/java/JavaFXBeans.js";
import type { DataType } from "../../engine/types/data/datatype/DataType.js";
import type { TypeManager } from "../../engine/types/data/datatype/TypeManager.js";
import type { Pair } from "../../engine/utility-adt/utility/adt/Pair.js";
import { ExpressionLexer } from "../../gui-logic/lex-editor/gui/lexeditor/ExpressionLexer.js";
import TopLevelEditor from "./TopLevelEditor.vue";
import type { TopLevelEditorApi } from "./TopLevelEditorApi.js";

const props = defineProps<{
    originalContent: Expression | null,
    columnLookup: ObjectExpression<Expression.ColumnLookup>,
    expectedType: DataType | null,
    typeManager: TypeManager,
    makeTypeState: () => TypeState,
    functionLookup: FunctionLookup,
    disabled?: boolean,
    // (See TopLevelEditor's)
    forceCloseDialog?: () => Pair<ColumnId | null, Expression> | null,
}>();
const emit = defineEmits<{ change: [expression: Expression], typesChanged: [] }>();

const lexer = new ExpressionLexer(props.columnLookup, props.typeManager, props.functionLookup, props.makeTypeState, props.expectedType);
const original = props.originalContent === null ? null : props.originalContent.save(Expression.SaveDestination.toExpressionEditor(props.typeManager, props.columnLookup.get(), props.functionLookup), BracketedStatus.DONT_NEED_BRACKETS, TableAndColumnRenames.EMPTY);
const editor = useTemplateRef<TopLevelEditorApi<Expression>>("editor");

defineExpose({ editor: () => editor.value });
</script>

<template>
  <TopLevelEditor
    ref="editor"
    :lexer="lexer"
    :type-manager="typeManager"
    :original-content="original"
    editor-class="expression-editor"
    :disabled="disabled"
    :force-close-dialog="forceCloseDialog"
    @change="e => emit('change', e)"
    @types-changed="emit('typesChanged')"
  />
</template>
