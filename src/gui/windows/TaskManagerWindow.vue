<script setup lang="ts">
// Java: TaskManagerWindow (app): the engine's tasks (Workers.getTaskList), running then waiting, with
// their names and priorities, refreshed every 3 seconds while it shows.  Not modal, as Java's.
// PORT-NOTE: Java's was a singleton window, its list a TableView; here MainWindow shows the one dialog.
import { onBeforeUnmount, shallowRef, watch } from "vue";
import LightDialog from "../components/dialogs/LightDialog.vue";
import { ignoreClosed } from "../engine/EngineClient.js";
import type { TaskInfo } from "../engine/protocol.js";
import { useEngine } from "../engine/useEngine.js";
import { t } from "../i18n.js";

const open = defineModel<boolean>("open", { required: true });
const engine = useEngine();
const tasks = shallowRef<readonly TaskInfo[]>([]);
let timer: ReturnType<typeof setInterval> | null = null;

async function refresh(): Promise<void>
{
    tasks.value = await engine.client.request("tasks");
}

function stop(): void
{
    if (timer !== null)
        clearInterval(timer);
    timer = null;
}

// Java: the Timeline, played while shown
watch(open, shown =>
{
    stop();
    if (shown)
    {
        void refresh().catch(ignoreClosed);
        timer = setInterval(() => void refresh().catch(ignoreClosed), 3000);
    }
}, { immediate: true });
onBeforeUnmount(stop);
</script>

<template>
  <LightDialog
    v-model:open="open"
    :label="t('menu.view.tasks').replace('_', '')"
    :buttons="['ok']"
    :modal="false"
  >
    <div class="task-list">
      <table>
        <thead>
          <tr>
            <th>Task Name</th>
            <th>Priority</th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="(task, i) in tasks"
            :key="i"
          >
            <td>{{ task.name }}</td>
            <td>{{ task.priority }}</td>
          </tr>
          <tr v-if="tasks.length === 0">
            <td
              colspan="2"
              class="task-list-empty"
            >
              No content in table
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </LightDialog>
</template>

<style scoped>
.task-list {
    width: 400px;
    height: 300px;
    overflow: auto;
    border: 1px solid var(--control-border);
    background: var(--list-background);
}
table {
    width: 100%;
    border-collapse: collapse;
}
th, td {
    text-align: left;
    padding: 2px 6px;
    border-bottom: 1px solid var(--control-border);
}
th {
    position: sticky;
    top: 0;
    background: var(--control-background);
}
.task-list-empty {
    text-align: center;
    color: var(--text-color-faint);
    border-bottom: none;
    padding-top: 2em;
}
</style>
