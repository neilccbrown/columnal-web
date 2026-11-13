<script setup lang="ts">
// Java: SelectColumnDialog: the columns a recipe needs, one field each (with completions of the source's
// columns that suit it, and "Type column name or click on column" above it while focused).  It isn't
// modal: a column of the source clicked in the grid goes into the field focused most recently (the
// column dialog passes its picking on to this, Java's sub-picker).  Choosing a column focuses the next
// field, copying the column into it if it is to be.  (docs/gui-spec/transformations.md)
import { markRaw, nextTick, shallowRef, watch } from "vue";
import { Either } from "../../engine/utility-adt/utility/adt/Either.js";
import { IdentifierUtility } from "../../engine/utility/utility/IdentifierUtility.js";
import { TranslationUtility } from "../../engine/utility/utility/TranslationUtility.js";
import { AutoComplete } from "../../gui-logic/dialogs-non-expression/gui/dialog/AutoComplete.js";
import AutoCompleteField from "../components/AutoCompleteField.vue";
import ErrorableLightDialog from "../components/dialogs/ErrorableLightDialog.vue";
import ErrorLabel from "../components/dialogs/ErrorLabel.vue";
import HelpBox from "../components/HelpBox.vue";
import { t } from "../i18n.js";

/** Java: SelectColumnDialog.SelectInfo. */
export interface SelectInfo
{
    readonly labelKey: string;
    readonly helpKey: string | null;
    // Which of the source's columns the completions offer
    readonly filterColumn: (column: string) => boolean;
    // Once the previous item is set, should it be copied to this?
    // PORT-NOTE: possible Java bug, kept: Java's comment adds "if this is blank at the time", but it's
    // copied whatever this holds (so changing the previous column replaces a column chosen here).
    readonly copyFromPrevious: boolean;
}

/** Java's sub-picker: what the column dialog's picking from the grid does while this shows. */
export interface SubPicker
{
    include(table: string, column: string): boolean;
    onPick(table: string, column: string): void;
}

const open = defineModel<boolean>("open", { required: true });
const props = defineProps<{
    src: string,
    srcColumns: readonly string[],
    selectors: readonly SelectInfo[],
}>();
const emit = defineEmits<{
    // As many columns as selectors
    ok: [columns: string[]],
    subPicker: [picker: SubPicker | null],
}>();

type Field = { focus(): void, setContentDirect(text: string): void, input(): HTMLInputElement | null };

const texts = shallowRef<readonly string[]>(props.selectors.map(() => ""));
const focusedIndex = shallowRef<number | null>(null);
const fields: (Field | null)[] = props.selectors.map(() => null);
let mostRecentlyFocused: number | null = null;

class ColumnCompletion extends AutoComplete.SimpleCompletion
{
    public constructor(public readonly column: string)
    {
        super(column, null);
    }
}

const models = props.selectors.map((selectInfo, index) => markRaw(new AutoComplete.Model<ColumnCompletion>({
    calculateCompletions: s => props.srcColumns.filter(c => selectInfo.filterColumn(c) && c.includes(s)).map(c => new ColumnCompletion(c)),
}, {
    doubleClick: (_currentText, selectedItem) =>
    {
        nameSetForIndex(selectedItem.column, index);
        return selectedItem.column;
    },
    keyboardSelect: (_textBefore, _textAfter, selectedItem) =>
    {
        if (selectedItem === null)
            return null;
        nameSetForIndex(selectedItem.column, index);
        return selectedItem.column;
    },
}, AutoComplete.WhitespacePolicy.ALLOW_ONE_ANYWHERE_TRIM)));

function setText(index: number, text: string): void
{
    texts.value = texts.value.map((s, i) => i === index ? text : s);
}

function setField(index: number, field: unknown): void
{
    fields[index] = field as Field | null;
}

function focused(index: number): void
{
    focusedIndex.value = index;
    mostRecentlyFocused = index;
}

// Java: nameSetForIndex: the next field is focused (with its text selected), after the column is copied
// into it if it's to be
function nameSetForIndex(name: string, index: number): void
{
    if (index + 1 >= props.selectors.length)
        return;
    if (props.selectors[index + 1]!.copyFromPrevious)
    {
        fields[index + 1]?.setContentDirect(name);
        setText(index + 1, name);
    }
    setTimeout(() =>
    {
        fields[index + 1]?.focus();
        fields[index + 1]?.input()?.select();
    });
}

function calculateResult(): Either<string, string[]>
{
    const results: string[] = [];
    for (const text of texts.value)
    {
        const ident = IdentifierUtility.asExpressionIdentifier(text.trim());
        if (ident === null)
            return Either.left(TranslationUtility.getString("edit.column.invalid.column.name"));
        results.push(ident);
    }
    return Either.right(results);
}

// Java: the column picker's enableColumnPickingMode, while this shows: a column of the source goes into
// the field focused most recently
const subPicker: SubPicker = {
    include: table => table === props.src,
    onPick: (_table, column) =>
    {
        if (mostRecentlyFocused === null)
            return;
        fields[mostRecentlyFocused]?.setContentDirect(column);
        setText(mostRecentlyFocused, column);
        nameSetForIndex(column, mostRecentlyFocused);
    },
};

watch(open, isOpen =>
{
    emit("subPicker", isOpen ? subPicker : null);
    // Java: the first field is focused once shown
    if (isOpen)
        void nextTick(() => setTimeout(() => fields[0]?.focus()));
}, { immediate: true });
</script>

<template>
  <ErrorableLightDialog
    v-model:open="open"
    label="Select column"
    :modal="false"
    :calculate-result="calculateResult"
    @ok="r => emit('ok', r)"
  >
    <template #default="{ error }">
      <div class="select-column-dialog">
        <template
          v-for="(selector, index) in selectors"
          :key="index"
        >
          <label class="select-column-label">{{ t(selector.labelKey) }}</label>
          <HelpBox
            v-if="selector.helpKey !== null"
            :help-id="selector.helpKey"
          />
          <span v-else />
          <div
            class="select-column-field-pane"
            @focusin="focused(index)"
            @focusout="focusedIndex = null"
          >
            <label
              class="select-column-instruction"
              :style="{ visibility: focusedIndex === index ? 'visible' : 'hidden' }"
            >{{ t("pick.column.instruction") }}</label>
            <AutoCompleteField
              :ref="(f: unknown) => setField(index, f)"
              :text="texts[index] ?? ''"
              :model="models[index]!"
              field-class="select-column-field"
              :aria-label="t(selector.labelKey)"
              @update:text="(text: string) => setText(index, text)"
            />
          </div>
        </template>
        <ErrorLabel
          class="select-column-error"
          :error="error"
        />
      </div>
    </template>
  </ErrorableLightDialog>
</template>

<style scoped>
/* Java: LabelledGrid */
.select-column-dialog {
    display: grid;
    grid-template-columns: auto auto 1fr;
    align-items: end;
    gap: 5px 10px;
}
.select-column-label {
    white-space: nowrap;
    margin-bottom: 4px;
}
.select-column-field-pane {
    display: flex;
    flex-direction: column;
}
.select-column-instruction {
    font-size: 75%;
    color: rgb(77 77 77);
}
.select-column-error {
    grid-column: 1 / -1;
}
</style>
