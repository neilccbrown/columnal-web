<script setup lang="ts" generic="T">
// Rebuild of xyz.columnal.utility.gui.FancyList (utility-gui): a list whose items can be selected,
// deleted with a little cross to the right (or Delete/Backspace), which slides them out, reordered by
// dragging, and added to with an Add button at the end (docs/gui-spec/fancy-list.md).  The cell slot
// shows an item (Java: makeCellContent), and calls setItem when it changes it (Java's value supplier).
import { computed, nextTick, shallowRef, useTemplateRef, watch } from "vue";
import { t } from "../i18n.js";
import { isMac } from "../shortcuts.js";

const props = withDefaults(defineProps<{
    items: readonly T[],
    allowDeleting?: boolean,
    allowReordering?: boolean,
    allowAdding?: boolean,
    // The item the Add button adds (Java: makeCellContent(Optional.empty(), true)):
    newItem?: () => T,
    addButtonText?: string,
}>(), {
    allowDeleting: true,
    allowReordering: true,
    allowAdding: true,
    newItem: undefined,
    addButtonText: undefined,
});
const emit = defineEmits<{
    "update:items": [items: T[]],
}>();
defineSlots<{
    cell(props: { item: T, index: number, editImmediately: boolean, setItem: (item: T) => void }): unknown,
}>();

interface Cell
{
    readonly id: number;
    value: T;
    readonly editImmediately: boolean;
}

let nextId = 0;
const cells = shallowRef<Cell[]>([]);
// Java: a BitSet of the selected cells' indices
const selection = shallowRef<ReadonlySet<number>>(new Set());
const hoverOverSelection = shallowRef(false);
const deleting = shallowRef<ReadonlySet<number>>(new Set());
// The index of the child (cells, then the end) that a drag would put the selection before, or -1:
const dragTarget = shallowRef(-1);
const container = useTemplateRef<HTMLElement>("container");
const addButton = useTemplateRef<HTMLButtonElement>("addButton");

const currentItems = computed(() => cells.value.map(c => c.value));

// Java: resetItems, when the items are changed from outside
watch(() => props.items, newItems =>
{
    if (newItems.length !== cells.value.length || newItems.some((item, i) => item !== cells.value[i]!.value))
        cells.value = newItems.map(value => ({ id: nextId++, value, editImmediately: false }));
}, { immediate: true });

function changed(): void
{
    emit("update:items", currentItems.value);
}

function setItem(cell: Cell, value: T): void
{
    cell.value = value;
    cells.value = [...cells.value];
    changed();
}

function select(index: number, e: PointerEvent): void
{
    const s = new Set(selection.value);
    if (isMac() ? e.metaKey : e.ctrlKey)
        s.add(index);
    else if (e.shiftKey)
    {
        if (!s.has(index))
        {
            const prev = Math.max(-1, ...[...s].filter(i => i < index));
            const next = Math.min(Infinity, ...[...s].filter(i => i > index));
            if (prev !== -1)
                for (let i = prev; i <= index; i++) s.add(i);
            else if (next !== Infinity)
                for (let i = index; i < next; i++) s.add(i);
            else
                s.add(index);
        }
    }
    else
    {
        s.clear();
        s.add(index);
    }
    selection.value = s;
}

function selectedCells(): Cell[]
{
    return cells.value.filter((_c, i) => selection.value.has(i));
}

/** Slides the cells out to the right, then removes them. */
function deleteCells(toDelete: readonly Cell[]): void
{
    if (toDelete.length === 0)
        return;
    deleting.value = new Set([...deleting.value, ...toDelete.map(c => c.id)]);
    setTimeout(() =>
    {
        const ids = new Set(toDelete.map(c => c.id));
        cells.value = cells.value.filter(c => !ids.has(c.id));
        deleting.value = new Set([...deleting.value].filter(id => !ids.has(id)));
        changed();
    }, 200);
}

function deleteClicked(cell: Cell, index: number): void
{
    deleteCells(selection.value.has(index) ? selectedCells() : [cell]);
}

function deleteHovered(index: number, entered: boolean): void
{
    if (selection.value.has(index))
        hoverOverSelection.value = entered;
}

function keydown(e: KeyboardEvent): void
{
    const editing = e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement
        || (e.target instanceof HTMLElement && e.target.isContentEditable);
    if (props.allowDeleting && !editing && !e.defaultPrevented && (e.key === "Delete" || e.key === "Backspace"))
    {
        e.preventDefault();
        deleteCells(selectedCells());
    }
}

const INTERACTIVE = "input, button, select, textarea, a, [contenteditable], [role=combobox], [role=listbox], .small-delete";

function childElements(): HTMLElement[]
{
    return [...(container.value?.querySelectorAll<HTMLElement>(":scope > [data-fancy-child]") ?? [])];
}

function findClosestDragTarget(clientY: number): number
{
    const children = childElements();
    for (let i = 0; i < children.length; i++)
    {
        const box = children[i]!.getBoundingClientRect();
        const rel = clientY - box.top;
        if (0 <= rel && rel <= box.height / 2.0)
            return i;
        else if (rel <= box.height)
            return Math.min(i + 1, children.length - 1);
    }
    return -1;
}

function dragSelectionTo(target: number): void
{
    target -= [...selection.value].filter(i => i < target).length;
    const selected = selectedCells();
    const rest = cells.value.filter((_c, i) => !selection.value.has(i));
    rest.splice(target, 0, ...selected);
    cells.value = rest;
    selection.value = new Set();
    changed();
}

/** A press on a cell (index) or on the list's background (null). */
function pointerDown(index: number | null, e: PointerEvent): void
{
    if (e.button !== 0 || (e.target instanceof Element && e.target.closest(INTERACTIVE) !== null))
        return;
    if (index === null)
        selection.value = new Set();
    else
        select(index, e);
    // (So that Delete goes to the list)
    container.value?.focus({ preventScroll: true });
    e.preventDefault();
    const target = container.value!;
    target.setPointerCapture(e.pointerId);
    let dragging = false;
    const move = (ev: PointerEvent): void =>
    {
        if (props.allowReordering)
        {
            dragging = true;
            dragTarget.value = findClosestDragTarget(ev.clientY);
        }
    };
    const up = (ev: PointerEvent): void =>
    {
        target.removeEventListener("pointermove", move);
        target.removeEventListener("pointerup", up);
        if (dragging && props.allowReordering)
        {
            const dropAt = findClosestDragTarget(ev.clientY);
            if (dropAt !== -1)
                dragSelectionTo(dropAt);
        }
        dragTarget.value = -1;
    };
    target.addEventListener("pointermove", move);
    target.addEventListener("pointerup", up);
}

function addToEnd(item: T, editImmediately: boolean): void
{
    cells.value = [...cells.value, { id: nextId++, value: item, editImmediately }];
    changed();
}

function addClicked(): void
{
    if (props.newItem !== undefined)
        addToEnd(props.newItem(), true);
}

async function focusAddButton(): Promise<void>
{
    await nextTick();
    addButton.value?.focus();
}

function clearSelection(): void
{
    selection.value = new Set();
}

defineExpose({ addToEnd, focusAddButton, clearSelection, items: currentItems });
</script>

<template>
  <div
    ref="container"
    class="fancy-list"
    tabindex="-1"
    data-testid="fancy-list"
    @pointerdown="pointerDown(null, $event)"
    @keydown="keydown"
  >
    <div
      v-for="(cell, index) in cells"
      :key="cell.id"
      data-fancy-child
      class="fancy-list-cell"
      :class="{
        even: index % 2 === 0,
        odd: index % 2 === 1,
        selected: selection.has(index),
        'my-hover-sel': hoverOverSelection && selection.has(index),
        'drag-target': dragTarget === index,
        deleting: deleting.has(cell.id),
      }"
      @pointerdown.stop="pointerDown(index, $event)"
    >
      <div class="fancy-list-cell-content">
        <slot
          name="cell"
          :item="cell.value"
          :index="index"
          :edit-immediately="cell.editImmediately"
          :set-item="(value: T) => setItem(cell, value)"
        />
      </div>
      <button
        v-if="allowDeleting"
        type="button"
        class="small-delete"
        tabindex="-1"
        aria-label="Delete"
        @click="deleteClicked(cell, index)"
        @mouseenter="deleteHovered(index, true)"
        @mouseleave="deleteHovered(index, false)"
      >
        <svg
          width="16"
          height="16"
          viewBox="-8 -8 16 16"
        ><circle
          class="small-delete-circle"
          r="8"
        /><path
          class="small-delete-cross"
          d="M -4 -4 L 4 4 M 4 -4 L -4 4"
        /></svg>
      </button>
    </div>
    <div
      data-fancy-child
      class="fancy-list-end"
      :class="{ 'drag-target': dragTarget === cells.length }"
    >
      <button
        v-if="allowAdding"
        ref="addButton"
        type="button"
        class="fancy-list-add"
        @click="addClicked"
      >
        {{ addButtonText ?? t("fancylist.add") }}
      </button>
    </div>
  </div>
</template>

<style>
/* dialogs.scss (as the table list and sort list dialogs have it) and general.scss (.small-delete) */
.fancy-list {
    display: flex;
    flex-direction: column;
    overflow-x: hidden;
    overflow-y: auto;
    border: 1px solid var(--control-border);
    background: var(--control-background);
    outline: none;
}
.fancy-list-cell {
    display: flex;
    align-items: center;
    border-top: 2px solid transparent;
    transition: transform 200ms linear;
}
.fancy-list-cell.even {
    background: var(--list-even);
}
.fancy-list-cell.odd {
    background: var(--list-odd);
}
.fancy-list-cell.selected {
    background: var(--focus-color);
    color: var(--focus-color-text);
}
.fancy-list-cell.deleting {
    transform: translateX(100%);
}
.fancy-list-cell-content {
    flex: 1;
    min-width: 0;
}
.fancy-list-end {
    flex: 1;
    border-top: 1px solid black;
}
:is(.fancy-list-cell, .fancy-list-end).drag-target {
    border-top: 2px dashed black;
}
.fancy-list-add {
    margin: 6px;
    display: block;
    margin-inline: auto;
}
.small-delete {
    display: inline-flex;
    margin: 0 8px 0 4px;
    padding: 0;
    border: none;
    background: none;
    cursor: pointer;
}
.small-delete-circle {
    fill: transparent;
}
.small-delete:hover .small-delete-circle, .fancy-list-cell.my-hover-sel .small-delete-circle {
    fill: darkred;
}
.small-delete-cross {
    stroke-width: 2;
    stroke: grey;
}
.small-delete:hover .small-delete-cross, .fancy-list-cell.my-hover-sel .small-delete-cross, .fancy-list-cell.selected .small-delete-cross {
    stroke: white;
}
</style>
