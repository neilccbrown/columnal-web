<script setup lang="ts">
// The entries of a context menu (or of a submenu, recursively): see ContextMenu.vue.
import { ContextMenuCheckboxItem, ContextMenuItem, ContextMenuItemIndicator, ContextMenuPortal, ContextMenuSeparator, ContextMenuSub, ContextMenuSubContent, ContextMenuSubTrigger } from "reka-ui";
import { shortcutText } from "../../shortcuts.js";
import type { MenuEntry, MenuItem } from "./menus.js";

defineProps<{ items: readonly MenuEntry[] }>();

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
    <ContextMenuSeparator
      v-if="entry.kind === 'separator'"
      class="menu-separator"
    />
    <ContextMenuItem
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
    </ContextMenuItem>
    <ContextMenuCheckboxItem
      v-else-if="entry.kind === 'check'"
      class="menu-item"
      :class="entry.id"
      :model-value="entry.checked"
      @update:model-value="v => entry.onChange(v === true)"
    >
      <span class="menu-check"><ContextMenuItemIndicator>✓</ContextMenuItemIndicator></span>
      <span>{{ entry.label.text }}</span>
    </ContextMenuCheckboxItem>
    <ContextMenuSub v-else>
      <ContextMenuSubTrigger
        class="menu-item"
        :class="entry.id"
      >
        <span>{{ entry.label.text }}</span><span class="menu-arrow">▸</span>
      </ContextMenuSubTrigger>
      <ContextMenuPortal>
        <ContextMenuSubContent class="context-menu">
          <MenuEntries :items="entry.items" />
        </ContextMenuSubContent>
      </ContextMenuPortal>
    </ContextMenuSub>
  </template>
</template>
