<script setup lang="ts">
// Java: EditColumnExpressionDialog (withoutSidePane, as for a Calculate's columns): a column's name and
// its expression, in a dialog which isn't modal, so that columns can be picked from the grid while it
// shows (into the expression, or as the name, whichever was focused last).  OK checks the expression
// (DoubleOKLightDialog: errors can be saved with a second OK); Enter and Escape don't press its
// buttons.  (docs/gui-spec/transformations.md)
// PORT-DEFERRED: the side pane and recipes (Aggregate's split by and recipe buttons, Phase 11)
import { computed, markRaw, nextTick, shallowRef, useTemplateRef, watch } from "vue";
import { BracketedStatus } from "../../engine/expressions/transformations/expression/BracketedStatus.js";
import { Expression } from "../../engine/expressions/transformations/expression/Expressions.js";
import { FunctionList } from "../../engine/functions/transformations/function/FunctionList.js";
import { ColumnId } from "../../engine/identifiers/id/ColumnId.js";
import { TableAndColumnRenames } from "../../engine/identifiers/id/TableAndColumnRenames.js";
import { TableId } from "../../engine/identifiers/id/TableId.js";
import { SimpleObjectProperty } from "../../engine/java/JavaFXBeans.js";
import { TypeState } from "../../engine/expressions/transformations/expression/TypeState.js";
import type { MultipleTableLookup } from "../../engine/transformations/transformations/MultipleTableLookup.js";
import type { TypeManager } from "../../engine/types/data/datatype/TypeManager.js";
import { Pair } from "../../engine/utility-adt/utility/adt/Pair.js";
import { Utility } from "../../engine/utility/utility/Utility.js";
import { AutoComplete } from "../../gui-logic/dialogs-non-expression/gui/dialog/AutoComplete.js";
import { ColumnNameTextField } from "../../gui-logic/dialogs-non-expression/gui/dialog/ColumnNameTextField.js";
import { TopLevelEditor } from "../../gui-logic/lex-editor/gui/lexeditor/TopLevelEditor.js";
import DoubleOKLightDialog from "../components/dialogs/DoubleOKLightDialog.vue";
import type { Validity } from "../components/dialogs/dialogs.js";
import ErrorableTextField from "../components/ErrorableTextField.vue";
import HelpBox from "../components/HelpBox.vue";
import type { ColumnLookupInfo } from "../engine/protocol.js";
import type { PickingMode } from "../grid/picking.js";
import { t } from "../i18n.js";
import ExpressionEditor from "../lexeditor/ExpressionEditor.vue";
import type { TopLevelEditorApi } from "../lexeditor/TopLevelEditorApi.js";
import { ColumnLookupCopy } from "../project/columnLookupCopy.js";
import { loadEditorExpression, saveEditorExpression } from "./expressionDialogs.js";

const open = defineModel<boolean>("open", { required: true });
const props = defineProps<{
    // A copy of the project's types and units
    typeManager: TypeManager,
    // What the expression can refer to: the table being edited and its source
    lookupInfo: ColumnLookupInfo,
    initialName: string | null,
    // Saved as in a file:
    initialExpression: string | null,
    // Java: addTopMessage
    topMessageKey?: string | null,
}>();
const emit = defineEmits<{
    // The column's name, and its expression saved as in a file
    ok: [column: string, expression: string],
    // Java: the expression editor's fix moving the expression to a new Calculate (after the dialog
    // closes): the column being edited, and the name and expression (saved as in a file)
    move: [editingColumn: string, newColumn: string | null, expression: string],
    // The grid's picking mode while this shows (null when it closes)
    picking: [mode: PickingMode | null],
    // A fix in the expression editor declared a unit
    typesChanged: [],
}>();

const functionLookup = FunctionList.getFunctionLookup(props.typeManager.getUnitManager());
// Java: Calculate.makeTypeState
const makeTypeState = (): TypeState => TypeState.withRowNumber(props.typeManager, functionLookup);
const srcColumns = computed(() => props.lookupInfo.tables.find(table => table.id === props.lookupInfo.src && table.single)?.columns?.map(c => c.name) ?? []);

const nameText = shallowRef(props.initialName ?? "");
const name = shallowRef<ColumnId | null>(null);
const dialog = useTemplateRef<{ notifyModified(): void }>("dialog");
const content = useTemplateRef<HTMLElement>("content");
const nameField = useTemplateRef<{ focus(): void, setText(text: string): void }>("nameField");
const editorComponent = useTemplateRef<{ editor(): TopLevelEditorApi<Expression> | null }>("editorComponent");
const editor = (): TopLevelEditorApi<Expression> | null => editorComponent.value?.editor() ?? null;

// Java: makeColumnLookup(name): the editor's lookup, for the column with the name in the name field
function makeColumnLookup(columnId: ColumnId | null): ColumnLookupCopy
{
    const editing: MultipleTableLookup.CalculationEditor | null = columnId === null ? null : {
        getCurrentlyEditingColumn: () => columnId,
        moveExpressionToNewCalculation: () => details => emit("move", columnId.getRaw(), details.getFirst()?.getRaw() ?? null, saveExpression(details.getSecond())),
    };
    return markRaw(new ColumnLookupCopy(props.lookupInfo, props.typeManager, editing));
}
const curColumnLookup = markRaw(new SimpleObjectProperty<Expression.ColumnLookup>(makeColumnLookup(props.initialName === null ? null : new ColumnId(props.initialName))));

// The column's expression, as the engine saved it
const initialExpression = markRaw({ value: loadEditorExpression(props.initialExpression, props.typeManager, functionLookup, curColumnLookup.get(), makeTypeState()) });
let curValue: Expression | null = null;
const saveExpression = saveEditorExpression;

function nameChanged(v: ColumnId | null): void
{
    name.value = v;
    dialog.value?.notifyModified();
    curColumnLookup.set(makeColumnLookup(v));
}

function expressionChanged(e: Expression): void
{
    curValue = e;
    dialog.value?.notifyModified();
}

// Java: the name field's AutoComplete: the source table's columns starting with the text, once the text
// has changed (else it is annoying to have to click the completions away to focus the expression)
class ColumnCompletion extends AutoComplete.Completion
{
    public constructor(public readonly columnId: string)
    {
        super();
    }

    public override makeDisplay(_currentText: string): AutoComplete.CompletionContent
    {
        return new AutoComplete.CompletionContent(this.columnId, null);
    }
}
let contentHasChanged = false;
const nameCompletions = markRaw(new AutoComplete.Model<ColumnCompletion>({
    calculateCompletions: textFieldContent =>
    {
        if (!contentHasChanged && textFieldContent !== (props.initialName ?? ""))
            contentHasChanged = true;
        return contentHasChanged ? srcColumns.value.filter(c => Utility.startsWithIgnoreCase(c, textFieldContent)).map(c => new ColumnCompletion(c)) : [];
    },
}, {
    doubleClick: (_currentText, selectedItem) => selectedItem.columnId,
    keyboardSelect: (textBeforeCaret, textAfterCaret, selectedItem) =>
    {
        editor()?.focus(TopLevelEditor.Focus.LEFT);
        return selectedItem !== null ? selectedItem.columnId : textBeforeCaret + textAfterCaret;
    },
}, AutoComplete.WhitespacePolicy.ALLOW_ONE_ANYWHERE_TRIM)) as unknown as AutoComplete.Model<AutoComplete.Completion>;

// Tab goes from the name to the expression (Java: an event filter on the name field, after the
// completions' own, which take a Tab while they show, and then focus the expression themselves)
function nameKeyDown(e: KeyboardEvent): void
{
    if (e.key === "Tab" && !e.shiftKey && !e.defaultPrevented)
    {
        editor()?.focus(TopLevelEditor.Focus.LEFT);
        e.preventDefault();
        e.stopPropagation();
    }
}

// Java: TimedFocusable.getRecentlyFocused, of the expression editor and the name field
const recentlyFocused = shallowRef<"editor" | "name" | null>(null);

// Java: the editor's forceCloseDialog
function forceCloseDialog(): Pair<ColumnId | null, Expression> | null
{
    const ed = editor();
    if (ed === null)
        return null;
    const result = new Pair<ColumnId | null, Expression>(name.value, ed.save(true));
    open.value = false;
    return result;
}

function checkValidity(): Validity
{
    editor()?.save(true);
    if (name.value === null)
        return "IMPOSSIBLE_TO_SAVE";
    else if (editor()?.hasErrors() === true)
        return "ERROR_BUT_CAN_SAVE";
    else
        return "NO_ERRORS";
}

function calculateResult(): Pair<string, string> | null
{
    if (name.value === null || curValue === null)
        return null;
    return new Pair(name.value.getRaw(), saveExpression(curValue));
}

function showAllErrors(): void
{
    editor()?.showAllErrors();
}

function ok(result: Pair<string, string> | null): void
{
    if (result !== null)
        emit("ok", result.getFirst(), result.getSecond());
}

// Java: ExpressionEditor's ColumnPicker, piggy-backed by the dialog: picking a column of the grid
const picking: PickingMode = markRaw({
    kind: "column",
    include: (table, column) =>
    {
        if (column === null)
            return false;
        if (recentlyFocused.value === "editor")
            return editor()?.isFocused() === true && curColumnLookup.get().getPossibleColumnReferences(new TableId(table), new ColumnId(column)).length > 0;
        else if (recentlyFocused.value === "name")
            return srcColumns.value.includes(column);
        return false;
    },
    onPick: picked =>
    {
        const ed = editor();
        // If they recently clicked a completion, ignore this click:
        if (ed === null || ed.isMouseClickImmune() || picked.column === null)
            return;
        if (recentlyFocused.value === "editor")
        {
            const references = curColumnLookup.get().getPossibleColumnReferences(new TableId(picked.table), new ColumnId(picked.column));
            const reference = references[0];
            if (reference !== undefined)
            {
                ed.replaceSelection(reference.getExpression().save(Expression.SaveDestination.toExpressionEditor(props.typeManager, curColumnLookup.get(), functionLookup), BracketedStatus.DONT_NEED_BRACKETS, TableAndColumnRenames.EMPTY));
                ed.focus(TopLevelEditor.Focus.RIGHT);
            }
        }
        else if (recentlyFocused.value === "name")
            nameField.value?.setText(picked.column);
    },
    target: () => content.value?.closest(".light-dialog")?.getBoundingClientRect() ?? null,
    startPoint: null,
});

watch(open, isOpen =>
{
    emit("picking", isOpen ? picking : null);
    // Java: the name field is focused once shown
    if (isOpen)
        void nextTick(() => setTimeout(() => nameField.value?.focus()));
}, { immediate: true });

</script>

<template>
  <DoubleOKLightDialog
    ref="dialog"
    v-model:open="open"
    :label="t('edit.column.expression')"
    buttons-to-side
    resizable
    :modal="false"
    :default-button="false"
    :close-on-escape="false"
    :check-validity="checkValidity"
    :show-all-errors="showAllErrors"
    :calculate-result="calculateResult"
    @ok="ok"
  >
    <div
      ref="content"
      class="edit-column-expression-root"
    >
      <p
        v-if="topMessageKey"
        class="edit-column-top-message"
      >
        {{ t(topMessageKey) }}
      </p>
      <div class="edit-column-expression-content">
        <label class="edit-column-label">{{ t("edit.column.name") }}</label>
        <HelpBox help-id="edit-column/column-name" />
        <div
          @focusin="recentlyFocused = 'name'"
          @keydown="nameKeyDown"
        >
          <ErrorableTextField
            ref="nameField"
            v-model:text="nameText"
            class="column-name-text-field"
            :converter="ColumnNameTextField.convert"
            :auto-complete="nameCompletions"
            :aria-label="t('edit.column.name')"
            @update:value="nameChanged"
          />
        </div>
        <label class="edit-column-label">{{ t("edit.column.expression") }}</label>
        <HelpBox help-id="edit-column/column-expression" />
        <div @focusin="recentlyFocused = 'editor'">
          <ExpressionEditor
            ref="editorComponent"
            :original-content="initialExpression.value"
            :column-lookup="curColumnLookup"
            :expected-type="null"
            :type-manager="typeManager"
            :make-type-state="makeTypeState"
            :function-lookup="functionLookup"
            :force-close-dialog="forceCloseDialog"
            @change="expressionChanged"
            @types-changed="emit('typesChanged')"
          />
        </div>
      </div>
    </div>
  </DoubleOKLightDialog>
</template>

<style scoped>
/* Java: LabelledGrid, edit-column-expression-content */
.edit-column-expression-content {
    display: grid;
    grid-template-columns: auto auto 1fr;
    align-items: center;
    gap: 5px 10px;
}
.edit-column-label {
    white-space: nowrap;
}
.edit-column-top-message {
    margin: 0 0 10px;
    max-width: 500px;
}
</style>
