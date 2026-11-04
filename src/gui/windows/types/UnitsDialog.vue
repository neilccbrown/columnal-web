<script setup lang="ts">
// Java: UnitsDialog: the user-defined units (name, definition, description), with buttons to add, edit
// and remove them, above the built-in units (with their category), and Close.  It changes the
// TypeManager's UnitManager it is given (a copy of the project's: the window sends the units to the
// engine when it closes).  (docs/gui-spec/types-and-units.md)
import { computed, shallowRef, watch } from "vue";
import type { UnitIdentifier } from "../../../engine/anns/Annotations.js";
import type { TypeManager } from "../../../engine/types/data/datatype/TypeManager.js";
import type { Pair } from "../../../engine/utility-adt/utility/adt/Pair.js";
import { UnitsDialog } from "../../../gui-logic/app/gui/UnitsDialog.js";
import LightDialog from "../../components/dialogs/LightDialog.vue";
import { t } from "../../i18n.js";
import EditUnitDialog from "./EditUnitDialog.vue";

const open = defineModel<boolean>("open", { required: true });
const props = defineProps<{ typeManager: TypeManager }>();

const unitManager = computed(() => props.typeManager.getUnitManager());
const userDeclared = shallowRef<readonly Pair<UnitIdentifier, UnitsDialog.UnitDef>[]>([]);
const builtIn = computed(() => UnitsDialog.sortedUnits(unitManager.value.getAllBuiltIn(), unitManager.value));
const selected = shallowRef<number | null>(null);
// The unit being edited (null for a new one), while its dialog shows:
const editing = shallowRef<{ readonly prevValue: Pair<UnitIdentifier, UnitsDialog.UnitDef> | null } | null>(null);
const editOpen = shallowRef(false);

// Java: UnitList.setUnits
function setUnits(): void
{
    userDeclared.value = UnitsDialog.sortedUnits(unitManager.value.getAllUserDeclared(), unitManager.value);
    if (selected.value !== null && selected.value >= userDeclared.value.length)
        selected.value = null;
}

watch(open, isOpen =>
{
    if (!isOpen)
        return;
    selected.value = null;
    setUnits();
}, { immediate: true });

// Java: addUnit, and editSingleSelectedItem (each over this dialog, which Java closed and showed again)
function addUnit(): void
{
    editing.value = { prevValue: null };
    editOpen.value = true;
}

function editSingleSelectedItem(): void
{
    const prevValue = selected.value === null ? undefined : userDeclared.value[selected.value];
    if (prevValue === undefined)
        return;
    editing.value = { prevValue };
    editOpen.value = true;
}

function edited(unit: Pair<UnitIdentifier, UnitsDialog.UnitDef>): void
{
    const prevValue = editing.value?.prevValue ?? null;
    if (prevValue !== null)
        unitManager.value.removeUserUnit(prevValue.getFirst());
    unitManager.value.addUserUnit(unit);
    setUnits();
}

function remove(): void
{
    const unit = selected.value === null ? undefined : userDeclared.value[selected.value];
    if (unit === undefined)
        return;
    unitManager.value.removeUserUnit(unit.getFirst());
    setUnits();
}

// (JavaFX's TableView's keys)
function keydown(e: KeyboardEvent): void
{
    const last = userDeclared.value.length - 1;
    if (last < 0)
        return;
    const current = selected.value;
    let next: number;
    switch (e.key)
    {
        case "ArrowDown": next = current === null ? 0 : Math.min(last, current + 1); break;
        case "ArrowUp": next = current === null ? 0 : Math.max(0, current - 1); break;
        case "Home": next = 0; break;
        case "End": next = last; break;
        default: return;
    }
    selected.value = next;
    e.preventDefault();
}
</script>

<template>
  <LightDialog
    v-model:open="open"
    :label="t('units.title')"
    :buttons="['close']"
    resizable
  >
    <div class="units-dialog-content">
      <div class="units-dialog-user-defined">
        <label>{{ t("units.userDeclared") }}</label>
        <div
          class="unit-list user-unit-list"
          role="grid"
          tabindex="0"
          @keydown="keydown"
        >
          <div class="table-header">
            <span>Name</span><span>Definition</span><span>Description</span>
          </div>
          <div
            v-for="(unit, i) in userDeclared"
            :key="unit.getFirst()"
            class="table-row"
            :class="{ selected: i === selected }"
            role="row"
            :aria-selected="i === selected"
            @click="selected = i"
            @dblclick="editSingleSelectedItem"
          >
            <span class="table-cell">{{ unit.getFirst() }}</span>
            <span class="table-cell">{{ UnitsDialog.definitionText(unit.getSecond()) }}</span>
            <span class="table-cell">{{ UnitsDialog.descriptionText(unit.getSecond()) }}</span>
          </div>
        </div>
        <div class="units-dialog-buttons">
          <button
            type="button"
            class="id-units-userDeclared-add"
            @click="addUnit"
          >
            {{ t("units.userDeclared.add") }}
          </button>
          <button
            type="button"
            class="id-units-userDeclared-edit"
            :disabled="selected === null"
            @click="editSingleSelectedItem"
          >
            {{ t("units.userDeclared.edit") }}
          </button>
          <button
            type="button"
            class="id-units-userDeclared-remove"
            :disabled="selected === null"
            @click="remove"
          >
            {{ t("units.userDeclared.remove") }}
          </button>
        </div>
      </div>
      <div class="units-dialog-built-in">
        <label>{{ t("units.builtIn") }}</label>
        <div class="unit-list built-in-unit-list with-category">
          <div class="table-header">
            <span>Category</span><span>Name</span><span>Definition</span><span>Description</span>
          </div>
          <div
            v-for="unit in builtIn"
            :key="unit.getFirst()"
            class="table-row"
          >
            <span class="table-cell">{{ UnitsDialog.category(unit.getSecond()) }}</span>
            <span class="table-cell">{{ unit.getFirst() }}</span>
            <span class="table-cell">{{ UnitsDialog.definitionText(unit.getSecond()) }}</span>
            <span class="table-cell">{{ UnitsDialog.descriptionText(unit.getSecond()) }}</span>
          </div>
        </div>
      </div>
    </div>
    <EditUnitDialog
      v-if="editing !== null"
      v-model:open="editOpen"
      :type-manager="typeManager"
      :initial-value="editing.prevValue"
      @ok="edited"
    />
  </LightDialog>
</template>

<style scoped>
/* Java: a vertical SplitPane, 550 x 700 */
.units-dialog-content {
    display: flex;
    flex-direction: column;
    width: 550px;
    height: 700px;
    max-height: calc(100vh - 120px);
}
.units-dialog-user-defined, .units-dialog-built-in {
    display: flex;
    flex-direction: column;
    min-height: 0;
}
.units-dialog-user-defined {
    flex: 1;
}
.units-dialog-built-in {
    flex: 1;
    margin-top: 10px;
    border-top: 1px solid var(--control-border);
    padding-top: 10px;
}
/* JavaFX's TableView */
.unit-list {
    flex: 1;
    min-height: 0;
    margin: 10px 0;
    overflow-y: auto;
    border: 1px solid var(--control-border);
    background: var(--list-background, white);
    font-size: 90%;
}
.unit-list:focus {
    outline: 1px solid var(--focus-color);
}
.table-header, .table-row {
    display: grid;
    grid-template-columns: 1fr 1.5fr 2fr;
}
.with-category .table-header, .with-category .table-row {
    grid-template-columns: 1fr 1fr 1.5fr 2fr;
}
.table-header {
    position: sticky;
    top: 0;
    background: var(--control-background-dark);
    border-bottom: 1px solid var(--control-border);
    font-weight: bold;
}
.table-header > span, .table-cell {
    padding: 2px 4px;
    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;
}
.table-row.selected {
    background: var(--list-selection-focused);
    color: var(--list-selection-text);
}
.units-dialog-buttons {
    display: flex;
    justify-content: space-between;
}
</style>
