<script setup lang="ts">
// Shows the alerts (src/gui/alerts.ts) one at a time (Java: FXUtility.showError's Alert): the title,
// then the message, and OK (or for a question, Yes and Cancel).  The app shows one of these.
import { alerts, closeAlert } from "../../alerts.js";
import LightDialog from "./LightDialog.vue";
</script>

<template>
  <LightDialog
    :open="alerts.length > 0"
    :label="alerts[0]?.title ?? ''"
    :buttons="alerts[0]?.onYes ? ['yes', 'cancel'] : ['ok']"
    @ok="alerts[0]?.onYes?.()"
    @update:open="open => { if (!open) closeAlert(); }"
  >
    <div class="alert-header">
      {{ alerts[0]?.title }}
    </div>
    <div class="alert-message">
      {{ alerts[0]?.message }}
    </div>
  </LightDialog>
</template>

<style scoped>
.alert-header {
    font-weight: bold;
    margin-bottom: 8px;
}
.alert-message {
    white-space: pre-wrap;
}
</style>
