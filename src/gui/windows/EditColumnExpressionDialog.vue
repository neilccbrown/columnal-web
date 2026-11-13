<script setup lang="ts">
// Java: EditColumnExpressionDialog: a column's name and its expression, in a dialog which isn't modal, so
// that columns can be picked from the grid while it shows (into the expression, or as the name, whichever
// was focused last).  OK checks the expression (DoubleOKLightDialog: errors can be saved with a second
// OK); Enter and Escape don't press its buttons.  For a Calculate's columns it has no side pane
// (withoutSidePane); for an Aggregate's (AggregateSplitByPane.editColumn) the split is to its left, and
// recipe buttons above the expression while it's empty make one (asking for columns with
// SelectColumnDialog).  (docs/gui-spec/transformations.md)
//
// PORT-NOTE: Java took a column clicked in the grid into the field focused earliest in the last 250 ms
// (TimedFocusable.getRecentlyFocused sorts by time and takes the first: the bug fixed in EditJoinDialog);
// this takes it into the one focused last.
import { computed, markRaw, nextTick, shallowRef, useTemplateRef, watch } from "vue";
import { BracketedStatus } from "../../engine/expressions/transformations/expression/BracketedStatus.js";
import { CallExpression, Expression, IdentExpression } from "../../engine/expressions/transformations/expression/Expressions.js";
import { TypeExpression } from "../../engine/expressions/transformations/expression/type/TypeExpressions.js";
import { Max } from "../../engine/functions/transformations/function/comparison/Max.js";
import { MaxIndex } from "../../engine/functions/transformations/function/comparison/MaxIndex.js";
import { Min } from "../../engine/functions/transformations/function/comparison/Min.js";
import { MinIndex } from "../../engine/functions/transformations/function/comparison/MinIndex.js";
import { GetElement } from "../../engine/functions/transformations/function/list/GetElement.js";
import { Sum } from "../../engine/functions/transformations/function/Sum.js";
import { FunctionList } from "../../engine/functions/transformations/function/FunctionList.js";
import { ColumnId } from "../../engine/identifiers/id/ColumnId.js";
import { TableAndColumnRenames } from "../../engine/identifiers/id/TableAndColumnRenames.js";
import { TableId } from "../../engine/identifiers/id/TableId.js";
import { SimpleObjectProperty } from "../../engine/java/JavaFXBeans.js";
import { TypeState } from "../../engine/expressions/transformations/expression/TypeState.js";
import type { MultipleTableLookup } from "../../engine/transformations/transformations/MultipleTableLookup.js";
import { DataTypeUtility } from "../../engine/types/data/datatype/DataTypeUtility.js";
import type { TypeManager } from "../../engine/types/data/datatype/TypeManager.js";
import { TypeExp } from "../../engine/types/typeExp/TypeExps.js";
import { InternalException } from "../../engine/utility-error/error/InternalException.js";
import { UserException } from "../../engine/utility-error/error/UserException.js";
import { Pair } from "../../engine/utility-adt/utility/adt/Pair.js";
import { Utility } from "../../engine/utility/utility/Utility.js";
import { AutoComplete } from "../../gui-logic/dialogs-non-expression/gui/dialog/AutoComplete.js";
import { ColumnNameTextField } from "../../gui-logic/dialogs-non-expression/gui/dialog/ColumnNameTextField.js";
import { TopLevelEditor } from "../../gui-logic/lex-editor/gui/lexeditor/TopLevelEditor.js";
import AggregateSplitByPane from "../components/AggregateSplitByPane.vue";
import DoubleOKLightDialog from "../components/dialogs/DoubleOKLightDialog.vue";
import type { Validity } from "../components/dialogs/dialogs.js";
import ErrorableTextField from "../components/ErrorableTextField.vue";
import HelpBox from "../components/HelpBox.vue";
import type { ColumnLookupInfo } from "../engine/protocol.js";
import type { PickingMode } from "../grid/picking.js";
import { t } from "../i18n.js";
import ExpressionEditor from "../lexeditor/ExpressionEditor.vue";
import type { TopLevelEditorApi } from "../lexeditor/TopLevelEditorApi.js";
import { AggregateLookupCopy, ColumnLookupCopy } from "../project/columnLookupCopy.js";
import { loadEditorExpression, saveEditorExpression } from "./expressionDialogs.js";
import SelectColumnDialog, { type SelectInfo, type SubPicker } from "./SelectColumnDialog.vue";

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
    // For an Aggregate's column (Java: AggregateSplitByPane.editColumn), the columns it splits by (the
    // side pane's, and the expression's lookup's: Java's agg.getColumnLookup(), the Aggregate as it is)
    aggregate?: { readonly splitBy: readonly string[] } | null,
}>();
const emit = defineEmits<{
    // The column's name, its expression saved as in a file, and for an Aggregate's, the split
    ok: [column: string, expression: string, splitBy: string[] | null],
    // Java: the expression editor's fix moving the expression to a new Calculate (after the dialog
    // closes): the column being edited, and the name and expression (saved as in a file)
    move: [editingColumn: string, newColumn: string | null, expression: string],
    // The grid's picking mode while this shows (null when it closes)
    picking: [mode: PickingMode | null],
    // A fix in the expression editor declared a unit
    typesChanged: [],
}>();

const functionLookup = FunctionList.getFunctionLookup(props.typeManager.getUnitManager());
// Java: Calculate.makeTypeState, or Aggregate.makeTypeState (with the group count)
const makeTypeState = (): TypeState =>
{
    if (props.aggregate === null || props.aggregate === undefined)
        return TypeState.withRowNumber(props.typeManager, functionLookup);
    const typeState = new TypeState(props.typeManager, functionLookup).add(TypeState.GROUP_COUNT, TypeExp.plainNumber(null), _ss => {});
    if (typeState === null)
        throw new InternalException("Error in standard type state");
    return typeState;
};
const srcColumns = computed(() => props.lookupInfo.tables.find(table => table.id === props.lookupInfo.src && table.single)?.columns?.map(c => c.name) ?? []);

const nameText = shallowRef(props.initialName ?? "");
const name = shallowRef<ColumnId | null>(null);
const dialog = useTemplateRef<{ notifyModified(): void }>("dialog");
const content = useTemplateRef<HTMLElement>("content");
const nameField = useTemplateRef<{ focus(): void, setText(text: string): void }>("nameField");
const editorComponent = useTemplateRef<{ editor(): TopLevelEditorApi<Expression> | null }>("editorComponent");
const editor = (): TopLevelEditorApi<Expression> | null => editorComponent.value?.editor() ?? null;

// Java: makeColumnLookup(name): the editor's lookup, for the column with the name in the name field (an
// Aggregate's is the same whatever the name)
function makeColumnLookup(columnId: ColumnId | null): Expression.ColumnLookup
{
    if (props.aggregate !== null && props.aggregate !== undefined)
        return markRaw(new AggregateLookupCopy(props.lookupInfo, props.typeManager, props.aggregate.splitBy));
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
    expressionEmpty.value = isEmpty(e);
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

// Java: TimedFocusable.getRecentlyFocused, of the expression editor, the name field and the side pane's
// fields (see the PORT-NOTE above)
const recentlyFocused = shallowRef<"editor" | "name" | "split" | null>(null);

// --- An Aggregate's side pane and recipes ---------------------------------------------------------------

const sidePane = useTemplateRef<{ getItems(): string[] | null, pickColumnIfEditing(column: string): void }>("sidePane");

// Java: RecipeBar.update: shown while the expression is empty
const isEmpty = (e: Expression | null): boolean => e === null || saveForEditor(e).trim() === "";
const expressionEmpty = shallowRef(isEmpty(initialExpression.value));
function saveForEditor(e: Expression): string
{
    return e.save(Expression.SaveDestination.toExpressionEditor(props.typeManager, curColumnLookup.get(), functionLookup), BracketedStatus.DONT_NEED_BRACKETS, TableAndColumnRenames.EMPTY);
}

// Java: SelectColumnDialog, while a recipe asks for columns, and its sub-picker
const selectColumns = shallowRef<{ readonly selectors: readonly SelectInfo[], readonly make: (columns: string[]) => Expression } | null>(null);
const selectColumnsOpen = shallowRef(false);
const sub: { picker: SubPicker | null } = { picker: null };

// Java: DataTypeUtility.isNumber of the source's column's type (true if it can't be had)
function isNumberColumn(column: string): boolean
{
    const type = props.lookupInfo.tables.find(table => table.id === props.lookupInfo.src && table.single)?.columns?.find(c => c.name === column)?.type ?? null;
    if (type === null)
        return true;
    try
    {
        const dataType = TypeExpression.parseTypeExpression(type).toDataType(props.typeManager);
        return dataType === null || DataTypeUtility.isNumber(dataType);
    }
    catch (e)
    {
        if (!(e instanceof UserException || e instanceof InternalException))
            throw e;
        return true;
    }
}

// Java: directOrByIndex: the function of the column, or the result column's element at the function's
// index in the compared column
function directOrByIndex(directFunctionName: string, getIndexFunctionName: string): (columns: string[]) => Expression
{
    return ([main, show]) =>
    {
        const mainId = new ColumnId(main!);
        const showId = new ColumnId(show!);
        if (mainId.equals(showId))
            return new CallExpression(functionLookup, directFunctionName, IdentExpression.column(mainId));
        return new CallExpression(functionLookup, GetElement.NAME, IdentExpression.column(showId), new CallExpression(functionLookup, getIndexFunctionName, IdentExpression.column(mainId)));
    };
}

// Java: AggregateSplitByPane.editColumn's recipes: Count, Sum (of a number column), Lowest and Highest
// (comparing one column, giving the result from another)
interface Recipe
{
    readonly titleKey: string;
    readonly make: () => void;
}
const dualColumn = (make: (columns: string[]) => Expression) => (): void => askForColumns([
    { labelKey: "agg.recipe.pick.compare", helpKey: "agg-recipe/calc-column", filterColumn: () => true, copyFromPrevious: false },
    { labelKey: "agg.recipe.pick.result", helpKey: "agg-recipe/result-column", filterColumn: () => true, copyFromPrevious: true },
], make);
const recipes: readonly Recipe[] = [
    { titleKey: "expression.recipe.count", make: () => setExpression(IdentExpression.load(TypeState.GROUP_COUNT)) },
    { titleKey: "expression.recipe.sum", make: () => askForColumns([{ labelKey: "agg.recipe.pick.calc", helpKey: null, filterColumn: isNumberColumn, copyFromPrevious: false }], ([c]) => new CallExpression(functionLookup, Sum.NAME, IdentExpression.column(new ColumnId(c!)))) },
    { titleKey: "expression.recipe.min", make: dualColumn(directOrByIndex(Min.NAME, MinIndex.NAME)) },
    { titleKey: "expression.recipe.max", make: dualColumn(directOrByIndex(Max.NAME, MaxIndex.NAME)) },
];

function askForColumns(selectors: readonly SelectInfo[], make: (columns: string[]) => Expression): void
{
    selectColumns.value = { selectors, make };
    selectColumnsOpen.value = true;
}

function columnsSelected(columns: string[]): void
{
    if (selectColumns.value !== null)
        setExpression(selectColumns.value.make(columns));
}

function setExpression(expression: Expression): void
{
    editor()?.setContent(saveForEditor(expression));
}

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

// Java: the side pane's calculateResult: the split (null if a column isn't valid), or for no side pane,
// UnitType.UNIT
function sidePaneResult(): { readonly splitBy: string[] | null } | null
{
    if (props.aggregate === null || props.aggregate === undefined)
        return { splitBy: null };
    const items = sidePane.value?.getItems() ?? null;
    return items === null ? null : { splitBy: items };
}

function checkValidity(): Validity
{
    editor()?.save(true);
    if (name.value === null)
        return "IMPOSSIBLE_TO_SAVE";
    else if (editor()?.hasErrors() === true)
        return "ERROR_BUT_CAN_SAVE";
    else
        return sidePaneResult() === null ? "IMPOSSIBLE_TO_SAVE" : "NO_ERRORS";
}

interface Result
{
    readonly column: string;
    readonly expression: string;
    readonly splitBy: string[] | null;
}
function calculateResult(): Result | null
{
    const extra = sidePaneResult();
    if (name.value === null || curValue === null || extra === null)
        return null;
    return { column: name.value.getRaw(), expression: saveExpression(curValue), splitBy: extra.splitBy };
}

function showAllErrors(): void
{
    editor()?.showAllErrors();
}

function ok(result: Result | null): void
{
    if (result !== null)
        emit("ok", result.column, result.expression, result.splitBy);
}

// Java: ExpressionEditor's ColumnPicker, piggy-backed by the dialog: picking a column of the grid
const picking: PickingMode = markRaw({
    kind: "column",
    include: (table, column) =>
    {
        if (column === null)
            return false;
        if (sub.picker !== null)
            return sub.picker.include(table, column);
        if (recentlyFocused.value === "editor")
            return editor()?.isFocused() === true && curColumnLookup.get().getPossibleColumnReferences(new TableId(table), new ColumnId(column)).length > 0;
        else if (recentlyFocused.value === "name")
            return srcColumns.value.includes(column);
        // (Java: the side pane's includeColumn, a column of the source)
        else if (recentlyFocused.value === "split")
            return table === props.lookupInfo.src;
        return false;
    },
    onPick: picked =>
    {
        const ed = editor();
        // If they recently clicked a completion, ignore this click:
        if (ed === null || ed.isMouseClickImmune() || picked.column === null)
            return;
        if (sub.picker !== null)
            sub.picker.onPick(picked.table, picked.column);
        else if (recentlyFocused.value === "editor")
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
        else if (recentlyFocused.value === "split")
            sidePane.value?.pickColumnIfEditing(picked.column);
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
      :class="{ 'with-side-pane': aggregate }"
    >
      <!-- Java: the side pane, to the left -->
      <div
        v-if="aggregate"
        class="edit-column-side-pane"
        @focusin="recentlyFocused = 'split'"
      >
        <AggregateSplitByPane
          ref="sidePane"
          :src-columns="srcColumns"
          :original-split-by="aggregate.splitBy"
        />
      </div>
      <div class="edit-column-main">
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
          <!-- Java: RecipeBar, shown while the expression is empty -->
          <div
            v-if="aggregate"
            class="recipe-bar"
            :style="{ visibility: expressionEmpty ? 'visible' : 'hidden' }"
          >
            <button
              v-for="recipe in recipes"
              :key="recipe.titleKey"
              type="button"
              class="recipe-button"
              @click="recipe.make()"
            >
              {{ t(recipe.titleKey) }}
            </button>
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
    </div>
    <SelectColumnDialog
      v-if="selectColumns !== null && lookupInfo.src !== null"
      :key="String(selectColumnsOpen)"
      v-model:open="selectColumnsOpen"
      :src="lookupInfo.src"
      :src-columns="srcColumns"
      :selectors="selectColumns.selectors"
      @ok="columnsSelected"
      @sub-picker="p => { sub.picker = p; }"
    />
  </DoubleOKLightDialog>
</template>

<style scoped>
/* Java: a BorderPane, the side pane to the left of the main content */
.edit-column-expression-root {
    display: flex;
    gap: 10px;
}
.edit-column-side-pane {
    min-width: 200px;
}
.recipe-bar {
    grid-column: 1 / -1;
    display: flex;
    flex-wrap: wrap;
    gap: 12px;
}
/* Java: ExpressionEditor.getEditorDimension with a side pane */
.with-side-pane :deep(.top-level-editor.expression-editor) {
    width: 300px;
    min-height: 130px;
}
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
