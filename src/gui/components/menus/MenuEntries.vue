<script setup lang="ts">
// The entries of a context menu, or of a menu bar's menu (or of a submenu, recursively): see
// ContextMenu.vue and MenuBar.vue.
import { ContextMenuCheckboxItem, ContextMenuItem, ContextMenuItemIndicator, ContextMenuPortal, ContextMenuSeparator, ContextMenuSub, ContextMenuSubContent, ContextMenuSubTrigger, MenubarCheckboxItem, MenubarItem, MenubarItemIndicator, MenubarPortal, MenubarSeparator, MenubarSub, MenubarSubContent, MenubarSubTrigger } from "reka-ui";
import { shortcutText } from "../../shortcuts.js";
import type { MenuEntry, MenuItem } from "./menus.js";

const props = defineProps<{
    items: readonly MenuEntry[],
    // In a menu bar's menu, rather than a context menu
    bar?: boolean,
}>();

// Reka has the same parts for both, under different names:
const parts = props.bar === true
    ? { Item: MenubarItem, CheckboxItem: MenubarCheckboxItem, ItemIndicator: MenubarItemIndicator, Portal: MenubarPortal, Separator: MenubarSeparator, Sub: MenubarSub, SubContent: MenubarSubContent, SubTrigger: MenubarSubTrigger }
    : { Item: ContextMenuItem, CheckboxItem: ContextMenuCheckboxItem, ItemIndicator: ContextMenuItemIndicator, Portal: ContextMenuPortal, Separator: ContextMenuSeparator, Sub: ContextMenuSub, SubContent: ContextMenuSubContent, SubTrigger: ContextMenuSubTrigger };

function selected(item: MenuItem, e: Event): void
{
    const menu = e.target instanceof Element ? e.target.closest("[role=menu]") : null;
    const box = menu?.getBoundingClientRect();
    item.onAction(box !== undefined ? { x: box.left + box.width / 2, y: box.top + box.height / 2 } : { x: window.innerWidth / 2, y: window.innerHeight / 2 });
}
</script>

<template>
  <template
    v-for="(entry, i) in items"
    :key="i"
  >
    <component
      :is="parts.Separator"
      v-if="entry.kind === 'separator'"
      class="menu-separator"
    />
    <component
      :is="parts.Item"
      v-else-if="entry.kind === 'item'"
      class="menu-item"
      :class="[entry.id, ...entry.styleClasses]"
      :disabled="entry.disabled"
      @select="selected(entry, $event)"
    >
      <span>{{ entry.label.text }}</span>
      <span
        v-if="entry.label.shortcut !== null"
        class="menu-shortcut"
      >{{ shortcutText(entry.label.shortcut) }}</span>
    </component>
    <component
      :is="parts.CheckboxItem"
      v-else-if="entry.kind === 'check'"
      class="menu-item"
      :class="entry.id"
      :model-value="entry.checked"
      :disabled="entry.disabled"
      @update:model-value="v => entry.onChange(v === true)"
    >
      <span class="menu-check"><component :is="parts.ItemIndicator">✓</component></span>
      <span>{{ entry.label.text }}</span>
    </component>
    <component
      :is="parts.Sub"
      v-else
    >
      <component
        :is="parts.SubTrigger"
        class="menu-item"
        :class="entry.id"
      >
        <span>{{ entry.label.text }}</span><span class="menu-arrow">▸</span>
      </component>
      <component :is="parts.Portal">
        <component
          :is="parts.SubContent"
          class="context-menu"
        >
          <MenuEntries
            :items="entry.items"
            :bar="bar"
          />
        </component>
      </component>
    </component>
  </template>
</template>

<style>
/* The menus' look, for context menus and the menu bar's (general.scss: .context-menu, .menu-item; and
   modena.css) */
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
/* mainview.scss: the recipes in a column's menu */
.context-menu .menu-item.recipe-menu-item, .context-menu .menu-item.recipe-header-menu-item {
    font-family: "Kalam", var(--font-main);
    color: var(--recipe-text);
}
.context-menu .menu-item.recipe-header-menu-item {
    padding: 2px 5px 1px 5px;
    background: linear-gradient(to bottom, var(--control-background) 0px, var(--recipe-background) 7px);
    text-decoration: underline;
}
.context-menu .menu-item.recipe-menu-item {
    padding-left: 15px;
    background: var(--recipe-background);
}
/* (Java's recipes are never disabled; one not yet ported is) */
.context-menu .menu-item.recipe-menu-item[data-disabled] {
    color: var(--text-color-faint);
}
.context-menu .menu-item.recipe-menu-item[data-highlighted] {
    background: var(--focus-color);
    color: var(--focus-color-text);
}
.context-menu .menu-separator {
    height: 1px;
    margin: 2px 0;
    background: var(--table-divider);
}
</style>
