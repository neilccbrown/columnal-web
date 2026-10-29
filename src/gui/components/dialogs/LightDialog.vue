<script setup lang="ts">
// Rebuild of xyz.columnal.utility.gui.LightDialog (utility-gui): a modal dialog with a minimal look (no
// title bar, a drop shadow), over the dimmed window, moved by dragging its background, and resized by
// its edges if resizable (docs/gui-spec/light-dialog.md).  With buttonsToSide, the buttons are down the
// right (Java: DialogPaneWithSideButtons), so that completion popups don't hide them.
import { DialogContent, DialogOverlay, DialogPortal, DialogRoot, DialogTitle, VisuallyHidden } from "reka-ui";
import { computed, shallowRef, useTemplateRef, watch } from "vue";
import { type DialogButton, isWindows, sortButtons } from "./dialogs.js";

const open = defineModel<boolean>("open", { required: true });
const props = withDefaults(defineProps<{
    // For screen readers (there is no title bar):
    label: string,
    buttons?: readonly DialogButton[],
    buttonsToSide?: boolean,
    resizable?: boolean,
    // Java: showAndWaitCentredOn(mouseScreenPos, ...): centred on this point (client coordinates),
    // but kept 20 px inside the window.  Otherwise, centred in the window.
    centreOn?: { readonly x: number, readonly y: number } | null,
    // Called when OK is pressed; false stops it closing the dialog (Java: an event filter on OK
    // which consumes the action).
    okFilter?: () => boolean,
}>(), {
    buttons: () => ["cancel", "ok"],
    buttonsToSide: false,
    resizable: false,
    centreOn: null,
    okFilter: () => true,
});
const emit = defineEmits<{
    ok: [],
    // Cancel, Close, or Escape:
    cancel: [],
}>();

const BUTTON_TEXT: Record<DialogButton, string> = { ok: "OK", cancel: "Cancel", close: "Close" };
const sortedButtons = computed(() => sortButtons(props.buttons, isWindows()));

const contentComponent = useTemplateRef<{ $el: HTMLElement }>("content");
const content = computed(() => contentComponent.value?.$el ?? null);
const buttonElements = useTemplateRef<HTMLButtonElement[]>("buttonElements");

// Where the dialog is, once it has been placed, moved or resized; null for centred by CSS:
interface Rect { left: number, top: number, width: number | null, height: number | null }
const rect = shallowRef<Rect | null>(null);
const style = computed(() => rect.value === null ? {} : {
    left: `${rect.value.left}px`,
    top: `${rect.value.top}px`,
    transform: "none",
    ...(rect.value.width !== null ? { width: `${rect.value.width}px` } : {}),
    ...(rect.value.height !== null ? { height: `${rect.value.height}px` } : {}),
});
const cursor = shallowRef<string | null>(null);

watch(open, () =>
{
    rect.value = null;
    cursor.value = null;
});
// Placed once it is shown (it is in a portal, so not there until then):
watch(content, el =>
{
    if (el === null || props.centreOn === null)
        return;
    const box = el.getBoundingClientRect();
    const SPACE = 20;
    const clamp = (low: number, value: number, high: number): number => Math.max(low, Math.min(value, high));
    rect.value = {
        left: clamp(SPACE, props.centreOn.x - box.width / 2, window.innerWidth - box.width - SPACE),
        top: clamp(SPACE, props.centreOn.y - box.height / 2, window.innerHeight - box.height - SPACE),
        width: null,
        height: null,
    };
}, { flush: "post" });

function button(which: DialogButton): HTMLButtonElement | null
{
    return buttonElements.value?.find(b => b.dataset.button === which) ?? null;
}

function press(which: DialogButton): void
{
    if (which === "ok")
    {
        if (!props.okFilter())
            return;
        emit("ok");
    }
    else
        emit("cancel");
    open.value = false;
}

function setOpen(value: boolean): void
{
    // Reka only closes it, on Escape:
    if (!value && open.value)
        press("cancel");
}

const INTERACTIVE = "input, button, select, textarea, a, [tabindex], [contenteditable], [role=combobox], [role=listbox]";

// Whether the target is a control (or in one), which is pressed rather than the dialog's background:
function inControl(target: EventTarget | null): boolean
{
    const control = target instanceof Element ? target.closest(INTERACTIVE) : null;
    return control !== null && control !== content.value;
}

// Enter presses OK (JavaFX: the default button), unless something else has handled it:
function keydown(e: KeyboardEvent): void
{
    if (e.key === "Enter" && !e.defaultPrevented && !e.isComposing && props.buttons.includes("ok")
        && !(e.target instanceof HTMLTextAreaElement) && !(e.target instanceof HTMLButtonElement))
    {
        e.preventDefault();
        press("ok");
    }
}

// Which edges the point is near (within 5 px), if resizable:
function edgesAt(e: PointerEvent): { top: boolean, bottom: boolean, left: boolean, right: boolean } | null
{
    if (!props.resizable || content.value === null)
        return null;
    const box = content.value.getBoundingClientRect();
    const border = 5;
    const edges = {
        top: Math.abs(box.top - e.clientY) < border,
        bottom: Math.abs(box.bottom - e.clientY) < border,
        left: Math.abs(box.left - e.clientX) < border,
        right: Math.abs(box.right - e.clientX) < border,
    };
    return edges.top || edges.bottom || edges.left || edges.right ? edges : null;
}

function pointerMove(e: PointerEvent): void
{
    if (e.buttons !== 0)
        return;
    const edges = edgesAt(e);
    if (edges === null)
        cursor.value = null;
    else
        cursor.value = (edges.top ? "n" : edges.bottom ? "s" : "") + (edges.left ? "w" : edges.right ? "e" : "") + "-resize";
}

let downAt: { x: number, y: number } | null = null;

function pointerDown(e: PointerEvent): void
{
    downAt = { x: e.clientX, y: e.clientY };
    const edges = edgesAt(e);
    if (e.button !== 0 || content.value === null || (edges === null && inControl(e.target)))
        return;
    const target = content.value;
    const start = target.getBoundingClientRect();
    target.setPointerCapture(e.pointerId);
    // A minimum size, as JavaFX has the content's:
    const MIN_WIDTH = 150, MIN_HEIGHT = 100;
    const move = (ev: PointerEvent): void =>
    {
        const dx = ev.clientX - e.clientX, dy = ev.clientY - e.clientY;
        if (edges === null)
        {
            rect.value = { left: start.left + dx, top: start.top + dy, width: rect.value?.width ?? null, height: rect.value?.height ?? null };
            return;
        }
        let { left, top, width, height } = start;
        if (edges.top)
        {
            height = Math.max(MIN_HEIGHT, start.height - dy);
            top = start.bottom - height;
        }
        else if (edges.bottom)
            height = Math.max(MIN_HEIGHT, start.height + dy);
        if (edges.left)
        {
            width = Math.max(MIN_WIDTH, start.width - dx);
            left = start.right - width;
        }
        else if (edges.right)
            width = Math.max(MIN_WIDTH, start.width + dx);
        rect.value = { left, top, width, height };
    };
    const up = (): void =>
    {
        target.removeEventListener("pointermove", move);
        target.removeEventListener("pointerup", up);
    };
    target.addEventListener("pointermove", move);
    target.addEventListener("pointerup", up);
}

// A click on the background (still since the press) focuses the OK button, else Cancel, else Close
// (which takes the focus out of a field):
function click(e: MouseEvent): void
{
    const still = downAt !== null && Math.abs(downAt.x - e.clientX) < 3 && Math.abs(downAt.y - e.clientY) < 3;
    if (still && !inControl(e.target))
        (button("ok") ?? button("cancel") ?? button("close"))?.focus();
}

defineExpose({ button });
</script>

<template>
  <DialogRoot
    :open="open"
    @update:open="setOpen"
  >
    <DialogPortal>
      <DialogOverlay class="light-dialog-overlay" />
      <DialogContent
        ref="content"
        class="light-dialog"
        :class="{ 'buttons-to-side': buttonsToSide }"
        :style="[style, cursor !== null ? { cursor } : {}]"
        :aria-describedby="undefined"
        data-testid="light-dialog"
        @pointer-down-outside.prevent
        @interact-outside.prevent
        @pointerdown="pointerDown"
        @pointermove="pointerMove"
        @click="click"
        @keydown="keydown"
      >
        <VisuallyHidden>
          <DialogTitle>{{ label }}</DialogTitle>
        </VisuallyHidden>
        <div class="light-dialog-content">
          <slot />
        </div>
        <div
          class="light-dialog-buttons"
          :class="buttonsToSide ? 'side-button-bar' : 'button-bar'"
        >
          <button
            v-for="b in sortedButtons"
            :key="b"
            ref="buttonElements"
            type="button"
            :class="`${b}-button`"
            :data-button="b"
            @click.stop="press(b)"
          >
            {{ BUTTON_TEXT[b] }}
          </button>
        </div>
      </DialogContent>
    </DialogPortal>
  </DialogRoot>
</template>

<style>
/* From dialogs.scss (.light-dialog-pane, .side-button-bar), and JavaFX's modena.css for the padding.
   Java dims the grid under the dialog (brightness -0.2); here the whole window is dimmed. */
.light-dialog-overlay {
    position: fixed;
    inset: 0;
    background: rgb(0 0 0 / 0.2);
}
.light-dialog {
    position: fixed;
    left: 50%;
    top: 50%;
    transform: translate(-50%, -50%);
    display: flex;
    flex-direction: column;
    box-sizing: border-box;
    max-width: calc(100vw - 40px);
    max-height: calc(100vh - 40px);
    border: 1px solid rgb(40% 40% 40%);
    border-radius: 5px;
    background: var(--light-dialog-background);
    box-shadow: 5px 5px 5px rgb(0 0 0 / 0.2);
    font-family: var(--font-main);
    color: var(--text-color);
    cursor: move;
}
.light-dialog :is(input, button, select, textarea, a, [tabindex]:not(.light-dialog)) {
    cursor: auto;
}
.light-dialog.buttons-to-side {
    flex-direction: row;
}
.light-dialog-content {
    flex: 1;
    min-height: 0;
    overflow: auto;
    padding: 0.833em;
}
.light-dialog-buttons.button-bar {
    display: flex;
    justify-content: flex-end;
    gap: 0.5em;
    padding: 0.833em;
}
.light-dialog-buttons.side-button-bar {
    display: flex;
    flex-direction: column;
    gap: 20px;
    padding: 20px 20px 20px 8px;
}
</style>
