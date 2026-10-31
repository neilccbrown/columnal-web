<script setup lang="ts">
// The quick fixes in an error popup (Java: FixList): a "Fixes:" heading, then a row per fix, which
// applies it when clicked.  The rows have the key-F1, key-F2… classes (Java's tests find them by
// these; in the lex editors, Shift+F1… applies them).
import type { StyledString } from "../../engine/utility-error/styled/StyledString.js";
import { t } from "../i18n.js";
import StyledText from "./StyledText.vue";

export interface FixInfo
{
    readonly label: StyledString;
    readonly cssClasses: readonly string[];
}

defineProps<{ fixes: readonly FixInfo[] }>();
const emit = defineEmits<{ fix: [index: number] }>();
</script>

<template>
  <div
    v-if="fixes.length > 0"
    class="quick-fix-list"
  >
    <div class="fix-list-heading">
      {{ t("error.fixes") }}
    </div>
    <div
      v-for="(fix, i) in fixes"
      :key="i"
      class="quick-fix-row"
      :class="[`key-F${i + 1}`, ...fix.cssClasses]"
      role="button"
      @mousedown.prevent
      @click="emit('fix', i)"
    >
      <StyledText :text="fix.label" />
    </div>
  </div>
</template>

<style scoped>
.fix-list-heading {
    color: rgb(40% 40% 40%);
}
.quick-fix-row {
    padding-left: 2em;
    cursor: pointer;
}
.quick-fix-row :deep(.styled-text) {
    text-decoration: underline;
    color: rgb(40% 40% 40%);
}
</style>
