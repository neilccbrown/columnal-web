<script setup lang="ts">
// Java: EditImmediateColumnDialog (app): a data column's name, type and default value (a new column's,
// or an existing one's), and, for a new table, the table's name (blank for an automatic one).  OK gives an error (shown in the dialog)
// until they are all valid.  Escape doesn't close it (Java: preventCloseOnEscape), as the type editor
// uses it to hide its completions.  (docs/gui-spec/tables.md)
import { nextTick, shallowRef, useTemplateRef, watch } from "vue";
import type { Localized } from "../../engine/anns/Annotations.js";
import { Expression } from "../../engine/expressions/transformations/expression/Expressions.js";
import { TypeExpression } from "../../engine/expressions/transformations/expression/type/TypeExpressions.js";
import type { ColumnId } from "../../engine/identifiers/id/ColumnId.js";
import { TableAndColumnRenames } from "../../engine/identifiers/id/TableAndColumnRenames.js";
import { TableId } from "../../engine/identifiers/id/TableId.js";
import type { DataType } from "../../engine/types/data/datatype/DataType.js";
import { DataTypeUtility } from "../../engine/types/data/datatype/DataTypeUtility.js";
import type { TypeManager } from "../../engine/types/data/datatype/TypeManager.js";
import { Either } from "../../engine/utility-adt/utility/adt/Either.js";
import type { Value } from "../../engine/utility/utility/Value.js";
import { ColumnNameTextField } from "../../gui-logic/dialogs-non-expression/gui/dialog/ColumnNameTextField.js";
import { ReadOnlyDocument } from "../../gui-logic/stf/gui/dtf/ReadOnlyDocument.js";
import type { Document } from "../../gui-logic/stf/gui/dtf/Document.js";
import { RecogniserDocument } from "../../gui-logic/stf/gui/dtf/RecogniserDocument.js";
import { TableDisplayUtility } from "../../gui-logic/stf/gui/dtf/TableDisplayUtility.js";
import { TableNameTextField } from "../../gui-logic/table-gui/gui/table/TableNameTextField.js";
import { TopLevelEditor } from "../../gui-logic/lex-editor/gui/lexeditor/TopLevelEditor.js";
import ErrorableLightDialog from "../components/dialogs/ErrorableLightDialog.vue";
import ErrorLabel from "../components/dialogs/ErrorLabel.vue";
import DocumentTextField from "../components/DocumentTextField.vue";
import ErrorableTextField from "../components/ErrorableTextField.vue";
import HelpBox from "../components/HelpBox.vue";
import type { NewColumnDetails } from "../engine/protocol.js";
import { t } from "../i18n.js";
import TypeEditor from "../lexeditor/TypeEditor.vue";

export interface ColumnDetails extends NewColumnDetails
{
    // Null if not creating a table; blank for an automatic name
    readonly tableName: string | null;
}

const open = defineModel<boolean>("open", { required: true });
const props = defineProps<{
    // The project's types (a copy: see typeCopy.ts)
    typeManager: TypeManager,
    // The tables' ids, when creating a table (its name mustn't be one of them), else null
    tableIds: readonly string[] | null,
    centreOn?: { readonly x: number, readonly y: number } | null,
    // An existing column (Java: the dialog's initial column name and type, its type saved as in a
    // file), with its default value (as display text), or null for a new one:
    initialColumn?: { readonly name: string, readonly type: string, readonly defaultValue: string | null } | null,
    // Java: InitialFocus (the table's name is focused if creating a table, else the column's name)
    initialFocus?: "name" | "type",
}>();
const emit = defineEmits<{ ok: [details: ColumnDetails] }>();

const tableNameText = shallowRef("");
const tableId = shallowRef<TableId | null>(null);
const columnNameText = shallowRef("");
const columnId = shallowRef<ColumnId | null>(null);
// The type editor's latest type, and the type it gives (Java: customDataType)
let typeExpression: TypeExpression | null = null;
let customDataType: DataType | null = null;
let latestType: DataType | null = null;
let defaultValue: Value | null = null;
let defaultValueDocument: RecogniserDocument<Value> | null = null;
const defaultDocument = shallowRef<Document>(new ReadOnlyDocument(""));
const defaultDisabled = shallowRef(true);
// Remade each time it opens (Java makes a new dialog each time):
const generation = shallowRef(0);

const dialog = useTemplateRef<{ clearError(): void }>("dialog");
const content = useTemplateRef<HTMLElement>("content");
const typeEditor = useTemplateRef<{ editor(): { showAllErrors(): void, focus(side: TopLevelEditor.Focus): void } | null }>("typeEditor");
// Java: TypeExpression.fromDataType(dataType), the column's type
const originalType = shallowRef<TypeExpression | null>(null);

watch(open, isOpen =>
{
    if (!isOpen)
        return;
    generation.value += 1;
    tableNameText.value = "";
    columnNameText.value = props.initialColumn?.name ?? "";
    originalType.value = props.initialColumn === null || props.initialColumn === undefined ? null : TypeExpression.parseTypeExpression(props.initialColumn.type);
    typeExpression = null;
    customDataType = null;
    latestType = null;
    defaultValue = null;
    defaultValueDocument = null;
    defaultDocument.value = new ReadOnlyDocument("");
    defaultDisabled.value = true;
    // Java: setOnShown, focusing the table name if there is one, else the column name, or the type
    void nextTick(() => setTimeout(() =>
    {
        if (props.tableIds === null && props.initialFocus === "type")
            typeEditor.value?.editor()?.focus(TopLevelEditor.Focus.RIGHT);
        else
            content.value?.querySelector<HTMLInputElement>(props.tableIds !== null ? "input.table-name-text-field" : "input.column-name-text-field")?.focus();
    }));
}, { immediate: true });

// Java: the type editor's onChange
function typeChanged(t: TypeExpression): void
{
    dialog.value?.clearError();
    typeExpression = t;
    customDataType = t.toDataType(props.typeManager);
    updateType(customDataType);
}

// Java: updateType, a new default value field for a new type
function updateType(type: DataType | null): void
{
    if (type === null)
    {
        defaultDisabled.value = true;
        return;
    }
    if (latestType === null || !type.equals(latestType))
    {
        defaultValueDocument = makeEditorKit(type);
        defaultDocument.value = defaultValueDocument;
        latestType = type;
    }
    defaultDisabled.value = false;
}

// Java: makeEditorKit: the type's default value, in a document which recognises what is typed.
// Java bug, fixed: for an existing column, Java showed the type's default rather than the column's own,
// so OK changed a column's default back (and remade its table); now the column's type has its default.
function makeEditorKit(type: DataType): RecogniserDocument<Value>
{
    defaultValue = DataTypeUtility.makeDefaultValue(type);
    const columnDefault = props.initialColumn?.defaultValue ?? null;
    const initialText = columnDefault !== null && originalType.value?.toDataType(props.typeManager)?.equals(type) === true ? columnDefault : DataTypeUtility.valueToString(defaultValue);
    const recogniser = TableDisplayUtility.recogniser(type, true);
    const editorKit = new RecogniserDocument<Value>(initialText, recogniser.itemClass, recogniser.recogniser, null, (_s, v) =>
    {
        defaultValue = v;
    }, () => content.value?.closest(".light-dialog")?.querySelector<HTMLElement>(".ok-button")?.focus(), null);
    defaultValue = editorKit.getLatestValue().leftToNull();
    return editorKit;
}

// Java: calculateResult
function calculateResult(): Either<Localized, ColumnDetails>
{
    typeEditor.value?.editor()?.showAllErrors();
    // Check whether some conditions are fulfilled
    const dataType = customDataType;
    if (props.tableIds !== null && tableId.value === null)
        return Either.left(t("edit.column.invalid.table.name"));
    if (columnId.value === null)
        return Either.left(t("edit.column.invalid.column.name"));
    if (dataType === null || typeExpression === null)
        return Either.left(t("edit.column.invalid.column.type"));
    if (defaultValue === null)
        return Either.left(t("edit.column.invalid.column.defaultValue", defaultValueDocument === null ? "" : defaultValueDocument.getLatestValue().either(err => err.error.toPlain(), _v => "")));
    return Either.right({
        tableName: props.tableIds === null ? null : tableId.value!.getRaw(),
        columnName: columnId.value.getRaw(),
        type: typeExpression.save(Expression.SaveDestination.TO_FILE, TableAndColumnRenames.EMPTY),
        defaultValue: DataTypeUtility.valueToString(defaultValue),
    });
}

const tableNameConverter = (text: string): ReturnType<ReturnType<typeof TableNameTextField.converter>> =>
    TableNameTextField.converter((props.tableIds ?? []).map(id => new TableId(id)), null, true)(text);

// Java: TableNameTextField's Enter, which focuses the column name
function tableNameKeydown(e: KeyboardEvent): void
{
    if (e.key === "Enter")
    {
        e.preventDefault();
        e.stopPropagation();
        content.value?.querySelector<HTMLInputElement>("input.column-name-text-field")?.focus();
    }
}
</script>

<template>
  <ErrorableLightDialog
    ref="dialog"
    v-model:open="open"
    :label="t('edit.column.name')"
    buttons-to-side
    resizable
    :close-on-escape="false"
    :centre-on="centreOn ?? null"
    :calculate-result="calculateResult"
    @ok="details => emit('ok', details)"
  >
    <template #default="{ error, clearError }">
      <div
        ref="content"
        :key="generation"
        class="edit-column-content"
      >
        <div
          v-if="tableIds !== null"
          class="edit-column-details"
        >
          <label class="edit-column-label">{{ t("edit.table.name") }}</label>
          <HelpBox help-id="edit-column/table-name" />
          <ErrorableTextField
            v-model:text="tableNameText"
            class="table-name-text-field"
            :converter="tableNameConverter"
            :placeholder="t('table.name.prompt.auto')"
            :aria-label="t('edit.table.name')"
            @update:value="v => { tableId = v; clearError(); }"
            @keydown="tableNameKeydown"
          />
        </div>
        <p class="edit-column-explanation">
          {{ (tableIds !== null ? t("newcolumn.newTableExplanation") + "  " : "") + t("newcolumn.newColumnExplanation") }}
        </p>
        <div class="edit-column-details">
          <label class="edit-column-label">{{ t("edit.column.name") }}</label>
          <HelpBox help-id="edit-column/column-name" />
          <ErrorableTextField
            v-model:text="columnNameText"
            class="column-name-text-field"
            :converter="ColumnNameTextField.convert"
            :aria-label="t('edit.column.name')"
            @update:value="v => { columnId = v; clearError(); }"
          />
          <label class="edit-column-label">{{ t("edit.column.type") }}</label>
          <HelpBox help-id="edit-column/column-type" />
          <TypeEditor
            ref="typeEditor"
            :type-manager="typeManager"
            :original-content="originalType"
            :require-concrete-type="true"
            :empty-allowed="false"
            @change="typeChanged"
          />
          <label class="edit-column-label">{{ t("edit.column.defaultValue") }}</label>
          <HelpBox help-id="edit-column/column-defaultValue" />
          <DocumentTextField
            class="default-value"
            :class="{ disabled: defaultDisabled }"
            :document="defaultDocument"
            :inert="defaultDisabled"
            @focus-lost="clearError()"
          />
        </div>
        <ErrorLabel :error="error" />
      </div>
    </template>
  </ErrorableLightDialog>
</template>

<style scoped>
.edit-column-content {
    display: flex;
    flex-direction: column;
    gap: 8px;
}
.edit-column-explanation {
    width: 450px;
    margin: 0;
}
.edit-column-details {
    display: grid;
    grid-template-columns: auto auto 1fr;
    align-items: center;
    gap: 6px 4px;
}
.edit-column-label {
    text-align: right;
}
.default-value {
    border: 1px solid rgb(128 128 128);
    background: white;
}
.default-value.disabled {
    opacity: 0.4;
}
</style>
