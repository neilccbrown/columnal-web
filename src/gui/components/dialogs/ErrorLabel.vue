<script setup lang="ts">
// Rebuild of xyz.columnal.utility.gui.ErrorLabel (utility-gui): an error message, or nothing.
defineProps<{ error: string }>();
</script>

<template>
  <div
    class="error-label"
    role="alert"
  >
    {{ error }}
  </div>
</template>

<style scoped>
/* general.scss .error-label */
.error-label {
    color: var(--error-text);
    white-space: pre-wrap;
}
</style>
