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

<style>
/* general.scss (.context-menu, .menu-item), and modena.css */
.context-menu {
    min-width: 100px;
    padding: 1px;
    border: 1px solid var(--control-border);
    background: var(--control-background);
    font-family: var(--font-main);
    font-size: 15px;
    box-shadow: 0 0 10px rgb(0 0 0 / 0.2);
    outline: none;
    z-index: 200;
}
.context-menu .menu-item {
    display: flex;
    align-items: center;
    gap: 1em;
    padding: 3px 5px;
    color: var(--text-color);
    cursor: default;
    outline: none;
    user-select: none;
}
.context-menu .menu-item > :first-child:not(.menu-check), .context-menu .menu-check + span {
    flex: 1;
}
.context-menu .menu-item[data-highlighted] {
    background: var(--focus-color);
    color: var(--focus-color-text);
}
.context-menu .menu-item[data-disabled] {
    color: var(--text-color-faint);
}
.context-menu .menu-check {
    display: inline-block;
    width: 1em;
}
.context-menu .menu-shortcut, .context-menu .menu-arrow {
    margin-left: auto;
}
.context-menu .menu-separator {
    height: 1px;
    margin: 2px 0;
    background: var(--table-divider);
}
</style>
