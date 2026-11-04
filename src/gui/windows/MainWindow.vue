<script setup lang="ts">
// A project's window (Java: MainWindow, with View's file handling in ProjectSession): its menu bar,
// the grid of its tables, and a banner while loading or read-only (docs/gui-spec/projects.md).
import { computed, markRaw, onBeforeUnmount, onMounted, shallowRef, useTemplateRef, watch } from "vue";
import type { VirtualGrid } from "../../gui-logic/stf/gui/grid/VirtualGrid.js";
import { showAlert } from "../alerts.js";
import AboutDialog from "../components/dialogs/AboutDialog.vue";
import MenuBar from "../components/menus/MenuBar.vue";
import { menu, menuItem, separator, type MenuItem } from "../components/menus/menus.js";
import type { CellPosition } from "../../engine/data/data/CellPosition.js";
import NewTableDialog, { type DataOrTransform } from "../components/dialogs/NewTableDialog.vue";
import type { TypeManager } from "../../engine/types/data/datatype/TypeManager.js";
import type { ColumnLookupInfo, EngineAlert, ExporterInfo, RenameOnEditKind } from "../engine/protocol.js";
import { download } from "../download.js";
import { ignoreClosed } from "../engine/EngineClient.js";
import { provideEngine } from "../engine/useEngine.js";
import type { GridTableDisplay } from "../grid/GridTableDisplay.js";
import { provideTableActions } from "../grid/tableActions.js";
import { copyTypeManager, typeInfoOf } from "../project/typeCopy.js";
import TypesDialog from "./types/TypesDialog.vue";
import UnitsDialog from "./types/UnitsDialog.vue";
import EditImmediateColumnDialog, { type ColumnDetails } from "./EditImmediateColumnDialog.vue";
import EditColumnExpressionDialog from "./EditColumnExpressionDialog.vue";
import PickTableDialog from "./PickTableDialog.vue";
import PickTransformationDialog from "./PickTransformationDialog.vue";
import type { PickingMode } from "../grid/picking.js";
import ExportDialog from "./ExportDialog.vue";
import GotoRowDialog from "./GotoRowDialog.vue";
import EngineGrid from "../grid/EngineGrid.vue";
import { label, t } from "../i18n.js";
import { useAppContext } from "../project/appContext.js";
import { ProjectSession } from "../project/ProjectSession.js";
import type { ProjectSummary } from "../project/ProjectStore.js";
import OpenProjectDialog from "./OpenProjectDialog.vue";
import { recentProjectItems } from "./recentMenu.js";
import SaveAsDialog from "./SaveAsDialog.vue";

const props = defineProps<{ projectId: string }>();

const context = useAppContext();
const engine = provideEngine(context.makeTransport());
const engineGrid = useTemplateRef<InstanceType<typeof EngineGrid>>("engineGrid");
const session = shallowRef<ProjectSession | null>(null);
const recent = shallowRef<readonly ProjectSummary[]>([]);
const opening = shallowRef(false);
const savingAs = shallowRef(false);
const about = shallowRef(false);
// When a menu was last opened, for the Save item's "saved Ns ago" (Java: SaveMenuItem re-evaluates it
// when its menu shows):
const menuShownAt = shallowRef(Date.now());

// Java: View's VirtualGridManager
let cancelSave: ReturnType<typeof setTimeout> | null = null;
const manager: VirtualGrid.VirtualGridManager = markRaw({
    createTable: (position, point) => createTable(position, point as { x: number, y: number }),
    // PORT-DEFERRED: pasting into an empty cell, which makes a table of the clipboard's values (Phase 11,
    // with importing)
    pasteIntoEmpty: () => {},
    notifyColumnSizeChanged: () =>
    {
        // Save after five seconds of no resizing:
        if (cancelSave !== null)
            clearTimeout(cancelSave);
        cancelSave = setTimeout(() =>
        {
            cancelSave = null;
            session.value?.modified();
        }, 5000);
    },
});

const stopListening = engine.client.listen(event =>
{
    if (event.kind === "modified")
        session.value?.modified();
    else if (event.kind === "alert")
        showAlert(event.alert);
});

// Java: View.createTable: what to make, at the empty cell
const newTable = shallowRef<{ position: CellPosition, point: { x: number, y: number } } | null>(null);
const newTableOpen = shallowRef(false);
function createTable(position: CellPosition, point: { x: number, y: number }): void
{
    newTable.value = { position, point };
    newTableOpen.value = true;
}

// The column dialog: for a new table at a position, a new column in a table (before a column), or
// editing a column (focusing its name or type)
type ColumnFor =
    | { kind: "table", position: CellPosition, point: { x: number, y: number } }
    | { kind: "column", display: GridTableDisplay, beforeColumn: string | null }
    | { kind: "edit", display: GridTableDisplay, column: string, type: string, defaultValue: string | null, focus: "name" | "type" };
const columnFor = shallowRef<ColumnFor | null>(null);
const columnTypeManager = shallowRef<TypeManager | null>(null);
const columnOpen = shallowRef(false);
async function openColumnDialog(target: ColumnFor): Promise<void>
{
    try
    {
        columnTypeManager.value = markRaw(await copyTypeManager(engine.client));
    }
    catch (e)
    {
        ignoreClosed(e);
        // (The project's types couldn't be read: as Java's alertOnError)
        showAlert({ title: t(target.kind === "table" ? "error.creating.first.column" : target.kind === "column" ? "error.adding.column" : "error.saving.column"), message: e instanceof Error ? e.message : String(e) });
        return;
    }
    columnFor.value = target;
    columnOpen.value = true;
}

function newTableChosen(choice: DataOrTransform, point: { x: number, y: number }): void
{
    const target = newTable.value;
    // Java: View.createTable's TRANSFORM: which transformation, then its source table
    if (target !== null && choice === "TRANSFORM")
    {
        pickTransformationAt.value = point;
        pickTransformationOpen.value = true;
    }
    else if (target !== null && choice === "DATA")
        void openColumnDialog({ kind: "table", position: target.position, point });
    // Java: View.createTable's COMMENT, a new comment there
    else if (target !== null && choice === "COMMENT")
        void engine.client.request("addComment", target.position.columnIndex, target.position.rowIndex).catch(ignoreClosed);
}

function columnChosen(details: ColumnDetails): void
{
    const target = columnFor.value;
    if (target === null)
        return;
    const column = { columnName: details.columnName, type: details.type, defaultValue: details.defaultValue };
    const done = (alert: EngineAlert | null): void =>
    {
        if (alert !== null)
            showAlert(alert);
    };
    if (target.kind === "table")
        void engine.client.request("createDataTable", details.tableName ?? "", column, target.position.columnIndex, target.position.rowIndex).then(done).catch(ignoreClosed);
    else if (target.kind === "column")
        void engine.client.request("addColumn", target.display.info.id, target.display.info.version, target.beforeColumn, column).then(done).catch(ignoreClosed);
    else
        void engine.client.request("editColumn", target.display.info.id, target.display.info.version, target.column, column).then(done).catch(ignoreClosed);
}

// The grid's picking mode, while a dialog picks a table or column from it
const picking = shallowRef<PickingMode | null>(null);

// Java: PickTransformationDialog, then PickTableDialog (for the transformation's source table)
const pickTransformationAt = shallowRef<{ x: number, y: number } | null>(null);
const pickTransformationOpen = shallowRef(false);
const pickTableAt = shallowRef<{ x: number, y: number } | null>(null);
const pickTableOpen = shallowRef(false);
function transformationChosen(name: string, point: { x: number, y: number }): void
{
    if (name !== "calculate")
        return;
    pickTableAt.value = point;
    pickTableOpen.value = true;
    // Java: View.enableTablePickingMode, while the dialog shows (from where the transformation was chosen)
    picking.value = markRaw<PickingMode>({
        kind: "table",
        include: () => true,
        onPick: picked => void tablePicked(picked.table).catch(ignoreClosed),
        target: () => document.querySelector(".pick-table-dialog")?.closest(".light-dialog")?.getBoundingClientRect() ?? null,
        startPoint: point,
    });
}

watch(pickTableOpen, isOpen =>
{
    if (!isOpen && picking.value?.kind === "table")
        picking.value = null;
});

// Java: TransformationInfo.make with the picked table, then TableDisplay.editAfterCreation
async function tablePicked(src: string): Promise<void>
{
    const target = newTable.value;
    pickTableOpen.value = false;
    if (target === null)
        return;
    const result = await engine.client.request("createTransformation", "calculate", src, target.position.columnIndex, target.position.rowIndex);
    if ("title" in result)
    {
        showAlert(result);
        return;
    }
    // (Once the grid has it)
    const created = await waitForTable(result.id);
    if (created !== null)
        await openCalculateColumnDialog(created, null, "TO_SUGGESTED", "transform.calculate.addInitial");
}

function waitForTable(id: string): Promise<GridTableDisplay | null>
{
    return new Promise(resolve =>
    {
        // (The grid's displays, which it makes once the engine's tables have changed)
        const find = (): GridTableDisplay | null => engineGrid.value?.displays().find(d => d.info.id === id) ?? null;
        const found = find();
        if (found !== null)
        {
            resolve(found);
            return;
        }
        const stop = watch(find, d =>
        {
            if (d !== null)
            {
                stop();
                resolve(d);
            }
        });
    });
}

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

watch(calculateColumnOpen, isOpen =>
{
    if (!isOpen && picking.value?.kind === "column")
        picking.value = null;
});

function calculateColumnChosen(column: string, expression: string): void
{
    const target = calculateColumnFor.value;
    if (target === null)
        return;
    void engine.client.request("setCalculateColumn", target.table, target.column, column, expression, target.rename).then(alert =>
    {
        if (alert !== null)
            showAlert(alert);
    }).catch(ignoreClosed);
}

// Java: the expression editor's fix, Calculate.makeEditor's moveExpressionToNewCalculation
function calculateColumnMoved(editingColumn: string, newColumn: string | null, expression: string): void
{
    const target = calculateColumnFor.value;
    if (target === null)
        return;
    void engine.client.request("moveCalculateColumn", target.table, editingColumn, newColumn, expression).then(alert =>
    {
        if (alert !== null)
            showAlert(alert);
    }).catch(ignoreClosed);
}

// Java: TransformationEdits.editColumn_IDS: the column dialog for the column
async function editColumn(display: GridTableDisplay, column: string, focus: "name" | "type"): Promise<void>
{
    // Java: a Calculate's columns' primary edit operation, editColumn_Calc
    if (display.info.calculate !== null)
    {
        await openCalculateColumnDialog(display, column, "UNNEEDED");
        return;
    }
    const details = await engine.client.request("columnDetails", display.info.id, display.info.version, column);
    if (details !== null)
        await openColumnDialog({ kind: "edit", display, column, type: details.type, defaultValue: details.defaultValue, focus });
}

// Java: DataDisplay.gotoRow's GotoRowDialog
const gotoRowFor = shallowRef<{ display: GridTableDisplay, column: number } | null>(null);
const gotoRowOpen = shallowRef(false);

// Java: ExporterManager.chooseAndExportFile: the exporter, then the file (here, downloaded)
const exportFor = shallowRef<GridTableDisplay | null>(null);
const exporters = shallowRef<readonly ExporterInfo[]>([]);
const exportOpen = shallowRef(false);
async function exportTable(display: GridTableDisplay): Promise<void>
{
    exporters.value = await engine.client.request("exporters");
    exportFor.value = display;
    exportOpen.value = true;
}

async function exporterChosen(exporter: number): Promise<void>
{
    const display = exportFor.value;
    const info = exporters.value[exporter];
    if (display === null || info === undefined)
        return;
    const result = await engine.client.request("exportTable", display.info.id, exporter);
    if ("alert" in result)
        showAlert(result.alert);
    else
        download(display.info.id + "." + (info.fileTypes[0] ?? "*.dat").replace(/^\*\./, ""), result.data as Uint8Array<ArrayBuffer>, "application/octet-stream");
}

// Java: View ▸ Types... and Units...: the dialogs change a copy of the project's types and units, which
// goes to the engine when they close (Java: they changed the project's, then View.modified)
const typesManager = shallowRef<TypeManager | null>(null);
const typesOpen = shallowRef<"types" | "units" | null>(null);
async function openTypesDialog(which: "types" | "units"): Promise<void>
{
    typesManager.value = markRaw(await copyTypeManager(engine.client));
    typesOpen.value = which;
}

function typesDialogClosed(): void
{
    const tm = typesManager.value;
    typesOpen.value = null;
    if (tm !== null)
        sendTypeInfo(tm);
}

// Gives the engine a copy's declared types and units (after the Types and Units dialogs, or a fix
// in an editor which declared one)
function sendTypeInfo(tm: TypeManager): void
{
    void engine.client.request("setTypeInfo", typeInfoOf(tm)).then(alert =>
    {
        if (alert !== null)
            showAlert(alert);
    }).catch(ignoreClosed);
}

provideTableActions({
    // (Java: TableDisplay.addColumnOperation: a Calculate's is addColumnBefore_Calc)
    addColumn: (display, beforeColumn) => void (display.info.calculate !== null ? openCalculateColumnDialog(display, null, "IF_OLD_AUTO").catch(ignoreClosed) : openColumnDialog({ kind: "column", display, beforeColumn })),
    editColumn: (display, column, focus) => void editColumn(display, column, focus).catch(ignoreClosed),
    gotoRow: (display, column) =>
    {
        gotoRowFor.value = { display, column };
        gotoRowOpen.value = true;
    },
    exportTable: display => void exportTable(display).catch(ignoreClosed),
});

onMounted(async () =>
{
    const s = markRaw(new ProjectSession(context.store, props.projectId, engine.client, engineGrid.value!.grid, (title, message) => showAlert({ title, message })));
    session.value = s;
    if (!await s.load())
    {
        showAlert({ title: t("error.readingfile"), message: t("project.notFound", props.projectId) });
        context.showInitial();
    }
});

onBeforeUnmount(() =>
{
    stopListening();
    if (cancelSave !== null)
        clearTimeout(cancelSave);
    void session.value?.close();
});

// Java: View.addTitleListenerAndCallNow (the file's name and directory)
watch(() => session.value?.name.value, name =>
{
    if (name !== undefined && name !== "")
        document.title = name;
});

async function refreshRecent(): Promise<void>
{
    recent.value = await context.store.recent();
}
void refreshRecent();

// Java: InitialWindow.newProject and openProject from a MainWindow, which open another window
async function newProject(): Promise<void>
{
    context.openProjectInNewTab(await context.store.createUntitled());
}

async function openProject(id: string): Promise<void>
{
    await context.store.usedProject(id);
    void refreshRecent();
    context.openProjectInNewTab(id);
}

async function saveAs(name: string): Promise<void>
{
    const s = session.value;
    if (s === null)
        return;
    context.setProjectInUrl(await s.saveAs(name));
    void refreshRecent();
}

async function close(): Promise<void>
{
    await session.value?.close();
    context.showInitial();
}

// Java: SaveMenuItem
function saveItem(): MenuItem
{
    const lastSave = session.value?.lastSaveTime.value;
    const text = lastSave === null
        ? t("menu.project.modified")
        : t("menu.project.save", String(Math.floor((menuShownAt.value - (lastSave ?? new Date()).getTime()) / 1000)));
    return { ...menuItem("menu.project.save", () => void session.value?.save(true)), label: { ...label("menu.project.save"), text } };
}

// (Java's Exit is left out: closing the tab does it.)
// PORT-DEFERRED: Edit's Settings (Phase 12, with R), and the View menu's Task Manager and checks pane
// (Phase 11).  (Java's Find is commented out.)
const menus = computed(() => [
    menu("menu.project",
        menuItem("menu.project.new", () => void newProject()),
        menuItem("menu.project.open", () => { opening.value = true; }),
        menu("menu.project.open.recent", ...recentProjectItems(recent.value, id => void openProject(id))),
        saveItem(),
        menuItem("menu.project.saveAs", () => { savingAs.value = true; }),
        menuItem("menu.project.saveCopy", () => void session.value?.saveCopy()),
        menuItem("menu.project.close", () => void close())),
    menu("menu.edit",
        menuItem("menu.edit.undo", () => void session.value?.undo())),
    menu("menu.view",
        // Java: View.gotoRowDialog, the selection's gotoRow
        menuItem("menu.view.goto.row", () => engineGrid.value?.grid.gotoRow(null)),
        separator(),
        menuItem("menu.view.types", () => void openTypesDialog("types").catch(ignoreClosed)),
        menuItem("menu.view.units", () => void openTypesDialog("units").catch(ignoreClosed))),
    menu("menu.help",
        menuItem("menu.help.about", () => { about.value = true; })),
]);

const bannerText = computed(() =>
{
    switch (session.value === null ? "loading" : session.value.banner.value)
    {
        case "loading": return t("banner.loading");
        case "readOnly": return t("banner.readOnly");
        case "openElsewhere": return t("banner.openElsewhere");
        default: return null;
    }
});

defineExpose({
    session: () => session.value,
    grid: () => engineGrid.value,
    engine,
});
</script>

<template>
  <div class="main-window">
    <MenuBar
      :menus="menus"
      @opened="menuShownAt = Date.now()"
    />
    <div class="main-view">
      <EngineGrid
        ref="engineGrid"
        class="main-grid"
        :manager="manager"
        :picking="picking"
      />
      <div
        v-if="bannerText !== null"
        class="banner-message"
        :class="{ error: session?.banner.value === 'readOnly' || session?.banner.value === 'openElsewhere' }"
      >
        {{ bannerText }}
      </div>
    </div>
    <OpenProjectDialog
      v-model:open="opening"
      @chosen="openProject"
    />
    <SaveAsDialog
      v-model:open="savingAs"
      :current-name="session?.name.value ?? ''"
      @chosen="saveAs"
    />
    <AboutDialog v-model:open="about" />
    <NewTableDialog
      v-model:open="newTableOpen"
      :centre-on="newTable?.point ?? null"
      :transform-is-valid="engine.tables.tables.value.length > 0"
      @chosen="newTableChosen"
    />
    <PickTransformationDialog
      v-model:open="pickTransformationOpen"
      :centre-on="pickTransformationAt"
      @chosen="transformationChosen"
    />
    <PickTableDialog
      v-model:open="pickTableOpen"
      :tables="engine.tables.tables.value.map(t => t.id)"
      :exclude="[]"
      :centre-on="pickTableAt"
      @picked="table => void tablePicked(table).catch(ignoreClosed)"
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
      @picking="mode => picking = mode"
      @types-changed="sendTypeInfo(calculateColumnFor.typeManager)"
    />
    <EditImmediateColumnDialog
      v-if="columnTypeManager !== null"
      v-model:open="columnOpen"
      :type-manager="columnTypeManager"
      :table-ids="columnFor?.kind === 'table' ? engine.tables.tables.value.map(t => t.id) : null"
      :centre-on="columnFor?.kind === 'table' ? columnFor.point : null"
      :initial-column="columnFor?.kind === 'edit' ? { name: columnFor.column, type: columnFor.type, defaultValue: columnFor.defaultValue } : null"
      :initial-focus="columnFor?.kind === 'edit' ? columnFor.focus : 'name'"
      @ok="columnChosen"
      @types-changed="sendTypeInfo(columnTypeManager)"
    />
    <TypesDialog
      v-if="typesManager !== null"
      :open="typesOpen === 'types'"
      :type-manager="typesManager"
      @update:open="o => { if (!o) typesDialogClosed(); }"
    />
    <UnitsDialog
      v-if="typesManager !== null"
      :open="typesOpen === 'units'"
      :type-manager="typesManager"
      @update:open="o => { if (!o) typesDialogClosed(); }"
    />
    <GotoRowDialog
      v-model:open="gotoRowOpen"
      :rows="gotoRowFor?.display.currentKnownRows ?? 0"
      @chosen="row => gotoRowFor?.display.selectRow(row, gotoRowFor.column)"
    />
    <ExportDialog
      v-model:open="exportOpen"
      :exporters="exporters"
      @chosen="e => void exporterChosen(e).catch(ignoreClosed)"
    />
  </div>
</template>

<style scoped>
.main-window {
    display: flex;
    flex-direction: column;
    height: 100vh;
}
.main-view {
    position: relative;
    flex: 1;
    min-height: 0;
}
.main-grid {
    width: 100%;
    height: 100%;
}
/* mainview.scss: .banner-message */
.banner-message {
    position: absolute;
    top: 0;
    left: 50%;
    transform: translateX(-50%);
    padding: 6px 10px;
    background: beige;
    color: black;
    font-family: var(--font-main);
    z-index: 10;
}
.banner-message.error {
    background: darkred;
    color: white;
}
</style>
