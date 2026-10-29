<script setup lang="ts">
// The app's root: starts the engine (in its worker, unless a test passes another transport) and
// shows the main window.
import { OverallVersion } from "../engine/parsers/grammar/Versions.js";
import { provideEngine } from "./engine/useEngine.js";
import { WorkerTransport, type EngineTransport } from "./engine/transports.js";

const props = defineProps<{
    // For tests: InPageTransport, to read the engine's objects directly.
    transport?: EngineTransport,
}>();

provideEngine(props.transport ?? new WorkerTransport());

// Placeholder content until the main window (Phase 9):
const fileFormatVersion = OverallVersion.asNumber(OverallVersion.latest());
</script>

<template>
  <main class="app">
    <h1>Columnal</h1>
    <p>The web port is in progress. See <code>docs/PLAN.md</code>.</p>
    <p>File format version {{ fileFormatVersion }}</p>
  </main>
</template>

<style scoped>
.app {
    padding: 0 16px;
}
</style>
