<script setup lang="ts">
// A transformation's "hat" (Java: TableHat's TableHatDisplay, a floating item): the text describing it
// (made in the engine: src/gui-logic/app/gui/table/app/TableHat.ts), above its table if there is
// room, with a button to collapse it to just the transformation's kind (docs/gui-spec/tables.md).
import { nextTick, onBeforeUnmount, onMounted, shallowRef, useTemplateRef, watch } from "vue";
import type { HatLink, HatSegment, TableHatInfo } from "../engine/protocol.js";
import { t } from "../i18n.js";
import { VirtualGrid } from "../../gui-logic/stf/gui/grid/VirtualGrid.js";

const props = defineProps<{
    hat: TableHatInfo,
    tableId: string,
    // On the canvas:
    tableLeft: number,
    tableTop: number,
    wholeTableWidth: number,
    tableNameWidth: number,
}>();
const emit = defineEmits<{
    // A source link's middle click (Java: selects the source table)
    selectTable: [tableId: string],
    // A link's primary click (Java: its Clickable's onClick), at the point on the screen
    linkClicked: [link: HatLink, point: { readonly x: number, readonly y: number }],
    // A source link (or Concatenate's tables) hovered (after 300 ms, as Java's Clickable), at the point
    // on the grid's canvas, or no longer hovered (null)
    hoverSource: [hover: { readonly tableIds: readonly string[], readonly at: { readonly x: number, readonly y: number } } | null],
}>();

const collapsed = shallowRef(false);
const element = useTemplateRef<HTMLElement>("element");
const box = shallowRef<{ x: number, y: number, width: number, height: number } | null>(null);

/**
 * Java: TableHat.calculatePosition.  Above the table if it fits there (as wide as the table, less an
 * indent, but at least 200 px, and no wider than its text); otherwise over the table's header, right of
 * the table name, if that leaves the column names clear; otherwise over the table name.
 */
function layout(): void
{
    const el = element.value;
    if (el === null)
        return;
    const INDENT = 20;
    const MIN_WIDTH = 200;
    // (The grid's top, on the canvas)
    const veryTopY = 0;
    const tableX = props.tableLeft;
    const tableY = props.tableTop;
    const columnTopY = props.tableTop + VirtualGrid.rowHeight;
    const wholeTableWidth = props.wholeTableWidth;
    // (JavaFX's prefWidth and prefHeight, measured)
    const prefHeight = (width: number): number =>
    {
        el.style.width = width + "px";
        return el.getBoundingClientRect().height;
    };
    el.style.width = "max-content";
    // (Rounded up, so that the text fits on one line at this width)
    const idealWidth = Math.ceil(el.getBoundingClientRect().width);
    const idealWidthAbove = Math.min(Math.max(MIN_WIDTH, wholeTableWidth - INDENT), idealWidth);
    const heightAbove = prefHeight(idealWidthAbove);
    let result: { x: number, y: number, width: number, height: number };
    if (tableY - heightAbove >= veryTopY - 2)
    {
        // Just about fit without overlapping table header; do it!
        result = { x: tableX + INDENT, y: Math.max(veryTopY, tableY - heightAbove - 5), width: idealWidthAbove, height: heightAbove };
    }
    else
    {
        // Now try the overlapping options.  First, try overlapping the table name:
        const widthWithoutOverlappingTableName = Math.min(wholeTableWidth - INDENT - props.tableNameWidth, idealWidth);
        const heightWithoutOverlappingTableName = prefHeight(widthWithoutOverlappingTableName);
        if (columnTopY - heightWithoutOverlappingTableName >= veryTopY)
            result = { x: tableX + INDENT + props.tableNameWidth, y: veryTopY + 2, width: widthWithoutOverlappingTableName, height: heightWithoutOverlappingTableName };
        else
            // Running out of options, overlap table name and hope we don't overlap the column names too badly:
            result = { x: tableX + INDENT, y: veryTopY + 2, width: idealWidthAbove, height: heightAbove };
    }
    el.style.width = "";
    box.value = result;
}

onMounted(layout);
watch(() => [props.hat, props.tableLeft, props.tableTop, props.wholeTableWidth, props.tableNameWidth, collapsed.value], () => void nextTick(layout));
// (The fonts can change the text's size once they load)
void document.fonts.ready.then(() => layout());

function segmentClicked(segment: HatSegment, e: MouseEvent): void
{
    if (e.button === 0 && segment.link !== null)
    {
        e.stopPropagation();
        emit("linkClicked", segment.link, { x: e.clientX, y: e.clientY });
    }
    // Java: the middle button on a source link selects the source table
    else if (e.button === 1 && segment.link?.kind === "source" && !segment.link.broken)
    {
        e.preventDefault();
        e.stopPropagation();
        emit("selectTable", segment.link.tableId);
    }
}

// Java: editSourceLink's Clickable.setHovering, which highlights the source table
let hoverTimer: ReturnType<typeof setTimeout> | null = null;
function segmentEntered(segment: HatSegment, e: MouseEvent): void
{
    segmentLeft();
    const link = segment.link;
    const tableIds = link?.kind === "source" ? [link.tableId] : link?.kind === "edit" ? link.tables : [];
    if (tableIds.length === 0)
        return;
    const canvas = (e.currentTarget as HTMLElement).closest(".grid-canvas")?.getBoundingClientRect();
    if (canvas === undefined)
        return;
    const at = { x: e.clientX - canvas.left, y: e.clientY - canvas.top };
    hoverTimer = setTimeout(() =>
    {
        hoverTimer = null;
        emit("hoverSource", { tableIds, at });
    }, 300);
}

function segmentLeft(): void
{
    if (hoverTimer !== null)
        clearTimeout(hoverTimer);
    hoverTimer = null;
    emit("hoverSource", null);
}

onBeforeUnmount(segmentLeft);

// Java: the middle button anywhere on the hat toggles it
function hatClicked(e: MouseEvent): void
{
    if (e.button === 1)
    {
        e.preventDefault();
        collapsed.value = !collapsed.value;
    }
}
</script>

<template>
  <div
    ref="element"
    class="table-hat"
    :class="{ collapsed }"
    :data-table="tableId"
    :style="box === null ? { left: tableLeft + 20 + 'px', top: tableTop + 'px', visibility: 'hidden' } : { left: box.x + 'px', top: box.y + 'px', width: box.width + 'px', minHeight: box.height + 'px' }"
    @mousedown="e => { if (e.button === 1) e.preventDefault(); }"
    @auxclick="hatClicked"
  >
    <span class="table-hat-text-flow"><template v-if="collapsed"><span class="styled-text">{{ hat.collapsed }}</span></template><template
      v-for="(segment, i) in hat.content"
      v-else
      :key="i"
    ><span
      :class="segment.classes"
      :title="segment.link === null ? undefined : segment.link.kind === 'source' ? t('source.link.tooltip') : segment.link.tooltipKey !== null ? t(segment.link.tooltipKey) : undefined"
      @click="segmentClicked(segment, $event)"
      @auxclick="segmentClicked(segment, $event)"
      @mouseenter="segmentEntered(segment, $event)"
      @mouseleave="segmentLeft"
    >{{ segment.text }}</span></template><span
      class="table-hat-collapse"
      :title="collapsed ? 'Show detail' : 'Hide detail'"
      @click.stop="collapsed = !collapsed"
    >{{ collapsed ? " ►" : " ◄" }}</span></span>
  </div>
</template>

<style scoped>
/* virtual-grid.scss: .table-hat, .table-hat-text-flow */
.table-hat {
    position: absolute;
    z-index: 4;
    box-sizing: border-box;
    padding: 4px;
    border: 1px solid var(--table-row-label-border-color);
    border-radius: 5px;
    background: var(--table-row-label-background-color);
    box-shadow: 1px 1px 6px rgb(179 179 179 / 0.6);
    font-family: var(--font-main);
    font-size: 90%;
    line-height: 1.3;
    color: var(--table-row-label-text-color);
    white-space: pre-wrap;
    overflow-wrap: break-word;
}
.table-hat :deep(.styled-text-clickable) {
    text-decoration: underline;
    cursor: pointer;
}
.table-hat-collapse {
    cursor: pointer;
}
.table-hat-collapse:hover {
    color: rgb(166 166 166);
}
</style>
