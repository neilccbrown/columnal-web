<script setup lang="ts">
// Java: ImportChoicesDialog (importers): the import's choices at the top (ImporterGUI's rows); the
// original data on the left and a preview of the imported table on the right, which scroll together;
// below, "Undo area", "Reset area" and the area's description.  The area of the original to import (its
// trim) is outlined, and dragged to change (its edges or corners, or a new area from where the mouse
// is pressed); the preview sits beside it, its rows level with the area's.  OK imports with the last
// preview's format; Enter and Escape do nothing (docs/gui-spec/importing.md).
import { computed, nextTick, onMounted, shallowRef, useTemplateRef, watch } from "vue";
import { SelectContent, SelectItem, SelectItemText, SelectPortal, SelectRoot, SelectTrigger, SelectValue, SelectViewport } from "reka-ui";
import { ignoreClosed } from "../../engine/EngineClient.js";
import type { ImportChoiceInfo, ImportPreview, ImportTrim } from "../../engine/protocol.js";
import { useEngine } from "../../engine/useEngine.js";
import HelpBox from "../../components/HelpBox.vue";
import LightDialog from "../../components/dialogs/LightDialog.vue";
import { makeId } from "../../components/menus/menus.js";
import { t } from "../../i18n.js";
import ImportGrid, { type GridTable } from "./ImportGrid.vue";
import { boundsOf, describe, dragged, edgesAt, NO_TRIM, trimOf, TrimUndo, type Bounds, type Edges } from "./importTrim.js";

const props = defineProps<{
    session: number,
    suggestedName: string,
    choices: readonly ImportChoiceInfo[],
}>();
const emit = defineEmits<{
    closed: [],
}>();

const engine = useEngine();
const open = shallowRef(true);
const ROW = 24;
const WIDTH = 100;

// --- The choices (Java: the import's getGUI) ---------------------------------------------------

// Each combo box's item, the "Other..." text, its error, and each check box:
const selected = shallowRef(props.choices.map(c => c.kind === "combo" ? c.selected : 0));
const otherText = shallowRef(props.choices.map(() => ""));
const otherError = shallowRef<(string | null)[]>(props.choices.map(() => null));
const checked = shallowRef(props.choices.map(c => c.kind === "check" && c.checked));

async function changeChoice(index: number): Promise<void>
{
    const c = props.choices[index]!;
    const change = c.kind === "check" ? { checked: checked.value[index]! } : { selected: selected.value[index]!, otherText: otherText.value[index]! };
    const result = await engine.client.request("importChoice", props.session, index, change);
    otherError.value = otherError.value.map((e, i) => i === index ? result.error : e);
    if (result.changed)
        await loadSource();
}

function setSelected(index: number, value: string): void
{
    selected.value = selected.value.map((s, i) => i === index ? Number(value) : s);
    void changeChoice(index).catch(ignoreClosed);
}

const isOther = (index: number): boolean =>
{
    const c = props.choices[index]!;
    return c.kind === "combo" && c.other && selected.value[index] === c.items.length - 1;
};

// --- The source, its area, and the preview -----------------------------------------------------

const src = shallowRef<GridTable | null>(null);
const dest = shallowRef<GridTable | null>(null);
const srcRows = computed(() => src.value?.rows.length ?? 0);
const srcColumns = computed(() => src.value?.columns.length ?? 0);
// Java: SrcDataDisplay's trim, and the area shown (which follows the mouse while dragging):
const trim = shallowRef<ImportTrim>(NO_TRIM);
const area = shallowRef<Bounds>(boundsOf(NO_TRIM, 0, 0));
const description = shallowRef("");
// Java: curGuessTrim, and whether Reset area is enabled (once a source has loaded):
let guessTrim: ImportTrim | null = null;
const resetDisabled = shallowRef(true);
const undo = new TrimUndo();
let loads = 0;
let previews = 0;

const asTable = (p: ImportPreview): GridTable | null => p.kind === "table" ? { columns: p.columns, rows: p.rows } : null;

// Java: the listener on the source format (called at first, and when it changes): the source loaded
async function loadSource(): Promise<void>
{
    const n = ++loads;
    const loaded = await engine.client.request("importSource", props.session);
    if (n !== loads)
        return;
    if (loaded.kind === "none")
    {
        // (Java: no source format, so no preview)
        dest.value = null;
        return;
    }
    if (loaded.kind === "error")
    {
        src.value = null;
        setTrim(trim.value, true);
        await updateDestPreview();
        return;
    }
    const oldColumns = srcColumns.value;
    guessTrim = loaded.trim;
    resetDisabled.value = false;
    src.value = asTable(loaded);
    // We use trim guess if size has changed from before:
    if (oldColumns !== loaded.columns.length)
        setTrim(loaded.trim!, true);
    else
        setTrim(trim.value, true);
    // (Java: then, once the columns are shown, numRowsChanged: setTrim(trim, true) again, and a preview)
    // PORT-NOTE: possible Java bug, kept: so the area is added to the undo chain twice, and the first
    // "Undo area" after a source loads changes nothing.
    setTrim(trim.value, true);
    await updateDestPreview();
}

// Java: updateDestPreview
async function updateDestPreview(): Promise<void>
{
    const n = ++previews;
    const loaded = await engine.client.request("importDest", props.session, trim.value);
    if (n !== previews || loaded.kind === "none")
        return;
    dest.value = asTable(loaded);
}

// Java: SrcDataDisplay.setTrim
function setTrim(newTrim: ImportTrim, addToUndoChain: boolean): void
{
    if (addToUndoChain)
        undo.replacing(trim.value);
    trim.value = newTrim;
    area.value = boundsOf(newTrim, srcRows.value, srcColumns.value);
    description.value = describe(area.value, srcRows.value, srcColumns.value);
}

// Java: undoSelectionChange and resetSelectionChange
function undoArea(): void
{
    const recent = undo.pop();
    if (recent !== null)
        setTrim(recent, false);
}

function resetArea(): void
{
    if (guessTrim !== null)
        setTrim(guessTrim, true);
}

// The preview, placed two rows above the area (so its rows are level with it), at its left (Java: setTrim's destData.setPosition):
const destAt = computed(() =>
{
    const b = boundsOf(trim.value, srcRows.value, srcColumns.value);
    return { row: b.top - 2, column: b.left };
});
const extent = computed(() => ({ rows: 3 + srcRows.value, columns: 2 + srcColumns.value }));

// --- Dragging the area (Java: SrcDataDisplay's mousePane) --------------------------------------

const srcGrid = useTemplateRef<InstanceType<typeof ImportGrid>>("srcGrid");
const destGrid = useTemplateRef<InstanceType<typeof ImportGrid>>("destGrid");
const scroll = shallowRef({ top: 0, left: 0 });
watch(scroll, () => void nextTick(() =>
{
    srcGrid.value?.applyScroll();
    destGrid.value?.applyScroll();
}));

const cursor = shallowRef("default");
let edges: Edges = { top: false, bottom: false, left: false, right: false };
let pressed = { row: 0, column: 0 };
let pendingTrim: ImportTrim | null = null;
let dragging = false;

// The area's box, in the canvas (Java: curBoundingBox):
const areaBox = computed(() => ({ x: area.value.left * WIDTH, y: area.value.top * ROW, width: (area.value.right + 1 - area.value.left) * WIDTH, height: (area.value.bottom + 1 - area.value.top) * ROW }));

// A pointer event's point in the canvas
function canvasPoint(e: PointerEvent): { x: number, y: number }
{
    const canvas = (e.currentTarget as HTMLElement).getBoundingClientRect();
    return { x: e.clientX - canvas.left, y: e.clientY - canvas.top };
}

// Java: VisibleBounds.getNearestTopLeftToScreenPos: the cell whose top left corner is nearest
function nearestTopLeft(p: { x: number, y: number }): { row: number, column: number }
{
    return { row: Math.max(0, Math.min(extent.value.rows, Math.round(p.y / ROW))), column: Math.max(0, Math.min(extent.value.columns, Math.round(p.x / WIDTH))) };
}

function pointerMove(e: PointerEvent): void
{
    const p = canvasPoint(e);
    if (!dragging)
    {
        const at = edgesAt(areaBox.value, p.x, p.y);
        cursor.value = at.cursor;
        edges = at.edges;
        return;
    }
    const next = dragged(area.value, edges, nearestTopLeft(p), pressed);
    if (next === null)
        return;
    area.value = next;
    pendingTrim = trimOf(next, srcRows.value, srcColumns.value);
    description.value = describe(next, srcRows.value, srcColumns.value);
}

function pointerDown(e: PointerEvent): void
{
    if (e.button !== 0)
        return;
    pendingTrim = null;
    dragging = true;
    try
    {
        (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    }
    catch (_e)
    {
        // (No such pointer: an event made by a test)
    }
    const pos = nearestTopLeft(canvasPoint(e));
    pressed = { row: Math.max(2, pos.row), column: pos.column };
}

function pointerUp(e: PointerEvent): void
{
    if (!dragging)
        return;
    dragging = false;
    const p = canvasPoint(e);
    const at = edgesAt(areaBox.value, p.x, p.y);
    cursor.value = at.cursor;
    edges = at.edges;
    if (pendingTrim !== null)
    {
        setTrim(pendingTrim, true);
        void updateDestPreview().catch(ignoreClosed);
    }
    else
        setTrim(trim.value, true);
}

// PORT-NOTE: possible Java bug, kept: the buttons only set the trim (setTrim), so the preview isn't
// remade for the area they set (it moves, but shows the old area's rows), and OK then imports the old
// area.
function undoClicked(): void
{
    undoArea();
}

function resetClicked(): void
{
    resetArea();
}

onMounted(() => void loadSource().catch(ignoreClosed));

let closing = false;
function close(ok: boolean): void
{
    if (closing)
        return;
    closing = true;
    void engine.client.request("importClose", props.session, ok).catch(ignoreClosed);
    emit("closed");
}

watch(open, isOpen =>
{
    if (!isOpen)
        close(false);
});

// (Java: the biggest screen's size, less 100)
const size = { width: Math.max(400, window.innerWidth - 100) + "px", height: Math.max(300, window.innerHeight - 100) + "px" };

defineExpose({
    _test_trim: () => trim.value,
    _test_area: () => area.value,
});
</script>

<template>
  <LightDialog
    v-model:open="open"
    :label="'Import ' + suggestedName"
    resizable
    :close-on-escape="false"
    :default-button="false"
    @ok="close(true)"
  >
    <div
      class="guess-format-content"
      :style="size"
    >
      <div class="import-choices">
        <template
          v-for="(c, i) in choices"
          :key="i"
        >
          <label class="import-choice-label">{{ t(c.labelKey) }}</label>
          <HelpBox :help-id="c.helpId" />
          <div class="import-choice">
            <span
              v-if="c.kind === 'label'"
              class="import-choice-text"
            >{{ c.text }}</span>
            <template v-else-if="c.kind === 'combo'">
              <SelectRoot
                :model-value="String(selected[i])"
                @update:model-value="v => setSelected(i, String(v))"
              >
                <SelectTrigger
                  class="import-choice-combo"
                  :class="makeId(c.labelKey)"
                  :aria-label="t(c.labelKey)"
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectPortal>
                  <SelectContent
                    class="import-choice-list"
                    position="popper"
                  >
                    <SelectViewport>
                      <SelectItem
                        v-for="(item, j) in c.items"
                        :key="j"
                        :value="String(j)"
                        class="import-choice-item"
                      >
                        <SelectItemText>{{ item }}</SelectItemText>
                      </SelectItem>
                    </SelectViewport>
                  </SelectContent>
                </SelectPortal>
              </SelectRoot>
              <input
                v-if="isOther(i)"
                v-model="otherText[i]"
                type="text"
                class="text-field import-choice-other"
                :aria-label="t(c.labelKey)"
                @input="void changeChoice(i).catch(ignoreClosed)"
              >
              <span
                v-if="isOther(i) && otherError[i] !== null"
                class="error-label"
              >{{ otherError[i] }}</span>
            </template>
            <input
              v-else
              v-model="checked[i]"
              type="checkbox"
              class="check-box"
              :aria-label="t(c.labelKey)"
              @change="void changeChoice(i).catch(ignoreClosed)"
            >
          </div>
        </template>
      </div>
      <div class="import-split-labels">
        <label>{{ t("import.src.grid.label") }}</label>
        <svg
          class="import-arrow-svg"
          width="42"
          height="18"
        ><path
          class="import-arrow"
          d="M 0 9 L 40 9 L 32 1 M 32 17 L 40 9"
        /></svg>
        <label>{{ t("import.dest.grid.label") }}</label>
      </div>
      <div class="import-split">
        <ImportGrid
          ref="srcGrid"
          v-model:scroll="scroll"
          class="import-src-grid"
          :table="src"
          :types="false"
          :at="{ row: 1, column: 1 }"
          :extent="extent"
        >
          <div
            class="import-mouse-pane"
            :style="{ cursor, width: extent.columns * WIDTH + 'px', height: extent.rows * ROW + 'px' }"
            @pointermove="pointerMove"
            @pointerdown="pointerDown"
            @pointerup="pointerUp"
          >
            <div
              v-if="src !== null"
              class="prospective-import-rectangle"
              :style="{ left: areaBox.x + 'px', top: areaBox.y + 'px', width: areaBox.width + 'px', height: areaBox.height + 'px' }"
            />
          </div>
        </ImportGrid>
        <ImportGrid
          ref="destGrid"
          v-model:scroll="scroll"
          class="import-dest-grid"
          :table="dest"
          :types="true"
          :at="destAt"
          :extent="extent"
        />
      </div>
      <div class="import-undo-reset-panel">
        <button
          type="button"
          class="id-undo-import-selection-change"
          @click="undoClicked"
        >
          {{ t("undo.import.selection.change") }}
        </button>
        <button
          type="button"
          class="id-reset-import-selection"
          :disabled="resetDisabled"
          @click="resetClicked"
        >
          {{ t("reset.import.selection") }}
        </button>
        <span class="import-selection-description">{{ description }}</span>
      </div>
    </div>
  </LightDialog>
</template>

<style scoped>
/* guess-format.scss */
.guess-format-content {
    display: flex;
    flex-direction: column;
    gap: 6px;
    min-width: 400px;
    min-height: 300px;
    max-width: calc(100vw - 60px);
    max-height: calc(100vh - 120px);
}
.import-choices {
    display: grid;
    grid-template-columns: max-content max-content 1fr;
    align-items: center;
    gap: 4px 6px;
}
.import-choice {
    display: flex;
    align-items: center;
    gap: 6px;
}
/* (As the Check dialog's combo box) */
.import-choice-combo {
    min-width: 150px;
    padding: 3px 8px;
    font: inherit;
    text-align: left;
}
.import-choice-list {
    z-index: 1000;
    padding: 2px 0;
    border: 1px solid #aaa;
    background: white;
    font-family: var(--font-main);
}
.import-choice-item {
    padding: 3px 8px;
    cursor: default;
}
.import-choice-item[data-highlighted] {
    background: #3875d7;
    color: white;
}
.import-split-labels {
    display: flex;
    align-items: center;
    justify-content: space-between;
}
.import-arrow {
    fill: none;
    stroke: black;
    stroke-width: 2;
}
.import-split {
    display: flex;
    flex: 1;
    min-height: 0;
    gap: 4px;
}
.import-src-grid, .import-dest-grid {
    flex: 1;
    min-width: 0;
}
.import-mouse-pane {
    position: absolute;
    left: 0;
    top: 0;
    touch-action: none;
}
.prospective-import-rectangle {
    position: absolute;
    box-sizing: border-box;
    border: 3px solid black;
    pointer-events: none;
}
.import-undo-reset-panel {
    display: flex;
    align-items: center;
    gap: 8px;
}
.import-selection-description {
    white-space: pre;
}
</style>
