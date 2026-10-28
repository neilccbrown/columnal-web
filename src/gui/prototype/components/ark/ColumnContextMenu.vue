<script setup lang="ts">
// Ark UI version of a column header's context menu, with a disabled item and a submenu.
import { Menu } from "@ark-ui/vue/menu";

const emit = defineEmits<{ select: [action: string] }>();
</script>

<template>
  <Menu.Root @select="emit('select', $event.value)">
    <Menu.ContextTrigger as-child>
      <slot />
    </Menu.ContextTrigger>
    <Teleport to="body">
      <Menu.Positioner>
        <Menu.Content class="menu">
          <Menu.Item
            value="rename"
            class="menu-item"
          >
            Edit column
          </Menu.Item>
          <Menu.Item
            value="delete"
            class="menu-item"
            disabled
          >
            Delete column
          </Menu.Item>
          <Menu.Separator class="menu-separator" />
          <Menu.Root @select="emit('select', $event.value)">
            <Menu.TriggerItem class="menu-item">
              Sort by this column <span>▸</span>
            </Menu.TriggerItem>
            <Teleport to="body">
              <Menu.Positioner>
                <Menu.Content class="menu">
                  <Menu.Item
                    value="sort-ascending"
                    class="menu-item"
                  >
                    Ascending
                  </Menu.Item>
                  <Menu.Item
                    value="sort-descending"
                    class="menu-item"
                  >
                    Descending
                  </Menu.Item>
                </Menu.Content>
              </Menu.Positioner>
            </Teleport>
          </Menu.Root>
          <Menu.Item
            value="hide"
            class="menu-item"
          >
            Hide column
          </Menu.Item>
        </Menu.Content>
      </Menu.Positioner>
    </Teleport>
  </Menu.Root>
</template>
