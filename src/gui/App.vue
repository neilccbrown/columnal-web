<script setup lang="ts">
import { OverallVersion } from "../engine/parsers/grammar/Versions.js";

// Placeholder shell until the GUI phases; shows that engine code is wired into the build.
const fileFormatVersion = OverallVersion.asNumber(OverallVersion.latest());
</script>

<template>
  <main>
    <h1>Columnal</h1>
    <p>The web port is in progress. See <code>docs/PLAN.md</code>.</p>
    <p>File format version {{ fileFormatVersion }}</p>
  </main>
</template>
