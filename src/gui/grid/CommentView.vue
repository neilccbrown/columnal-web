<script setup lang="ts">
// A comment on the grid (Java: GridCommentDisplay's floating DocumentTextField): its text in a field
// over its cells, which can be edited, and resized by dragging its bottom right corner (when it isn't
// focused).  (docs/gui-spec/comments.md)
import { computed, shallowRef, useTemplateRef, watch } from "vue";
import { CellPosition } from "../../engine/data/data/CellPosition.js";
import { DisplayDocument } from "../../gui-logic/stf/gui/dtf/DisplayDocument.js";
import { VirtualGrid } from "../../gui-logic/stf/gui/grid/VirtualGrid.js";
import DocumentTextField from "../components/DocumentTextField.vue";
import type { VersionCounter } from "../store/EngineStore.js";
import type { GridCommentDisplay } from "./GridCommentDisplay.js";

const props = defineProps<{
    display: GridCommentDisplay,
    grid: VirtualGrid,
    layout: VersionCounter,
}>();

const ROW = VirtualGrid.rowHeight;

// Java: the comment's DisplayDocument, whose setAndSave sets the comment's content.  (In Java typing
// only changed the document, so typed text was never saved: a bug.  Here leaving the field sets the
// comment's content to what was typed.)
class CommentDocument extends DisplayDocument
{
    public override setAndSave(content: string): void
    {
        props.display.setContent(content);
    }

    public override focusChanged(focused: boolean): void
    {
        if (!focused && this.getText() !== props.display.info.content)
            this.setAndSave(this.getText());
    }
}

const document = shallowRef(new CommentDocument(props.display.info.content));
// (A new document is a new field)
const documentVersion = shallowRef(0);
const field = useTemplateRef<InstanceType<typeof DocumentTextField>>("field");
// The engine's content, as last shown (a change there, from pasting, shows):
let shownContent = props.display.info.content;
watch(() => { props.display.infoVersion.track(); return props.display.info.content; }, content =>
{
    if (content !== shownContent && field.value?.isFocused() !== true)
    {
        document.value = new CommentDocument(content);
        documentVersion.value++;
    }
    shownContent = content;
});
watch(() => props.display.focusRequests.track(), () => field.value?.focus());

// While resizing, the bottom right it would have (Java: currentDragBottomRight):
const dragBottomRight = shallowRef<CellPosition | null>(null);
const resizing = shallowRef(false);
const cursor = shallowRef<string | undefined>(undefined);

const box = computed(() =>
{
    props.layout.track();
    props.display.infoVersion.track();
    const info = props.display.info;
    const bottomRight = dragBottomRight.value ?? props.display.getBottomRight();
    const left = props.grid.sumColumnWidths(0, info.column);
    return {
        left,
        top: info.row * ROW,
        width: props.grid.sumColumnWidths(0, bottomRight.columnIndex + 1) - left,
        height: (bottomRight.rowIndex - info.row + 1) * ROW,
    };
});

// Java: getItemState: within 8 px of the bottom right corner, while not focused, the resize cursor
function nearCorner(e: PointerEvent): boolean
{
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
    return field.value?.isFocused() !== true && r.right - 8 <= e.clientX && e.clientX <= r.right && r.bottom - 8 <= e.clientY && e.clientY <= r.bottom;
}

// Java: VisibleBounds.getNearestTopLeftToScreenPos, the nearest cell corner to the point
function nearestTopLeft(e: PointerEvent): CellPosition
{
    const canvas = (e.currentTarget as HTMLElement).closest(".grid-canvas")!.getBoundingClientRect();
    const x = e.clientX - canvas.left;
    const y = e.clientY - canvas.top;
    let column = 0;
    while (props.grid.sumColumnWidths(0, column + 1) < x)
        column++;
    const fraction = (x - props.grid.sumColumnWidths(0, column)) / props.grid.getColumnWidth(column);
    return new CellPosition(CellPosition.row(Math.max(0, Math.round(y / ROW))), CellPosition.col(fraction < 0.5 ? column : column + 1));
}

function pointerDown(e: PointerEvent): void
{
    if (e.button === 0 && nearCorner(e))
    {
        resizing.value = true;
        (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
        e.preventDefault();
        e.stopPropagation();
    }
}

function pointerMove(e: PointerEvent): void
{
    if (resizing.value)
    {
        const pos = nearestTopLeft(e);
        const info = props.display.info;
        dragBottomRight.value = new CellPosition(CellPosition.row(Math.max(info.row, pos.rowIndex - 1)), CellPosition.col(Math.max(info.column, pos.columnIndex - 1)));
        return;
    }
    cursor.value = nearCorner(e) ? "se-resize" : undefined;
}

function pointerUp(): void
{
    if (resizing.value && dragBottomRight.value !== null)
        props.display.setBottomRight(dragBottomRight.value);
    resizing.value = false;
    dragBottomRight.value = null;
}
</script>

<template>
  <div
    class="grid-comment"
    :class="{ resizing }"
    :style="{ left: box.left + 'px', top: box.top + 'px', width: box.width + 'px', height: box.height + 'px', cursor }"
    :data-comment="display.info.id"
    @pointerdown.capture="pointerDown"
    @pointermove="pointerMove"
    @pointerup="pointerUp"
  >
    <DocumentTextField
      :key="documentVersion"
      ref="field"
      class="grid-comment-field"
      :document="document"
    />
  </div>
</template>

<style scoped>
/* virtual-grid.scss: .grid-comment-field */
.grid-comment {
    position: absolute;
    z-index: 1;
}
.grid-comment :deep(.grid-comment-field) {
    height: 100%;
    padding: 0 2px;
    white-space: pre-wrap;
    overflow-wrap: anywhere;
    background: var(--grid-comment);
    border-right: 1px solid var(--table-divider);
    border-bottom: 1px solid var(--table-divider);
    cursor: inherit;
}
.grid-comment:hover :deep(.grid-comment-field) {
    background: var(--grid-comment-hover);
}
.grid-comment :deep(.grid-comment-field:focus), .grid-comment.resizing :deep(.grid-comment-field) {
    background: var(--grid-comment);
}
</style>
