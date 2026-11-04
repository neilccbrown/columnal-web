<script setup lang="ts">
// Shows the documentation windows (docWindows.ts; Java: DocWindow): each a panel with its title, which
// can be dragged by it and closed, showing a documentation page (400 by 300) whose examples are
// inserted into the editor which opened it.
import { shallowReactive } from "vue";
import FuncdocView from "../components/FuncdocView.vue";
import { t } from "../i18n.js";
import { closeDocWindow, docWindows, type DocWindowShown } from "./docWindows.js";

const WIDTH = 400;
const HEIGHT = 300;
// Each window's position, once shown or dragged
const positions = shallowReactive(new Map<number, { x: number, y: number }>());

function position(w: DocWindowShown): { x: number, y: number }
{
    let p = positions.get(w.id);
    if (p === undefined)
    {
        // Kept on screen (Java's window could be put off it)
        const x = w.position?.x ?? (window.innerWidth - WIDTH) / 2;
        const y = w.position?.y ?? (window.innerHeight - HEIGHT) / 2;
        p = { x: Math.max(0, Math.min(x, window.innerWidth - WIDTH)), y: Math.max(0, Math.min(y, window.innerHeight - HEIGHT)) };
        positions.set(w.id, p);
    }
    return p;
}

function startDrag(w: DocWindowShown, e: PointerEvent): void
{
    if (e.button !== 0 || (e.target as Element).closest("button") !== null)
        return;
    const start = position(w);
    const from = { x: e.clientX, y: e.clientY };
    const target = e.currentTarget as HTMLElement;
    target.setPointerCapture(e.pointerId);
    const move = (m: PointerEvent): void =>
    {
        positions.set(w.id, { x: start.x + m.clientX - from.x, y: start.y + m.clientY - from.y });
    };
    const up = (): void =>
    {
        target.removeEventListener("pointermove", move);
        target.removeEventListener("pointerup", up);
    };
    target.addEventListener("pointermove", move);
    target.addEventListener("pointerup", up);
    e.preventDefault();
}

function close(id: number): void
{
    closeDocWindow(id);
    positions.delete(id);
}
</script>

<template>
  <div
    v-for="w in docWindows"
    :key="w.id"
    class="doc-window"
    role="dialog"
    :aria-label="w.title"
    :style="{ left: position(w).x + 'px', top: position(w).y + 'px' }"
  >
    <div
      class="doc-window-title"
      @pointerdown="e => startDrag(w, e)"
    >
      <span>{{ w.title }}</span>
      <button
        type="button"
        class="doc-window-close"
        :aria-label="t('close')"
        @click="close(w.id)"
      >
        ×
      </button>
    </div>
    <FuncdocView
      class="doc-window-page"
      :page="w.page"
      @insert="text => w.insertListener.insert(null, text)"
    />
  </div>
</template>

<style scoped>
/* Over the dialogs and their overlays (Java: always on top), and usable while a modal dialog is open */
.doc-window {
    position: fixed;
    z-index: 2000;
    pointer-events: auto;
    display: flex;
    flex-direction: column;
    width: 400px;
    background: var(--control-background);
    border: 1px solid var(--control-border);
    box-shadow: 0 2px 10px rgb(0 0 0 / 30%);
}
.doc-window-title {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 2px 4px 2px 8px;
    background: var(--pane-background);
    font-family: var(--font-main);
    cursor: move;
    user-select: none;
}
.doc-window-close {
    border: none;
    background: none;
    font-size: 14pt;
    line-height: 1;
    cursor: pointer;
}
.doc-window-page {
    height: 300px;
    overflow: auto;
}
</style>
