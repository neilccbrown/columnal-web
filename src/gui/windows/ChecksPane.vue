<script setup lang="ts">
// Java: MainWindow's ChecksLeftPane: the project's Checks, failing then succeeding (each by name), down
// the left of the window; clicking one selects it on the grid.  Checks whose result isn't known (an
// error) aren't listed.  A button at the top right closes it.
import { computed } from "vue";
import type { TableInfo } from "../engine/protocol.js";

const props = defineProps<{
    // The Checks (tables with a check result)
    checks: readonly TableInfo[],
}>();
const emit = defineEmits<{
    close: [],
    select: [id: string],
}>();

// Java: CheckSummaryLabel.getFailingChecks and getPassingChecks, sorted by name
const byName = (passed: boolean): readonly string[] => props.checks.filter(c => c.check?.passed === passed).map(c => c.id).sort();
const failing = computed(() => byName(false));
const passing = computed(() => byName(true));
</script>

<template>
  <div class="checks-pane">
    <div class="checks-list">
      <div class="checks-top-header">
        Checks
      </div>
      <template v-if="failing.length > 0">
        <div class="checks-list-header">
          Failing
        </div>
        <div
          v-for="id in failing"
          :key="id"
          class="checks-list-entry failing"
          @click="emit('select', id)"
        >
          {{ id }}
        </div>
      </template>
      <template v-if="passing.length > 0">
        <div class="checks-list-header">
          Succeeding
        </div>
        <div
          v-for="id in passing"
          :key="id"
          class="checks-list-entry"
          @click="emit('select', id)"
        >
          {{ id }}
        </div>
      </template>
    </div>
    <!-- Java: SmallDeleteButton -->
    <button
      type="button"
      class="checks-pane-close"
      tabindex="-1"
      aria-label="Close"
      @click="emit('close')"
    >
      <svg
        width="16"
        height="16"
        viewBox="-8 -8 16 16"
      ><circle r="8" /><path d="M -4 -4 L 4 4 M 4 -4 L -4 4" /></svg>
    </button>
  </div>
</template>

<style scoped>
.checks-pane {
    position: relative;
    min-width: 150px;
    max-width: 250px;
    overflow-y: auto;
    font-family: var(--font-main);
}
/* mainview.scss: .checks-list */
.checks-list {
    box-sizing: border-box;
    min-height: 100%;
    display: flex;
    flex-direction: column;
    gap: 5px;
    padding: 5px;
    background: var(--status-bar-background);
    border-right: 1px solid var(--status-bar-border);
}
.checks-top-header {
    font-size: 140%;
}
.checks-list-header {
    padding: 10px 0 3px;
}
.checks-list-entry {
    margin-left: 20px;
    padding: 0 5px;
    background: var(--table-header-transformation-background-color);
    color: var(--table-header-text-color);
}
.checks-list-entry.failing {
    background: var(--table-header-background-color-check-failing);
}
.checks-list-entry:hover {
    text-decoration: underline;
    cursor: pointer;
}
.checks-pane-close {
    position: absolute;
    top: 8px;
    right: 8px;
    padding: 0;
    border: none;
    background: none;
    cursor: pointer;
}
.checks-pane-close circle {
    fill: rgb(204 204 204);
}
.checks-pane-close:hover circle {
    fill: rgb(204 51 51);
}
.checks-pane-close path {
    stroke: white;
    stroke-width: 2;
}
</style>
