<script setup lang="ts">
// Reka UI version of a column header's context menu, with a disabled item and a submenu.
import { ContextMenuContent, ContextMenuItem, ContextMenuPortal, ContextMenuRoot, ContextMenuSeparator, ContextMenuSub, ContextMenuSubContent, ContextMenuSubTrigger, ContextMenuTrigger } from "reka-ui";

const emit = defineEmits<{ select: [action: string] }>();
</script>

<template>
  <ContextMenuRoot>
    <ContextMenuTrigger as-child>
      <slot />
    </ContextMenuTrigger>
    <ContextMenuPortal>
      <ContextMenuContent class="menu">
        <ContextMenuItem
          class="menu-item"
          @select="emit('select', 'rename')"
        >
          Edit column
        </ContextMenuItem>
        <ContextMenuItem
          class="menu-item"
          disabled
        >
          Delete column
        </ContextMenuItem>
        <ContextMenuSeparator class="menu-separator" />
        <ContextMenuSub>
          <ContextMenuSubTrigger class="menu-item">
            Sort by this column <span>▸</span>
          </ContextMenuSubTrigger>
          <ContextMenuPortal>
            <ContextMenuSubContent class="menu">
              <ContextMenuItem
                class="menu-item"
                @select="emit('select', 'sort-ascending')"
              >
                Ascending
              </ContextMenuItem>
              <ContextMenuItem
                class="menu-item"
                @select="emit('select', 'sort-descending')"
              >
                Descending
              </ContextMenuItem>
            </ContextMenuSubContent>
          </ContextMenuPortal>
        </ContextMenuSub>
        <ContextMenuItem
          class="menu-item"
          @select="emit('select', 'hide')"
        >
          Hide column
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenuPortal>
  </ContextMenuRoot>
</template>
