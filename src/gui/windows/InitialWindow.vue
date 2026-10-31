<script setup lang="ts">
// The window shown before a project is open (Java: InitialWindow): make a new project, or open one,
// including from the recent ones (docs/gui-spec/projects.md).
import columnalImage from "@resources/gui/images/columnal.png";
import logoImage from "@resources/gui/images/logo.png";
import { computed, shallowRef } from "vue";
import AboutDialog from "../components/dialogs/AboutDialog.vue";
import MenuBar from "../components/menus/MenuBar.vue";
import { makeId, menu, menuItem } from "../components/menus/menus.js";
import { t } from "../i18n.js";
import { useAppContext } from "../project/appContext.js";
import type { ProjectSummary } from "../project/ProjectStore.js";
import OpenProjectDialog from "./OpenProjectDialog.vue";
import { recentProjectItems } from "./recentMenu.js";

const context = useAppContext();
const recent = shallowRef<readonly ProjectSummary[]>([]);
void context.store.recent().then(r => { recent.value = r; });
const selectedRecent = shallowRef<string | null>(null);
const opening = shallowRef(false);
const about = shallowRef(false);
document.title = t("us");

// Java: InitialWindow.newProject, then hiding this window
async function newProject(): Promise<void>
{
    context.showProject(await context.store.createUntitled());
}

// Java: InitialWindow.openProject
async function openProject(id: string): Promise<void>
{
    await context.store.usedProject(id);
    context.showProject(id);
}

// (Java's Exit is left out: closing the tab does it)
const menus = computed(() => [
    menu("menu.project",
        menuItem("menu.project.new", () => void newProject()),
        menuItem("menu.project.open", () => { opening.value = true; }),
        menu("menu.project.open.recent", ...recentProjectItems(recent.value, id => void openProject(id)))),
    menu("menu.help",
        menuItem("menu.help.about", () => { about.value = true; })),
]);

function recentKeydown(e: KeyboardEvent): void
{
    const index = recent.value.findIndex(p => p.id === selectedRecent.value);
    if ((e.key === "Enter" || e.key === " ") && selectedRecent.value !== null)
    {
        e.preventDefault();
        void openProject(selectedRecent.value);
    }
    else if (e.key === "ArrowDown" || e.key === "ArrowUp")
    {
        e.preventDefault();
        const next = recent.value[Math.max(0, Math.min(recent.value.length - 1, index + (e.key === "ArrowDown" ? 1 : -1)))];
        if (next !== undefined)
            selectedRecent.value = next.id;
    }
}
</script>

<template>
  <div class="initial-window">
    <MenuBar :menus="menus" />
    <div class="initial-content">
      <div class="logo-container">
        <img
          :src="columnalImage"
          alt="Columnal"
          class="title-image"
        >
        <img
          :src="logoImage"
          alt=""
          class="logo-image"
        >
      </div>
      <div class="body-container">
        <section class="initial-section-new">
          <h2 class="initial-heading">
            {{ t("initial.new.title") }}
          </h2>
          <div class="indented">
            <button
              type="button"
              :class="makeId('initial.new')"
              @click="newProject"
            >
              {{ t("initial.new") }}
            </button>
          </div>
          <p class="indented">
            {{ t("initial.new.detail") }}
          </p>
        </section>
        <section class="initial-section-open">
          <h2 class="initial-heading">
            {{ t("initial.open.title") }}
          </h2>
          <div class="indented">
            <button
              type="button"
              :class="makeId('initial.open')"
              @click="opening = true"
            >
              {{ t("initial.open") }}
            </button>
          </div>
          <div class="initial-recent indented">
            <h3 class="initial-subheading">
              {{ t("initial.open.recent") }}
            </h3>
            <div
              class="recent-list"
              role="listbox"
              tabindex="0"
              :aria-label="t('initial.open.recent')"
              @keydown="recentKeydown"
            >
              <div
                v-for="p in recent"
                :key="p.id"
                class="recent-item"
                :class="{ selected: p.id === selectedRecent }"
                role="option"
                :aria-selected="p.id === selectedRecent"
                @click="selectedRecent = p.id"
                @dblclick="openProject(p.id)"
              >
                {{ p.name }}
              </div>
            </div>
          </div>
        </section>
      </div>
    </div>
    <OpenProjectDialog
      v-model:open="opening"
      @chosen="openProject"
    />
    <AboutDialog v-model:open="about" />
  </div>
</template>

<style scoped>
/* initial.scss */
.initial-window {
    display: flex;
    flex-direction: column;
    height: 100vh;
    background: var(--control-background);
    font-family: var(--font-main);
}
.initial-content {
    flex: 1;
    overflow: auto;
}
.logo-container {
    display: flex;
    align-items: flex-end;
    justify-content: center;
    gap: 2.5em;
    padding: 1em 2.5em;
    background: var(--logo-background);
    border-bottom: 1px solid var(--logo-border);
}
.title-image {
    height: 90px;
}
.logo-image {
    height: 100px;
}
.body-container {
    display: flex;
    flex-direction: column;
    gap: 1em;
    padding: 1em 1.5em 1.5em 1em;
}
section {
    display: flex;
    flex-direction: column;
    gap: 1em;
}
.initial-heading {
    margin: 0;
    color: var(--initial-heading-color);
    font-size: 200%;
    font-weight: normal;
}
.initial-subheading {
    margin: 0;
    color: var(--initial-heading-color);
    font-size: 140%;
    font-weight: normal;
}
.indented {
    margin: 0 0 0 30px;
}
.initial-recent {
    display: flex;
    flex-direction: column;
    gap: 0.3em;
}
.recent-list {
    height: 200px;
    overflow-y: auto;
    border: 1px solid var(--control-border);
    background: var(--list-background, white);
}
.recent-list:focus {
    outline: 1px solid var(--focus-color);
}
.recent-item {
    padding: 2px 4px;
    cursor: default;
}
.recent-item.selected {
    background: var(--list-selection-focused);
    color: var(--list-selection-text);
}
</style>
