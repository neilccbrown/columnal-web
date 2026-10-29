<script setup lang="ts">
// A tooltip on what the slot shows (JavaFX Tooltip.install): after the pointer has rested on it for a
// second, below the pointer (docs/gui-spec/menus-and-tooltips.md).
import { TooltipContent, TooltipPortal, TooltipProvider, TooltipRoot, TooltipTrigger } from "reka-ui";
import { shallowRef } from "vue";

const props = withDefaults(defineProps<{
    text: string,
    // Asked when it would show; false stops it (as if not installed):
    shouldShow?: () => boolean,
}>(), {
    shouldShow: () => true,
});

const open = shallowRef(false);

function setOpen(value: boolean): void
{
    open.value = value && props.shouldShow();
}
</script>

<template>
  <TooltipProvider :delay-duration="1000">
    <TooltipRoot
      :open="open"
      @update:open="setOpen"
    >
      <TooltipTrigger as-child>
        <slot />
      </TooltipTrigger>
      <TooltipPortal>
        <TooltipContent
          class="tooltip"
          side="bottom"
          align="start"
          :side-offset="4"
        >
          {{ text }}
        </TooltipContent>
      </TooltipPortal>
    </TooltipRoot>
  </TooltipProvider>
</template>

<style>
/* general.scss .tooltip */
.tooltip {
    max-width: 400px;
    padding: 1px 4px;
    border: 1px solid rgb(153 146 138);
    background: rgb(250 244 237);
    color: rgb(128 122 115);
    box-shadow: 2px 2px 8px rgb(102 97 92 / 0.7);
    font-family: var(--font-main);
    font-size: 13px;
    white-space: pre-wrap;
    z-index: 300;
}
</style>
