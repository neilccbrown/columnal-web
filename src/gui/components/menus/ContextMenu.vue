<script setup lang="ts">
// A context menu (JavaFX ContextMenu with items from GUI.menuItem etc.: menus.ts), shown on a right
// click (or the context menu key) on what the slot shows (docs/gui-spec/menus-and-tooltips.md).
import { ContextMenuContent, ContextMenuPortal, ContextMenuRoot, ContextMenuTrigger } from "reka-ui";
import type { MenuEntry } from "./menus.js";
import MenuEntries from "./MenuEntries.vue";

defineProps<{
    // Made when the menu opens, so that they can depend on the state then:
    items: () => readonly MenuEntry[],
}>();
</script>

<template>
  <ContextMenuRoot>
    <ContextMenuTrigger as-child>
      <slot />
    </ContextMenuTrigger>
    <ContextMenuPortal>
      <ContextMenuContent class="context-menu">
        <MenuEntries :items="items()" />
      </ContextMenuContent>
    </ContextMenuPortal>
  </ContextMenuRoot>
</template>
