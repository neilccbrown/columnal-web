<script setup lang="ts">
// The dialogs which make and edit transformations, for the project's window
// (docs/gui-spec/transformations.md): picking a transformation and its source table (Java: View.createTable's
// TRANSFORM and CHECK, and View.createTransform), then editing the new transformation (Java:
// TableDisplay.editAfterCreation); and editing a transformation from its hat's links (Java: TableHat's
// Clickables) and a Calculate's columns from their headers (TransformationEdits.editColumn_Calc).
import { markRaw, shallowRef, watch } from "vue";
import type { CellPosition } from "../../engine/data/data/CellPosition.js";
import type { TypeState } from "../../engine/expressions/transformations/expression/TypeState.js";
import { Filter } from "../../engine/transformations/transformations/Filter.js";
import { DataType } from "../../engine/types/data/datatype/DataType.js";
import type { TypeManager } from "../../engine/types/data/datatype/TypeManager.js";
import { showAlert } from "../alerts.js";
import { ignoreClosed } from "../engine/EngineClient.js";
import type { CheckTypeName, ColumnLookupInfo, EngineAlert, HatLink, RenameOnEditKind, TransformationKind } from "../engine/protocol.js";
import { useEngine } from "../engine/useEngine.js";
import type { GridTableDisplay } from "../grid/GridTableDisplay.js";
import type { PickingMode } from "../grid/picking.js";
import { ColumnLookupCopy } from "../project/columnLookupCopy.js";
import { copyTypeManager } from "../project/typeCopy.js";
import EditCheckExpressionDialog from "./EditCheckExpressionDialog.vue";
import EditColumnExpressionDialog from "./EditColumnExpressionDialog.vue";
import EditExpressionDialog from "./EditExpressionDialog.vue";
import PickTableDialog from "./PickTableDialog.vue";
import PickTransformationDialog from "./PickTransformationDialog.vue";

type Point = { readonly x: number, readonly y: number };

const props = defineProps<{
    // The grid's display of a table, once the grid has it
    findDisplay: (id: string) => Promise<GridTableDisplay | null>,
}>();
const emit = defineEmits<{
    // The grid's picking mode, while a dialog picks a table or column from it (null when none does)
    picking: [mode: PickingMode | null],
    // A fix in an expression editor declared a unit in the copy of the project's types
    typesChanged: [typeManager: TypeManager],
}>();

const engine = useEngine();

const picking = shallowRef<PickingMode | null>(null);
watch(picking, mode => emit("picking", mode));
// A dialog's picking mode (null when it closes, unless another dialog's has replaced it)
function dialogPicking(kind: PickingMode["kind"], mode: PickingMode | null): void
{
    if (mode !== null || picking.value?.kind === kind)
        picking.value = mode;
}

function alertIfAny(alert: EngineAlert | null): void
{
    if (alert !== null)
        showAlert(alert);
}

// --- Picking the transformation, and its source table ------------------------------------------------

// Java: PickTransformationDialog: for a new table at the position, or (Java: View.createTransform) a
// transformation of the table, below it
type TransformationFor = { readonly kind: "position", readonly position: CellPosition } | { readonly kind: "table", readonly src: string };
const pickTransformation = shallowRef<{ readonly at: Point, readonly for: TransformationFor } | null>(null);
const pickTransformationOpen = shallowRef(false);

// Java: PickTableDialog: the source of a new transformation or Check, or a transformation's new source
type TableFor =
    | { readonly kind: "transformation", readonly transformation: TransformationKind, readonly position: CellPosition }
    | { readonly kind: "check", readonly position: CellPosition }
    | { readonly kind: "source", readonly table: string };
const pickTable = shallowRef<{ readonly at: Point, readonly for: TableFor, readonly exclude: readonly string[] } | null>(null);
const pickTableOpen = shallowRef(false);

/** Java: View.createTable's TRANSFORM: which transformation, then its source table. */
function newTransformation(position: CellPosition, point: Point): void
{
    pickTransformation.value = { at: point, for: { kind: "position", position } };
    pickTransformationOpen.value = true;
}

/** Java: View.createTransform, the table menu's Transform. */
function transform(display: GridTableDisplay, point: Point): void
{
    pickTransformation.value = { at: point, for: { kind: "table", src: display.info.id } };
    pickTransformationOpen.value = true;
}

/** Java: View.createTable's CHECK: the source table, then the Check's dialog. */
function newCheck(position: CellPosition, point: Point): void
{
    openPickTable({ at: point, for: { kind: "check", position }, exclude: [] });
}

function transformationChosen(name: string, point: Point): void
{
    const chosen = pickTransformation.value;
    if (chosen === null || (name !== "calculate" && name !== "filter"))
        return;
    if (chosen.for.kind === "table")
        void createTransformation(name, chosen.for.src, null).catch(ignoreClosed);
    else
        openPickTable({ at: point, for: { kind: "transformation", transformation: name, position: chosen.for.position }, exclude: [] });
}

function openPickTable(target: { readonly at: Point, readonly for: TableFor, readonly exclude: readonly string[] }): void
{
    pickTable.value = target;
    pickTableOpen.value = true;
    // Java: View.enableTablePickingMode, while the dialog shows (from where it was asked for): only
    // tables (not Checks) can be picked
    picking.value = markRaw<PickingMode>({
        kind: "table",
        include: table => !target.exclude.includes(table) && engine.tables.tables.value.find(t => t.id === table)?.check === null,
        onPick: picked => tablePicked(picked.table),
        target: () => document.querySelector(".pick-table-dialog")?.closest(".light-dialog")?.getBoundingClientRect() ?? null,
        startPoint: target.at,
    });
}

watch(pickTableOpen, isOpen =>
{
    if (!isOpen)
        dialogPicking("table", null);
});

function tablePicked(src: string): void
{
    const target = pickTable.value;
    pickTableOpen.value = false;
    if (target === null)
        return;
    if (target.for.kind === "transformation")
        void createTransformation(target.for.transformation, src, target.for.position).catch(ignoreClosed);
    else if (target.for.kind === "check")
        void openCheckDialog({ kind: "new", src, position: target.for.position }, "ALL_ROWS", "true", true).catch(ignoreClosed);
    // Java: editSourceLink's PickTableDialog
    else
        void engine.client.request("setSource", target.for.table, src).then(alertIfAny).catch(ignoreClosed);
}

// Java: TransformationInfo.make with the source table, then TableDisplay.editAfterCreation
async function createTransformation(kind: TransformationKind, src: string, position: CellPosition | null): Promise<void>
{
    const result = await engine.client.request("createTransformation", kind, src, position === null ? null : { column: position.columnIndex, row: position.rowIndex });
    if ("title" in result)
    {
        showAlert(result);
        return;
    }
    // (Once the grid has it)
    const created = await props.findDisplay(result.id);
    if (created === null)
        return;
    if (kind === "calculate")
        await openCalculateColumnDialog(created, null, "TO_SUGGESTED", "transform.calculate.addInitial");
    else
        await openFilterDialog(created.info.id, true, "TO_SUGGESTED", null);
}

// --- A Calculate's columns ---------------------------------------------------------------------------

// Java: EditColumnExpressionDialog for a Calculate's column: adding one (TableDisplay.addColumnBefore_Calc)
// or editing one (TransformationEdits.editColumn_Calc)
interface CalculateColumnFor
{
    readonly table: string;
    readonly column: string | null;
    readonly expression: string | null;
    readonly lookupInfo: ColumnLookupInfo;
    readonly typeManager: TypeManager;
    readonly rename: RenameOnEditKind;
    readonly topMessageKey: string | null;
}
const calculateColumnFor = shallowRef<CalculateColumnFor | null>(null);
const calculateColumnOpen = shallowRef(false);
async function openCalculateColumnDialog(display: GridTableDisplay, column: string | null, rename: RenameOnEditKind, topMessageKey: string | null = null): Promise<void>
{
    const src = display.info.calculate?.src;
    if (src === undefined)
        return;
    const typeManager = markRaw(await copyTypeManager(engine.client));
    const lookupInfo = markRaw(await engine.client.request("columnLookup", display.info.id, src));
    const expression = column === null ? null : (await engine.client.request("calculateColumn", display.info.id, column))?.expression ?? null;
    calculateColumnFor.value = { table: display.info.id, column, expression, lookupInfo, typeManager, rename, topMessageKey };
    calculateColumnOpen.value = true;
}

function calculateColumnChosen(column: string, expression: string): void
{
    const target = calculateColumnFor.value;
    if (target !== null)
        void engine.client.request("setCalculateColumn", target.table, target.column, column, expression, target.rename).then(alertIfAny).catch(ignoreClosed);
}

// Java: the expression editor's fix, Calculate.makeEditor's moveExpressionToNewCalculation
function calculateColumnMoved(editingColumn: string, newColumn: string | null, expression: string): void
{
    const target = calculateColumnFor.value;
    if (target !== null)
        void engine.client.request("moveCalculateColumn", target.table, editingColumn, newColumn, expression).then(alertIfAny).catch(ignoreClosed);
}

// --- A Filter's expression ---------------------------------------------------------------------------

// Java: EditExpressionDialog for a Filter's expression: after it is made (TableDisplay.editAfterCreation,
// with the expression selected, renaming the Filter to its suggested name), or from its hat (TableHat's
// editExpressionLink, renaming it if its old name was automatic)
interface FilterFor
{
    readonly table: string;
    readonly expression: string;
    readonly lookup: ColumnLookupCopy;
    readonly typeManager: TypeManager;
    readonly selectAll: boolean;
    readonly rename: RenameOnEditKind;
    readonly centreOn: Point | null;
}
const filterFor = shallowRef<FilterFor | null>(null);
const filterOpen = shallowRef(false);
async function openFilterDialog(table: string, selectAll: boolean, rename: RenameOnEditKind, centreOn: Point | null): Promise<void>
{
    const details = await engine.client.request("expressionDetails", table);
    if (details?.kind !== "filter")
        return;
    const typeManager = markRaw(await copyTypeManager(engine.client));
    // Java: MultipleTableLookup(filter.getId(), mgr, filter.getSrcTableId(), null)
    const lookup = markRaw(new ColumnLookupCopy(await engine.client.request("columnLookup", table, details.src), typeManager, null));
    filterFor.value = { table, expression: details.expression, lookup, typeManager, selectAll, rename, centreOn };
    filterOpen.value = true;
}

// Java: Filter.makeTypeState
function filterTypeState(): TypeState
{
    return Filter.makeTypeState(filterFor.value!.typeManager);
}

function filterChosen(expression: string): void
{
    const target = filterFor.value;
    if (target !== null)
        void engine.client.request("setFilterExpression", target.table, expression, target.rename).then(alertIfAny).catch(ignoreClosed);
}

// --- A Check ---------------------------------------------------------------------------------------

// Java: EditCheckExpressionDialog, for a new Check of the source table at the position (View.createTable's
// CHECK), or a Check's type and expression from its hat (TableHat's editCheckLink)
type CheckTarget = { readonly kind: "new", readonly src: string, readonly position: CellPosition } | { readonly kind: "edit", readonly table: string };
interface CheckFor
{
    readonly target: CheckTarget;
    readonly checkType: CheckTypeName;
    readonly expression: string;
    readonly lookupInfo: ColumnLookupInfo;
    readonly typeManager: TypeManager;
    readonly selectAll: boolean;
}
const checkFor = shallowRef<CheckFor | null>(null);
const checkOpen = shallowRef(false);
async function openCheckDialog(target: CheckTarget, checkType: CheckTypeName, expression: string, selectAll: boolean): Promise<void>
{
    const typeManager = markRaw(await copyTypeManager(engine.client));
    let src: string;
    if (target.kind === "new")
        src = target.src;
    else
    {
        const details = await engine.client.request("expressionDetails", target.table);
        if (details?.kind !== "check")
            return;
        src = details.src;
    }
    // Java: Check.getColumnLookup(mgr, src, the Check or null, the check type)
    const lookupInfo = markRaw(await engine.client.request("columnLookup", target.kind === "edit" ? target.table : null, src));
    checkFor.value = { target, checkType, expression, lookupInfo, typeManager, selectAll };
    checkOpen.value = true;
}

function checkChosen(checkType: CheckTypeName, expression: string): void
{
    const target = checkFor.value?.target;
    if (target === undefined)
        return;
    if (target.kind === "new")
        void engine.client.request("createCheck", target.src, checkType, expression, target.position.columnIndex, target.position.rowIndex).then(alertIfAny).catch(ignoreClosed);
    else
        void engine.client.request("setCheck", target.table, checkType, expression).then(alertIfAny).catch(ignoreClosed);
}

// --- The hat's links ---------------------------------------------------------------------------------

/** Java: TableHat's Clickables' onClick, for the primary button. */
async function hatLinkClicked(display: GridTableDisplay, link: HatLink, point: Point): Promise<void>
{
    const table = display.info.id;
    // Java: editSourceLink's PickTableDialog, which excludes the table itself
    if (link.kind === "source")
        openPickTable({ at: point, for: { kind: "source", table }, exclude: [table] });
    else if (link.part === "calculateColumn" && link.column !== null)
        await openCalculateColumnDialog(display, link.column, "UNNEEDED");
    else if (link.part === "expression")
    {
        const details = await engine.client.request("expressionDetails", table);
        if (details?.kind === "filter")
            await openFilterDialog(table, false, "IF_OLD_AUTO", null);
        else if (details?.kind === "check")
            await openCheckDialog({ kind: "edit", table }, details.checkType, details.expression, false);
    }
    // PORT-DEFERRED: the other parts' dialogs (Sort, Aggregate, Concatenate, Hide columns, Manual Edit
    // and Join, Phase 11 steps 3 to 5; R, Phase 12)
}

defineExpose({
    newTransformation,
    newCheck,
    transform,
    hatLinkClicked: (display: GridTableDisplay, link: HatLink, point: Point) => void hatLinkClicked(display, link, point).catch(ignoreClosed),
    // Java: TableDisplay.addColumnBefore_Calc (from the add-column arrows and the column menu)
    addCalculateColumn: (display: GridTableDisplay) => void openCalculateColumnDialog(display, null, "IF_OLD_AUTO").catch(ignoreClosed),
    // Java: TransformationEdits.editColumn_Calc (a Calculate's columns' headers)
    editCalculateColumn: (display: GridTableDisplay, column: string) => void openCalculateColumnDialog(display, column, "UNNEEDED").catch(ignoreClosed),
});
</script>

<template>
  <PickTransformationDialog
    v-model:open="pickTransformationOpen"
    :centre-on="pickTransformation?.at ?? null"
    @chosen="transformationChosen"
  />
  <PickTableDialog
    v-model:open="pickTableOpen"
    :tables="engine.tables.tables.value.map(t => t.id)"
    :exclude="pickTable?.exclude ?? []"
    :centre-on="pickTable?.at ?? null"
    @picked="tablePicked"
  />
  <EditColumnExpressionDialog
    v-if="calculateColumnFor !== null"
    :key="calculateColumnFor.table + '/' + calculateColumnFor.column + '/' + String(calculateColumnOpen)"
    v-model:open="calculateColumnOpen"
    :type-manager="calculateColumnFor.typeManager"
    :lookup-info="calculateColumnFor.lookupInfo"
    :initial-name="calculateColumnFor.column"
    :initial-expression="calculateColumnFor.expression"
    :top-message-key="calculateColumnFor.topMessageKey"
    @ok="calculateColumnChosen"
    @move="calculateColumnMoved"
    @picking="mode => dialogPicking('column', mode)"
    @types-changed="emit('typesChanged', calculateColumnFor.typeManager)"
  />
  <EditExpressionDialog
    v-if="filterFor !== null"
    :key="filterFor.table + '/' + String(filterOpen)"
    v-model:open="filterOpen"
    :type-manager="filterFor.typeManager"
    :column-lookup="filterFor.lookup"
    :make-type-state="filterTypeState"
    :expected-type="DataType.BOOLEAN"
    :initial-expression="filterFor.expression"
    :select-all="filterFor.selectAll"
    top-message-key="filter.header"
    :centre-on="filterFor.centreOn"
    @ok="filterChosen"
    @picking="mode => dialogPicking('column', mode)"
    @types-changed="emit('typesChanged', filterFor.typeManager)"
  />
  <EditCheckExpressionDialog
    v-if="checkFor !== null"
    :key="(checkFor.target.kind === 'edit' ? checkFor.target.table : 'new') + '/' + String(checkOpen)"
    v-model:open="checkOpen"
    :type-manager="checkFor.typeManager"
    :lookup-info="checkFor.lookupInfo"
    :initial-check-type="checkFor.checkType"
    :initial-expression="checkFor.expression"
    :select-all="checkFor.selectAll"
    :centre-on="null"
    @ok="checkChosen"
    @picking="mode => dialogPicking('column', mode)"
    @types-changed="emit('typesChanged', checkFor.typeManager)"
  />
</template>
