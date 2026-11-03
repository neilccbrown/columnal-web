<script setup lang="ts">
// A project's window (Java: MainWindow, with View's file handling in ProjectSession): its menu bar,
// the grid of its tables, and a banner while loading or read-only (docs/gui-spec/projects.md).
import { computed, markRaw, onBeforeUnmount, onMounted, shallowRef, useTemplateRef, watch } from "vue";
import type { VirtualGrid } from "../../gui-logic/stf/gui/grid/VirtualGrid.js";
import { showAlert } from "../alerts.js";
import AboutDialog from "../components/dialogs/AboutDialog.vue";
import MenuBar from "../components/menus/MenuBar.vue";
import { menu, menuItem, type MenuItem } from "../components/menus/menus.js";
import type { CellPosition } from "../../engine/data/data/CellPosition.js";
import NewTableDialog, { type DataOrTransform } from "../components/dialogs/NewTableDialog.vue";
import type { TypeManager } from "../../engine/types/data/datatype/TypeManager.js";
import type { EngineAlert } from "../engine/protocol.js";
import { ignoreClosed } from "../engine/EngineClient.js";
import { provideEngine } from "../engine/useEngine.js";
import type { GridTableDisplay } from "../grid/GridTableDisplay.js";
import { provideTableActions } from "../grid/tableActions.js";
import { copyTypeManager } from "../project/typeCopy.js";
import EditImmediateColumnDialog, { type ColumnDetails } from "./EditImmediateColumnDialog.vue";
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

// The column dialog: for a new table at a position, or a new column in a table (before a column)
type ColumnFor = { kind: "table", position: CellPosition, point: { x: number, y: number } } | { kind: "column", display: GridTableDisplay, beforeColumn: string | null };
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
        showAlert({ title: t(target.kind === "table" ? "error.creating.first.column" : "error.adding.column"), message: e instanceof Error ? e.message : String(e) });
        return;
    }
    columnFor.value = target;
    columnOpen.value = true;
}

function newTableChosen(choice: DataOrTransform, point: { x: number, y: number }): void
{
    const target = newTable.value;
    if (target !== null && choice === "DATA")
        void openColumnDialog({ kind: "table", position: target.position, point });
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
    else
        void engine.client.request("addColumn", target.display.info.id, target.display.info.version, target.beforeColumn, column).then(done).catch(ignoreClosed);
}

provideTableActions({
    addColumn: (display, beforeColumn) => void openColumnDialog({ kind: "column", display, beforeColumn }),
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
// PORT-DEFERRED: Edit's Settings (Phase 12, with R), and the View menu: Goto row (Phase 9 step 5),
// Types and Units (step 6), the Task Manager and the checks pane (Phase 11)
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
    <EditImmediateColumnDialog
      v-if="columnTypeManager !== null"
      v-model:open="columnOpen"
      :type-manager="columnTypeManager"
      :table-ids="columnFor?.kind === 'table' ? engine.tables.tables.value.map(t => t.id) : null"
      :centre-on="columnFor?.kind === 'table' ? columnFor.point : null"
      @ok="columnChosen"
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
