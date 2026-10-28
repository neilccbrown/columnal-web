<script setup lang="ts">
// Reka UI version of a combo box for picking a table by name (Java: PickTablePane's AutoComplete),
// filtering the names as you type.
import { ComboboxAnchor, ComboboxContent, ComboboxEmpty, ComboboxInput, ComboboxItem, ComboboxPortal, ComboboxRoot, ComboboxTrigger, ComboboxViewport } from "reka-ui";

defineProps<{ tables: readonly string[] }>();
const value = defineModel<string | undefined>();
</script>

<template>
  <ComboboxRoot
    v-model="value"
    open-on-focus
  >
    <ComboboxAnchor class="combobox">
      <ComboboxInput
        placeholder="Table name"
        aria-label="Table"
      />
      <ComboboxTrigger aria-label="Show tables">
        ▾
      </ComboboxTrigger>
    </ComboboxAnchor>
    <ComboboxPortal>
      <ComboboxContent
        class="menu"
        position="popper"
        :side-offset="2"
      >
        <ComboboxViewport class="combobox-list">
          <ComboboxEmpty class="combobox-empty">
            No matching tables
          </ComboboxEmpty>
          <ComboboxItem
            v-for="t in tables"
            :key="t"
            :value="t"
            class="menu-item"
          >
            {{ t }}
          </ComboboxItem>
        </ComboboxViewport>
      </ComboboxContent>
    </ComboboxPortal>
  </ComboboxRoot>
</template>
