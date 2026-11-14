<script setup lang="ts">
// Java: GuidanceWindow (utility-gui): a small window, always on top, near the top right of the page, whose
// background pulses, showing a step of guidance (Guidance), with Close (and a button to go on, for a step
// with one).  What the step names is outlined in blue.  When the step's condition is satisfied it moves on
// to the next, or closes after the last.  It can be dragged by its background.
// (docs/gui-spec/tables.md)
import { computed, onBeforeUnmount, shallowRef } from "vue";
import { t } from "../i18n.js";
import type { Guidance } from "./guidance.js";

const props = defineProps<{ initialGuidance: Guidance }>();
const emit = defineEmits<{ close: [] }>();

const current = shallowRef<Guidance>(props.initialGuidance);
// Java: the highlight's bounds, found when the step is shown
const highlight = shallowRef<DOMRect | null>(null);
let advanceOnClick: (() => void) | null = null;
let stopCondition: (() => void) | null = null;
const position = shallowRef({ x: window.innerWidth - 350, y: 50 });

// Java: setGuidance
function setGuidance(guidance: Guidance): void
{
    stopCondition?.();
    current.value = guidance;
    highlight.value = guidance.highlight?.() ?? null;
    const advance = (): void =>
    {
        const next = guidance.next();
        if (next !== null)
            setGuidance(next);
        else
            close();
    };
    if ("buttonKey" in guidance.condition)
    {
        advanceOnClick = advance;
        stopCondition = null;
    }
    else
    {
        advanceOnClick = null;
        stopCondition = guidance.condition(advance);
    }
}
setGuidance(props.initialGuidance);

function close(): void
{
    stopCondition?.();
    stopCondition = null;
    highlight.value = null;
    emit("close");
}
onBeforeUnmount(() => stopCondition?.());

const buttonKey = computed(() => "buttonKey" in current.value.condition ? current.value.condition.buttonKey : null);

// Java: FXUtility.enableWindowMove
let drag: { x: number, y: number } | null = null;
function pointerDown(e: PointerEvent): void
{
    if (e.target instanceof HTMLButtonElement)
        return;
    drag = { x: e.clientX - position.value.x, y: e.clientY - position.value.y };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
}
function pointerMove(e: PointerEvent): void
{
    if (drag !== null)
        position.value = { x: e.clientX - drag.x, y: e.clientY - drag.y };
}

// Java: 3 px thick, 2 px from what it highlights
const THICK = 3;
const MARGIN = 2;
</script>

<template>
  <Teleport to="body">
    <div
      class="guidance-root"
      :style="{ left: position.x + 'px', top: position.y + 'px' }"
      @pointerdown="pointerDown"
      @pointermove="pointerMove"
      @pointerup="drag = null"
    >
      <div class="guidance-content">
        {{ current.content }}
      </div>
      <div class="guidance-buttons">
        <button
          type="button"
          class="id-close"
          @click="close"
        >
          {{ t("close") }}
        </button>
        <button
          v-if="buttonKey !== null"
          type="button"
          :class="'id-' + buttonKey.replaceAll('.', '-')"
          @click="advanceOnClick?.()"
        >
          {{ t(buttonKey) }}
        </button>
      </div>
    </div>
    <div
      v-if="highlight !== null"
      class="guidance-highlight"
      :style="{
        left: (highlight.left - THICK - MARGIN) + 'px',
        top: (highlight.top - THICK - MARGIN) + 'px',
        width: (highlight.width + 2 * MARGIN) + 'px',
        height: (highlight.height + 2 * MARGIN) + 'px',
        borderWidth: THICK + 'px',
      }"
    />
  </Teleport>
</template>

<style scoped>
/* Java: an undecorated stage, always on top, 300 px wide, its background pulsing between 90% grey and
   white every 1.2 s */
.guidance-root {
    position: fixed;
    z-index: 2000;
    width: 300px;
    box-sizing: border-box;
    padding: 10px;
    border: 1px solid rgb(128 128 128);
    font-family: var(--font-main);
    animation: guidance-pulse 1.2s ease-in-out infinite alternate;
    cursor: move;
}
@keyframes guidance-pulse {
    from { background: rgb(230 230 230); }
    to { background: white; }
}
.guidance-buttons {
    display: flex;
    justify-content: flex-end;
    gap: 0.5em;
    margin-top: 15px;
}
.guidance-buttons button {
    cursor: default;
}
.guidance-highlight {
    position: fixed;
    z-index: 2000;
    border: solid blue;
    pointer-events: none;
}
</style>
