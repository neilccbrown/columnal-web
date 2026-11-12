<script setup lang="ts">
// A JavaFX ListView of text items: a list box whose items are selected by clicking (with Shift for a
// range, and Ctrl/Cmd to add or remove one, if several can be selected) or with the arrow keys (Space
// selects the first, if none is), with a placeholder while it is empty.  A double click, or Enter, is
// passed on; so is a drop of items dragged from another list (Java: FXUtility.enableDragFrom/To).
import { shallowRef } from "vue";
import { isMac } from "../shortcuts.js";

const selected = defineModel<readonly string[]>("selected", { required: true });
const props = withDefaults(defineProps<{
    items: readonly string[],
    multiple?: boolean,
    placeholder?: string,
    // The drag format this list's items are dragged as, and the one it accepts drops of (or null)
    dragFormat?: string | null,
    dropFormat?: string | null,
}>(), {
    multiple: false,
    placeholder: "",
    dragFormat: null,
    dropFormat: null,
});
const emit = defineEmits<{
    doubleClick: [item: string],
    enter: [],
    dropped: [items: string[]],
}>();

// The focused item (Java: the focus model), from which Shift extends:
const focusIndex = shallowRef(-1);
const dropHover = shallowRef(false);

function selectIndex(index: number, e: { shiftKey: boolean, ctrlKey: boolean, metaKey: boolean } | null): void
{
    const item = props.items[index];
    if (item === undefined)
        return;
    const toggle = e !== null && (isMac() ? e.metaKey : e.ctrlKey);
    if (props.multiple && e?.shiftKey === true && focusIndex.value >= 0)
    {
        const [from, to] = [Math.min(focusIndex.value, index), Math.max(focusIndex.value, index)];
        selected.value = props.items.slice(from, to + 1);
        return;
    }
    if (props.multiple && toggle)
        selected.value = selected.value.includes(item) ? selected.value.filter(s => s !== item) : [...selected.value, item];
    else
        selected.value = [item];
    focusIndex.value = index;
}

function keydown(e: KeyboardEvent): void
{
    const count = props.items.length;
    if (count === 0)
        return;
    const current = focusIndex.value >= 0 && focusIndex.value < count ? focusIndex.value : -1;
    if (e.key === "ArrowDown" || e.key === "ArrowUp")
    {
        e.preventDefault();
        const next = current === -1 ? 0 : Math.max(0, Math.min(count - 1, current + (e.key === "ArrowDown" ? 1 : -1)));
        if (props.multiple && e.shiftKey && current !== -1)
        {
            const anchor = props.items.indexOf(selected.value[0] ?? "");
            const from = anchor === -1 ? current : anchor;
            selected.value = props.items.slice(Math.min(from, next), Math.max(from, next) + 1);
            focusIndex.value = next;
        }
        else
            selectIndex(next, null);
    }
    else if (e.key === " ")
    {
        e.preventDefault();
        if (selected.value.length === 0)
            selectIndex(current === -1 ? 0 : current, null);
    }
    else if (e.key === "Enter")
    {
        e.preventDefault();
        emit("enter");
    }
}

function dragStart(e: DragEvent, item: string): void
{
    if (props.dragFormat === null || e.dataTransfer === null)
        return;
    const items = selected.value.includes(item) ? [...selected.value] : [item];
    e.dataTransfer.setData(props.dragFormat, JSON.stringify(items));
    e.dataTransfer.effectAllowed = "move";
}

function accepts(e: DragEvent): boolean
{
    return props.dropFormat !== null && e.dataTransfer !== null && e.dataTransfer.types.includes(props.dropFormat);
}

function dragOver(e: DragEvent): void
{
    if (accepts(e))
    {
        e.preventDefault();
        dropHover.value = true;
    }
}

function drop(e: DragEvent): void
{
    dropHover.value = false;
    if (!accepts(e))
        return;
    e.preventDefault();
    const items = JSON.parse(e.dataTransfer!.getData(props.dropFormat!)) as unknown;
    if (Array.isArray(items))
        emit("dropped", items.filter((i): i is string => typeof i === "string"));
}
</script>

<template>
  <div
    class="list-view"
    :class="{ 'drop-hover': dropHover }"
    role="listbox"
    tabindex="0"
    :aria-multiselectable="multiple"
    @keydown="keydown"
    @dragover="dragOver"
    @dragleave="dropHover = false"
    @drop="drop"
  >
    <div
      v-for="(item, i) in items"
      :key="item"
      class="list-cell"
      :class="{ selected: selected.includes(item) }"
      role="option"
      :aria-selected="selected.includes(item)"
      :draggable="dragFormat !== null"
      @mousedown="e => selectIndex(i, e)"
      @dblclick="emit('doubleClick', item)"
      @dragstart="e => dragStart(e, item)"
    >
      {{ item }}
    </div>
    <div
      v-if="items.length === 0"
      class="list-view-placeholder"
    >
      {{ placeholder }}
    </div>
  </div>
</template>

<style scoped>
/* modena's .list-view */
.list-view {
    box-sizing: border-box;
    min-height: 100px;
    overflow: auto;
    border: 1px solid rgb(179 179 179);
    background: white;
    font-family: var(--font-main);
    outline: none;
}
.list-view:focus {
    border-color: var(--focus-color);
}
.list-view.drop-hover {
    background: rgb(235 240 250);
}
.list-cell {
    padding: 3px 5px;
    white-space: nowrap;
    cursor: default;
    user-select: none;
}
.list-cell:nth-child(even) {
    background: rgb(249 249 249);
}
.list-cell.selected {
    background: rgb(209 225 249);
}
.list-view:focus .list-cell.selected {
    background: var(--focus-color);
    color: white;
}
.list-view-placeholder {
    padding: 10px;
    color: rgb(102 102 102);
    text-align: center;
}
</style>
