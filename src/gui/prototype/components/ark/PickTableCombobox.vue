<script setup lang="ts">
// Ark UI version of a combo box for picking a table by name (Java: PickTablePane's AutoComplete),
// filtering the names as you type.
import { Combobox, useListCollection } from "@ark-ui/vue/combobox";
import { useFilter } from "@ark-ui/vue/locale";
import { computed } from "vue";

const props = defineProps<{ tables: readonly string[] }>();
const value = defineModel<string | undefined>();

const filters = useFilter({ sensitivity: "base" });
const { collection, filter } = useListCollection(computed(() => ({
    initialItems: props.tables,
    filter: filters.value.contains,
})));
const selected = computed({
    get: () => value.value === undefined ? [] : [value.value],
    set: (v: string[]) => { value.value = v[0]; },
});
</script>

<template>
  <Combobox.Root
    v-model="selected"
    :collection="collection"
    open-on-click
    @input-value-change="filter($event.inputValue)"
  >
    <Combobox.Control class="combobox">
      <Combobox.Input
        placeholder="Table name"
        aria-label="Table"
      />
      <Combobox.Trigger aria-label="Show tables">
        ▾
      </Combobox.Trigger>
    </Combobox.Control>
    <Teleport to="body">
      <Combobox.Positioner>
        <Combobox.Content class="menu combobox-list">
          <Combobox.Empty class="combobox-empty">
            No matching tables
          </Combobox.Empty>
          <Combobox.Item
            v-for="t in collection.items"
            :key="t"
            :item="t"
            class="menu-item"
          >
            <Combobox.ItemText>{{ t }}</Combobox.ItemText>
          </Combobox.Item>
        </Combobox.Content>
      </Combobox.Positioner>
    </Teleport>
  </Combobox.Root>
</template>
