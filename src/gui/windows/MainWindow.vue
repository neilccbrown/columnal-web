<script setup lang="ts">
// A project's window (Java: MainWindow, with View's file handling in ProjectSession): its menu bar,
// the grid of its tables, and a banner while loading or read-only (docs/gui-spec/projects.md).
import { computed, markRaw, onBeforeUnmount, onMounted, shallowRef, useTemplateRef, watch } from "vue";
import type { VirtualGrid } from "../../gui-logic/stf/gui/grid/VirtualGrid.js";
import { showAlert } from "../alerts.js";
import AboutDialog from "../components/dialogs/AboutDialog.vue";
import MenuBar from "../components/menus/MenuBar.vue";
import { menu, menuItem, type MenuItem } from "../components/menus/menus.js";
import { provideEngine } from "../engine/useEngine.js";
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
    // PORT-DEFERRED: making a table in an empty cell, and pasting into one (Phase 9 step 4)
    createTable: () => {},
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
