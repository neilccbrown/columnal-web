<script setup lang="ts">
// Ark UI version of a label that shows its full text in a tooltip when it is cut short (Java:
// GUI.showTooltipWhenAbbrev).
import { Tooltip } from "@ark-ui/vue/tooltip";
import { shallowRef, useTemplateRef } from "vue";

defineProps<{ text: string }>();
const label = useTemplateRef<HTMLElement>("label");
const open = shallowRef(false);

function setOpen(value: boolean): void
{
    const l = label.value;
    open.value = value && l !== null && l.scrollWidth > l.clientWidth;
}
</script>

<template>
  <Tooltip.Root
    :open="open"
    :open-delay="500"
    :positioning="{ placement: 'bottom', gutter: 4 }"
    @open-change="setOpen($event.open)"
  >
    <Tooltip.Trigger as-child>
      <span
        ref="label"
        class="abbrev-label"
      >{{ text }}</span>
    </Tooltip.Trigger>
    <Teleport to="body">
      <Tooltip.Positioner>
        <Tooltip.Content class="tooltip">
          {{ text }}
        </Tooltip.Content>
      </Tooltip.Positioner>
    </Teleport>
  </Tooltip.Root>
</template>
