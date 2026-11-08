<script setup lang="ts">
// Java: EditExpressionDialog: an expression editor (as for a Filter's expression), with a message above
// it if given, in a dialog which isn't modal, so that columns can be picked from the grid into the
// expression while it shows.  OK checks the expression (DoubleOKLightDialog: errors can be saved with
// a second OK).  (docs/gui-spec/transformations.md)
import { markRaw, nextTick, useTemplateRef, watch } from "vue";
import type { Expression } from "../../engine/expressions/transformations/expression/Expressions.js";
import type { TypeState } from "../../engine/expressions/transformations/expression/TypeState.js";
import { FunctionList } from "../../engine/functions/transformations/function/FunctionList.js";
import { SimpleObjectProperty } from "../../engine/java/JavaFXBeans.js";
import type { DataType } from "../../engine/types/data/datatype/DataType.js";
import type { TypeManager } from "../../engine/types/data/datatype/TypeManager.js";
import { TopLevelEditor } from "../../gui-logic/lex-editor/gui/lexeditor/TopLevelEditor.js";
import DoubleOKLightDialog from "../components/dialogs/DoubleOKLightDialog.vue";
import type { Validity } from "../components/dialogs/dialogs.js";
import type { PickingMode } from "../grid/picking.js";
import { t } from "../i18n.js";
import ExpressionEditor from "../lexeditor/ExpressionEditor.vue";
import type { TopLevelEditorApi } from "../lexeditor/TopLevelEditorApi.js";
import { expressionPicking, loadEditorExpression, saveEditorExpression } from "./expressionDialogs.js";

const open = defineModel<boolean>("open", { required: true });
const props = defineProps<{
    // A copy of the project's types and units
    typeManager: TypeManager,
    columnLookup: Expression.ColumnLookup,
    makeTypeState: () => TypeState,
    expectedType: DataType | null,
    // Saved as in a file:
    initialExpression: string | null,
    // Whether the expression is selected when shown (Java: selectAll, for a new transformation)
    selectAll: boolean,
    // Java: topMessageKey, a label above the editor
    topMessageKey: string | null,
    centreOn: { readonly x: number, readonly y: number } | null,
}>();
const emit = defineEmits<{
    // The expression, saved as in a file
    ok: [expression: string],
    // The grid's picking mode while this shows (null when it closes)
    picking: [mode: PickingMode | null],
    // A fix in the expression editor declared a unit
    typesChanged: [],
}>();

const functionLookup = FunctionList.getFunctionLookup(props.typeManager.getUnitManager());
const columnLookup = markRaw(new SimpleObjectProperty<Expression.ColumnLookup>(props.columnLookup));
const initialExpression = markRaw({ value: loadEditorExpression(props.initialExpression, props.typeManager, functionLookup, props.columnLookup, props.makeTypeState()) });
let curValue: Expression | null = null;

const dialog = useTemplateRef<{ notifyModified(): void }>("dialog");
const content = useTemplateRef<HTMLElement>("content");
const editorComponent = useTemplateRef<{ editor(): TopLevelEditorApi<Expression> | null }>("editorComponent");
const editor = (): TopLevelEditorApi<Expression> | null => editorComponent.value?.editor() ?? null;

function expressionChanged(e: Expression): void
{
    curValue = e;
    dialog.value?.notifyModified();
}

function checkValidity(): Validity
{
    editor()?.save(true);
    return editor()?.hasErrors() === true ? "ERROR_BUT_CAN_SAVE" : "NO_ERRORS";
}

function calculateResult(): string | null
{
    return curValue === null ? null : saveEditorExpression(curValue);
}

const picking = expressionPicking(editor, () => columnLookup.get(), props.typeManager, functionLookup, () => content.value);

watch(open, isOpen =>
{
    emit("picking", isOpen ? picking : null);
    // Java: once shown, the editor is focused at its start, and its content selected if asked
    if (isOpen)
    {
        void nextTick(() => setTimeout(() =>
        {
            editor()?.focus(TopLevelEditor.Focus.LEFT);
            if (props.selectAll)
                editor()?.selectAll();
        }));
    }
}, { immediate: true });
</script>

<template>
  <DoubleOKLightDialog
    ref="dialog"
    v-model:open="open"
    :label="topMessageKey !== null ? t(topMessageKey) : t('edit.column.expression')"
    buttons-to-side
    resizable
    :modal="false"
    :centre-on="centreOn"
    :check-validity="checkValidity"
    :show-all-errors="() => editor()?.showAllErrors()"
    :calculate-result="calculateResult"
    @ok="(r: string | null) => { if (r !== null) emit('ok', r); }"
  >
    <div
      ref="content"
      class="edit-expression-root"
    >
      <p
        v-if="topMessageKey !== null"
        class="edit-expression-top-message"
      >
        {{ t(topMessageKey) }}
      </p>
      <ExpressionEditor
        ref="editorComponent"
        :original-content="initialExpression.value"
        :column-lookup="columnLookup"
        :expected-type="expectedType"
        :type-manager="typeManager"
        :make-type-state="makeTypeState"
        :function-lookup="functionLookup"
        @change="expressionChanged"
        @types-changed="emit('typesChanged')"
      />
    </div>
  </DoubleOKLightDialog>
</template>

<style scoped>
.edit-expression-root {
    min-width: 400px;
}
.edit-expression-top-message {
    margin: 0 0 10px;
    max-width: 500px;
}
</style>
