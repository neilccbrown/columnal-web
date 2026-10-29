<script setup lang="ts">
// A label that shows its full text in a tooltip when it is cut short (Java: GUI.showTooltipWhenAbbrev).
import { useTemplateRef } from "vue";
import HoverTooltip from "./HoverTooltip.vue";

defineProps<{ text: string }>();
const label = useTemplateRef<HTMLElement>("label");

function abbreviated(): boolean
{
    return label.value !== null && label.value.scrollWidth > label.value.clientWidth;
}
</script>

<template>
  <HoverTooltip
    :text="text"
    :should-show="abbreviated"
  >
    <span
      ref="label"
      class="abbrev-label"
    >{{ text }}</span>
  </HoverTooltip>
</template>

<style>
.abbrev-label {
    display: inline-block;
    max-width: 100%;
    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;
    vertical-align: bottom;
}
</style>
