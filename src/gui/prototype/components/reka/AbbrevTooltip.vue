<script setup lang="ts">
// Reka UI version of a label that shows its full text in a tooltip when it is cut short (Java:
// GUI.showTooltipWhenAbbrev).
import { TooltipContent, TooltipPortal, TooltipProvider, TooltipRoot, TooltipTrigger } from "reka-ui";
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
  <TooltipProvider :delay-duration="500">
    <TooltipRoot
      :open="open"
      @update:open="setOpen"
    >
      <TooltipTrigger as-child>
        <span
          ref="label"
          class="abbrev-label"
        >{{ text }}</span>
      </TooltipTrigger>
      <TooltipPortal>
        <TooltipContent
          class="tooltip"
          side="bottom"
          :side-offset="4"
        >
          {{ text }}
        </TooltipContent>
      </TooltipPortal>
    </TooltipRoot>
  </TooltipProvider>
</template>
