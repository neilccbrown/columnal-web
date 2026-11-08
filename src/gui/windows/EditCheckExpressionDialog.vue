<script setup lang="ts">
// Java: EditCheckExpressionDialog: a Check's type (a combo box) and its expression, in a dialog which
// isn't modal, so that columns can be picked from the grid into the expression while it shows.  What the
// expression can refer to, and its type state, follow the check type (Java: Check.getColumnLookup and
// makeTypeState).  OK checks the expression (DoubleOKLightDialog: errors can be saved with a second OK);
// Enter and Escape don't press its buttons, and Tab from the expression goes to OK.
// (docs/gui-spec/transformations.md)
import { SelectContent, SelectItem, SelectItemText, SelectPortal, SelectRoot, SelectTrigger, SelectValue, SelectViewport } from "reka-ui";
import { markRaw, nextTick, shallowRef, useTemplateRef, watch } from "vue";
import type { Expression } from "../../engine/expressions/transformations/expression/Expressions.js";
import type { TypeState } from "../../engine/expressions/transformations/expression/TypeState.js";
import { FunctionList } from "../../engine/functions/transformations/function/FunctionList.js";
import { SimpleObjectProperty } from "../../engine/java/JavaFXBeans.js";
import { Check } from "../../engine/transformations/transformations/Check.js";
import { DataType } from "../../engine/types/data/datatype/DataType.js";
import type { TypeManager } from "../../engine/types/data/datatype/TypeManager.js";
import { TopLevelEditor } from "../../gui-logic/lex-editor/gui/lexeditor/TopLevelEditor.js";
import DoubleOKLightDialog from "../components/dialogs/DoubleOKLightDialog.vue";
import type { Validity } from "../components/dialogs/dialogs.js";
import HelpBox from "../components/HelpBox.vue";
import type { CheckTypeName, ColumnLookupInfo } from "../engine/protocol.js";
import type { PickingMode } from "../grid/picking.js";
import { t } from "../i18n.js";
import ExpressionEditor from "../lexeditor/ExpressionEditor.vue";
import type { TopLevelEditorApi } from "../lexeditor/TopLevelEditorApi.js";
import { CheckLookupCopy } from "../project/columnLookupCopy.js";
import { expressionPicking, loadEditorExpression, saveEditorExpression } from "./expressionDialogs.js";

const open = defineModel<boolean>("open", { required: true });
const props = defineProps<{
    // A copy of the project's types and units
    typeManager: TypeManager,
    // The tables, for the Check (us; null for a new one) of its source table (src)
    lookupInfo: ColumnLookupInfo,
    initialCheckType: CheckTypeName,
    // Saved as in a file:
    initialExpression: string | null,
    // Whether the expression is selected when shown (Java: selectAll, for a new Check)
    selectAll: boolean,
    centreOn: { readonly x: number, readonly y: number } | null,
}>();
const emit = defineEmits<{
    // The check type, and the expression saved as in a file
    ok: [checkType: CheckTypeName, expression: string],
    // The grid's picking mode while this shows (null when it closes)
    picking: [mode: PickingMode | null],
    // A fix in the expression editor declared a unit
    typesChanged: [],
}>();

const checkTypes: readonly CheckTypeName[] = Check.CheckType.values().map(c => c.name() as CheckTypeName);
const checkTypeOf = (name: CheckTypeName): Check.CheckType => Check.CheckType.values().find(c => c.name() === name)!;
const checkType = shallowRef<CheckTypeName | null>(props.initialCheckType);

const functionLookup = FunctionList.getFunctionLookup(props.typeManager.getUnitManager());
const makeColumnLookup = (ct: CheckTypeName | null): Expression.ColumnLookup => markRaw(new CheckLookupCopy(props.lookupInfo, props.typeManager, checkTypeOf(ct ?? props.initialCheckType)));
const columnLookup = markRaw(new SimpleObjectProperty<Expression.ColumnLookup>(makeColumnLookup(props.initialCheckType)));
const makeTypeState = (): TypeState => Check.makeTypeState(props.typeManager, checkType.value === null ? null : checkTypeOf(checkType.value));
watch(checkType, ct => columnLookup.set(makeColumnLookup(ct)));

const initialExpression = markRaw({ value: loadEditorExpression(props.initialExpression, props.typeManager, functionLookup, columnLookup.get(), makeTypeState()) });
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
    if (checkType.value === null)
        return "IMPOSSIBLE_TO_SAVE";
    return editor()?.hasErrors() === true ? "ERROR_BUT_CAN_SAVE" : "NO_ERRORS";
}

function calculateResult(): [CheckTypeName, string] | null
{
    return checkType.value === null || curValue === null ? null : [checkType.value, saveEditorExpression(curValue)];
}

// Java: the editor's parentFocusRightOfThis, which focuses OK after a Tab (the editor handles a Tab
// itself while it shows completions)
function editorKeyDown(e: KeyboardEvent): void
{
    if (e.key === "Tab" && !e.shiftKey)
    {
        const ok = content.value?.closest(".light-dialog")?.querySelector<HTMLElement>(".ok-button");
        if (ok !== null && ok !== undefined)
        {
            // (Not on to the dialog's focus trap, which would take OK as the last, and wrap round)
            e.preventDefault();
            e.stopPropagation();
            ok.focus();
        }
    }
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
    :label="t('edit.check.type')"
    buttons-to-side
    resizable
    :modal="false"
    :default-button="false"
    :close-on-escape="false"
    :centre-on="centreOn"
    :check-validity="checkValidity"
    :show-all-errors="() => editor()?.showAllErrors()"
    :calculate-result="calculateResult"
    @ok="(r: [CheckTypeName, string] | null) => { if (r !== null) emit('ok', r[0], r[1]); }"
  >
    <div
      ref="content"
      class="edit-check-expression-content"
    >
      <label class="edit-check-label">{{ t("edit.check.type") }}</label>
      <HelpBox help-id="edit-check/check-type" />
      <SelectRoot v-model="checkType">
        <SelectTrigger
          class="check-type-combo"
          :aria-label="t('edit.check.type')"
        >
          <SelectValue />
        </SelectTrigger>
        <SelectPortal>
          <SelectContent
            class="check-type-list"
            position="popper"
          >
            <SelectViewport>
              <SelectItem
                v-for="c in checkTypes"
                :key="c"
                :value="c"
                class="check-type-item"
              >
                <SelectItemText>{{ checkTypeOf(c).toString() }}</SelectItemText>
              </SelectItem>
            </SelectViewport>
          </SelectContent>
        </SelectPortal>
      </SelectRoot>
      <label class="edit-check-label">{{ t("edit.check.expression") }}</label>
      <HelpBox help-id="edit-check/check-expression" />
      <div @keydown="editorKeyDown">
        <ExpressionEditor
          ref="editorComponent"
          :original-content="initialExpression.value"
          :column-lookup="columnLookup"
          :expected-type="DataType.BOOLEAN"
          :type-manager="typeManager"
          :make-type-state="makeTypeState"
          :function-lookup="functionLookup"
          @change="expressionChanged"
          @types-changed="emit('typesChanged')"
        />
      </div>
    </div>
  </DoubleOKLightDialog>
</template>

<style scoped>
/* Java: LabelledGrid, edit-check-expression-content */
.edit-check-expression-content {
    display: grid;
    grid-template-columns: auto auto 1fr;
    align-items: center;
    gap: 5px 10px;
    min-width: 400px;
}
.edit-check-label {
    white-space: nowrap;
}
.check-type-combo {
    justify-self: start;
    min-width: 150px;
    padding: 3px 8px;
    font: inherit;
    text-align: left;
}
.check-type-list {
    z-index: 1000;
    padding: 2px 0;
    border: 1px solid #aaa;
    background: white;
    font-family: var(--font-main);
}
.check-type-item {
    padding: 3px 8px;
    cursor: default;
}
.check-type-item[data-highlighted] {
    background: #3875d7;
    color: white;
}
</style>
