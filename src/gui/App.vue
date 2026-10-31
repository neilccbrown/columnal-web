<script setup lang="ts">
// The app's root: the tab shows the initial window, or a project (whose id is in the URL's fragment,
// so reloading the tab opens it again), with the alerts.  (docs/gui-spec/projects.md)
import { onBeforeUnmount, shallowRef } from "vue";
import AlertHost from "./components/dialogs/AlertHost.vue";
import { WorkerTransport, type EngineTransport } from "./engine/transports.js";
import { projectHash, projectInHash, provideAppContext } from "./project/appContext.js";
import { ProjectStore } from "./project/ProjectStore.js";
import InitialWindow from "./windows/InitialWindow.vue";
import MainWindow from "./windows/MainWindow.vue";

const props = defineProps<{
    // For tests: each project's engine (InPageTransport, to read the engine's objects directly)
    makeTransport?: () => EngineTransport,
    // For tests: the project storage's name, and opening a project in another tab
    storeName?: string,
    openInNewTab?: (id: string) => void,
}>();

const store = shallowRef<ProjectStore | null>(null);
void ProjectStore.open(props.storeName).then(s => { store.value = s; });
onBeforeUnmount(() => store.value?.close());

// The project this tab shows, if any:
const project = shallowRef<string | null>(projectInHash(location.hash));
const hashChanged = (): void => { project.value = projectInHash(location.hash); };
window.addEventListener("hashchange", hashChanged);
onBeforeUnmount(() => window.removeEventListener("hashchange", hashChanged));

provideAppContext({
    get store(): ProjectStore
    {
        return store.value!;
    },
    makeTransport: () => props.makeTransport?.() ?? new WorkerTransport(),
    showProject: id =>
    {
        location.hash = projectHash(id);
        hashChanged();
    },
    openProjectInNewTab: id =>
    {
        if (props.openInNewTab !== undefined)
            props.openInNewTab(id);
        else
            window.open(location.pathname + location.search + projectHash(id), "_blank");
    },
    showInitial: () =>
    {
        history.pushState(null, "", location.pathname + location.search);
        hashChanged();
    },
    setProjectInUrl: id => history.replaceState(null, "", projectHash(id)),
});
</script>

<template>
  <template v-if="store !== null">
    <InitialWindow v-if="project === null" />
    <MainWindow
      v-else
      :key="project"
      :project-id="project"
    />
  </template>
  <AlertHost />
</template>
