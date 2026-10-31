<script setup lang="ts">
// A window's menu bar (Java: a JavaFX MenuBar of GUI.menu's), whose menus have the class
// "id-<key with - for .>" (Java: GUI.menu's id, by which the Java tests find them; Reka gives the
// menus ids of its own).  The items'
// shortcuts work anywhere in the page while it is shown (see onKeyDown).
//
// PORT-NOTE: Java's menus had mnemonics (Alt and the underlined letter); here they're not shown or
// used, as browsers keep Alt and a letter for their own menus.  The menus are reached by mouse, or by
// the keyboard once one is open.
import { MenubarContent, MenubarMenu, MenubarPortal, MenubarRoot, MenubarTrigger } from "reka-ui";
import { onBeforeUnmount } from "vue";
import { matchesShortcut } from "../../shortcuts.js";
import MenuEntries from "./MenuEntries.vue";
import type { MenuEntry, SubMenu } from "./menus.js";

const props = defineProps<{ menus: readonly SubMenu[] }>();
const emit = defineEmits<{
    // A menu was opened:
    opened: [],
}>();

// The shortcuts act when nothing else took the key (Java: the scene's accelerators, after the focused
// control; the cell editors, for example, take every key), and not while a dialog is open (Java's were
// windows of their own):
function onKeyDown(event: KeyboardEvent): void
{
    if (event.defaultPrevented || document.querySelector("[role=dialog][data-state=open]") !== null)
        return;
    const find = (entries: readonly MenuEntry[]): void =>
    {
        for (const entry of entries)
        {
            if (event.defaultPrevented)
                return;
            if (entry.kind === "item" && !entry.disabled && entry.label.shortcut !== null && matchesShortcut(entry.label.shortcut, event))
            {
                event.preventDefault();
                entry.onAction({ x: window.innerWidth / 2, y: window.innerHeight / 2 });
            }
            else if (entry.kind === "menu")
                find(entry.items);
        }
    };
    find(props.menus);
}
window.addEventListener("keydown", onKeyDown);
onBeforeUnmount(() => window.removeEventListener("keydown", onKeyDown));
</script>

<template>
  <MenubarRoot
    class="menu-bar"
    @update:model-value="value => { if (value) emit('opened'); }"
  >
    <MenubarMenu
      v-for="menu in menus"
      :key="menu.id"
    >
      <MenubarTrigger
        class="menu-button"
        :class="menu.id"
      >
        {{ menu.label.text }}
      </MenubarTrigger>
      <MenubarPortal>
        <MenubarContent
          class="context-menu"
          align="start"
          :side-offset="0"
        >
          <MenuEntries
            :items="menu.items"
            bar
          />
        </MenubarContent>
      </MenubarPortal>
    </MenubarMenu>
  </MenubarRoot>
</template>

<style scoped>
/* general.scss: .menu-bar */
.menu-bar {
    display: flex;
    background: var(--control-background);
    border-bottom: 1px solid var(--control-border);
    font-family: var(--font-main);
    font-size: 15px;
}
.menu-button {
    padding: 4px 8px;
    border: none;
    background: transparent;
    color: var(--text-color);
    font: inherit;
}
.menu-button:hover, .menu-button:focus-visible, .menu-button[data-state="open"] {
    background: var(--focus-color);
    color: var(--focus-color-text);
    outline: none;
}
</style>
