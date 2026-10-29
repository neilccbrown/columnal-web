<script setup lang="ts">
// Rebuild of xyz.columnal.utility.gui.HelpBox (utility-gui): a little question mark in a circle which
// offers a short tooltip when hovered over, or a longer one if clicked (docs/gui-spec/help-box.md).
// The field it helps with calls cycleStates() on F1 (Java: GUI.helpBox), and sets relatedFocused
// while it has the focus.
import { PopoverAnchor, PopoverArrow, PopoverContent, PopoverPortal, PopoverRoot } from "reka-ui";
import { computed, onBeforeUnmount, shallowRef, useTemplateRef } from "vue";
import type { HelpKey } from "../../engine/anns/Annotations.js";
import { Help } from "../../gui-logic/utility-gui/utility/gui/Help.js";
import { t } from "../i18n.js";

const props = defineProps<{
    helpId: HelpKey,
    relatedFocused?: boolean,
}>();

const info = computed(() => Help.getHelpInfo(props.helpId));
const open = shallowRef(false);
// Showing full is also equivalent to whether it is pinned.
const showingFull = shallowRef(false);
const circle = useTemplateRef<HTMLElement>("circle");
let hoverTimer: ReturnType<typeof setTimeout> | null = null;

function setOpen(value: boolean): void
{
    open.value = value && info.value !== null;
    if (!open.value)
        showingFull.value = false;
}

function cancelHover(): void
{
    if (hoverTimer !== null)
    {
        clearTimeout(hoverTimer);
        hoverTimer = null;
    }
}

function mouseEntered(): void
{
    cancelHover();
    hoverTimer = setTimeout(() =>
    {
        hoverTimer = null;
        if (!open.value)
            setOpen(true);
    }, 400);
}

function mouseExited(): void
{
    cancelHover();
    if (open.value && !showingFull.value)
        setOpen(false);
}

function clicked(): void
{
    const wasPinned = showingFull.value;
    showingFull.value = true;
    if (!open.value)
        setOpen(true);
    else if (wasPinned)
        setOpen(false);
}

/** Cycles through: not showing, showing, showing full. */
function cycleStates(): void
{
    if (!open.value)
        setOpen(true);
    else if (!showingFull.value)
        showingFull.value = true;
    else
        setOpen(false);
}

// A click on the circle is handled by clicked(), not as a click outside the popup:
function interactOutside(event: Event): void
{
    if (event.target instanceof Node && circle.value?.contains(event.target))
        event.preventDefault();
}

onBeforeUnmount(cancelHover);
defineExpose({ cycleStates });
</script>

<template>
  <PopoverRoot
    :open="open"
    @update:open="setOpen"
  >
    <PopoverAnchor as-child>
      <span
        ref="circle"
        class="help-box"
        :class="{ 'showing-full': showingFull }"
        role="button"
        :aria-label="info?.title"
        :aria-expanded="open"
        data-testid="help-box"
        @mouseenter="mouseEntered"
        @mouseleave="mouseExited"
        @click.stop="clicked"
      ><span class="question">?</span></span>
    </PopoverAnchor>
    <PopoverPortal>
      <PopoverContent
        v-if="info !== null"
        class="help-popup"
        side="bottom"
        align="start"
        :side-offset="4"
        :align-offset="-18"
        @open-auto-focus.prevent
        @close-auto-focus.prevent
        @interact-outside="interactOutside"
      >
        <div class="help-title">
          {{ info.title }}
        </div>
        <div class="help-content">
          <p class="short">
            {{ info.shortText }}
          </p>
          <p
            v-if="!showingFull"
            class="more"
          >
            {{ relatedFocused ? t("help.more.keyboard") : t("help.more") }}
          </p>
          <template v-else>
            <p
              v-for="(para, i) in info.fullParas"
              :key="i"
              class="full"
            >
              {{ para }}
            </p>
          </template>
        </div>
        <PopoverArrow
          class="help-arrow"
          :width="16"
          :height="8"
        />
      </PopoverContent>
    </PopoverPortal>
  </PopoverRoot>
</template>

<style scoped>
.help-box {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 24px;
    height: 24px;
    border-radius: 50%;
    cursor: pointer;
    background: hsl(0 0% 90%);
    box-shadow: inset 1px 1px 3px rgb(0 0 0 / 0.1);
    color: hsl(0 0% 40%);
    user-select: none;
    vertical-align: middle;
}
.help-box:hover {
    background: hsl(0 0% 95%);
}
.question {
    display: inline-block;
}
.showing-full .question {
    transform: rotate(-45deg);
}

/* ControlsFX PopOver, as styled in general.scss */
.help-popup {
    max-width: 400px;
    background: white;
    border: 1px solid rgb(0 0 0 / 0.3);
    border-radius: 6px;
    filter: drop-shadow(5px 5px 4px rgb(0 0 0 / 0.2));
    font-size: 0.9rem;
    z-index: 100;
}
.help-title {
    padding: 0.5em 0.75em 0;
    text-align: center;
    font-weight: bold;
}
.help-content {
    padding: 0.75em;
}
.help-content p {
    margin: 0;
}
.help-content p + p {
    margin-top: 1em;
}
.short {
    font-weight: bold;
}
.more {
    font-size: 80%;
    color: hsl(0 0% 60%);
}
.help-arrow {
    fill: white;
    stroke: rgb(0 0 0 / 0.3);
}
</style>
