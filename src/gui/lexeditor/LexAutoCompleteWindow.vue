<script setup lang="ts">
// The completions shown below the editor's caret (Java: LexAutoCompleteWindow, the view of
// LexCompletionList), with the selected completion's further details beside them: a function
// documentation page, or HTML content (docs/gui-spec/lex-editor.md).  The list's model (selection,
// keys, choosing, scrolling and where each group shows) is the ported LexCompletionList: each group's
// first rows stay on screen as the list scrolls, with the later groups over the end of the earlier
// ones, which fade where they are cut off.
import { computed, nextTick, shallowRef, useTemplateRef, watch } from "vue";
import type { StyledString } from "../../engine/utility-error/styled/StyledString.js";
import { Pair } from "../../engine/utility-adt/utility/adt/Pair.js";
import type { LexCompletion } from "../../gui-logic/lex-editor-completion/gui/lexeditor/completion/LexCompletion.js";
import type { LexCompletionGroup } from "../../gui-logic/lex-editor-completion/gui/lexeditor/completion/LexCompletionGroup.js";
import { LexCompletionList } from "../../gui-logic/lex-editor-completion/gui/lexeditor/completion/LexCompletionList.js";
import FuncdocView from "../components/FuncdocView.vue";
import StyledText from "../components/StyledText.vue";

const props = defineProps<{
    groups: readonly LexCompletionGroup[],
    selected: LexCompletion | null,
    listView: LexCompletionList,
}>();
const emit = defineEmits<{
    // Clicking an example in the documentation: its text, to insert at the selected completion's start
    insert: [text: string],
    // After a click changed the list's selection or chose a completion
    clicked: [],
    // A middle click, which hides the completions (Java: the window's scene's filter)
    hide: [],
}>();

const list = useTemplateRef<HTMLElement>("list");
const ITEM_HEIGHT = LexCompletionList.ITEM_HEIGHT;
// Changed when the list is scrolled by its scroll bar or the mouse wheel
const scrolled = shallowRef(0);

interface Row
{
    readonly key: string;
    readonly y: number;
    readonly header: StyledString | null;
    readonly completion: LexCompletion | null;
    readonly groupIndex: number;
    readonly index: number;
}

// Java: LexCompletionList.layoutChildren, from the group positions
const layout = computed(() =>
{
    void scrolled.value;
    void props.selected;
    const height = props.listView.computePrefHeight();
    const groupTopY = props.listView.getGroupTopY();
    const rows: Row[] = [];
    const fades: number[] = [];
    props.groups.forEach((group, gi) =>
    {
        let y = groupTopY[gi] ?? 0;
        const maxY = gi + 1 < groupTopY.length ? groupTopY[gi + 1]! : height;
        if (group.header !== null)
        {
            rows.push({ key: gi + "-header", y, header: group.header, completion: null, groupIndex: gi, index: -1 });
            y += ITEM_HEIGHT;
        }
        group.completions.forEach((completion, ci) =>
        {
            const top = y + ci * ITEM_HEIGHT;
            if (top < maxY && top + ITEM_HEIGHT > 0)
                rows.push({ key: gi + "-" + ci, y: top, header: null, completion, groupIndex: gi, index: ci });
        });
        if ((groupTopY[gi] ?? 0) + ITEM_HEIGHT * (group.completions.length + (group.header !== null ? 1 : 0)) > maxY + 2)
            fades.push(maxY - ITEM_HEIGHT);
    });
    return { height, total: props.listView.getTotalHeight(), rows, fades };
});

// The list's scroll bar follows the model's scrolling (to show the selected item, or back to the top)
watch(() => [props.groups, props.selected], () => void nextTick(() =>
{
    const scroll = props.listView.getScrollPosition();
    if (list.value !== null && list.value.scrollTop !== scroll)
        list.value.scrollTop = scroll;
}), { immediate: true });

// Java: the scroll bar and the scroll events' updateScroll
function onScroll(): void
{
    if (list.value === null)
        return;
    props.listView.updateScroll(list.value.scrollTop);
    scrolled.value++;
}

function click(e: MouseEvent, groupIndex: number, index: number): void
{
    props.listView.clickOnItem(e.detail, new Pair(groupIndex, index));
    emit("clicked");
}

type Details = { readonly page: string } | { readonly html: string };
function details(completion: LexCompletion | null): Details | null
{
    const furtherDetails = completion?.furtherDetails ?? null;
    if (furtherDetails === null)
        return null;
    return furtherDetails.either<Details>(html => ({ html }), url => ({ page: url.getFirst() + (url.getSecond() === null ? "" : "#" + url.getSecond()) }));
}
</script>

<template>
  <!-- Clicks mustn't take the focus from the editor -->
  <div
    class="lex-complete-root"
    @mousedown.prevent
    @mouseup="e => { if (e.button === 1) emit('hide'); }"
  >
    <div
      ref="list"
      class="lex-completion-list"
      :style="{ height: layout.height + 'px' }"
      @scroll="onScroll"
    >
      <!-- The rows where the model puts them (kept in view as the list scrolls) -->
      <div
        class="lex-completion-rows"
        :style="{ height: layout.height + 'px' }"
      >
        <template
          v-for="row in layout.rows"
          :key="row.key"
        >
          <div
            v-if="row.completion === null"
            class="lex-completion lex-completion-header"
            :style="{ top: row.y + 'px' }"
          >
            <StyledText :text="row.header!" />
          </div>
          <div
            v-else
            class="lex-completion"
            :class="{ selected: row.completion === selected }"
            :style="{ top: row.y + 'px' }"
            @mousedown="click($event, row.groupIndex, row.index)"
          >
            <span class="lex-completion-text-flow"><StyledText :text="row.completion.display" /></span>
            <span class="side-text">{{ row.completion.sideText }}</span>
          </div>
        </template>
        <div
          v-for="(y, i) in layout.fades"
          :key="'fade-' + i"
          class="fade-overlay"
          :style="{ top: y + 'px' }"
        />
        <div class="lex-completion-border" />
      </div>
      <!-- So that the list scrolls through all the rows -->
      <div :style="{ height: Math.max(0, layout.total - layout.height) + 'px' }" />
    </div>
    <div
      v-if="details(selected) !== null"
      class="lex-webview-wrapper"
    >
      <FuncdocView
        v-if="'page' in details(selected)!"
        :page="(details(selected) as { page: string }).page"
        @insert="text => emit('insert', text)"
      />
      <!-- eslint-disable vue/no-v-html -->
      <div
        v-else
        class="lex-html-content"
        v-html="(details(selected) as { html: string }).html"
      />
      <!-- eslint-enable vue/no-v-html -->
    </div>
  </div>
</template>

<style scoped>
.lex-complete-root {
    display: flex;
    align-items: flex-start;
    font-family: var(--font-main);
    font-size: 10pt;
}
.lex-completion-list {
    width: 300px;
    overflow-y: auto;
    overflow-anchor: none;
    background: var(--autocomplete-background-color);
}
.lex-completion-rows {
    position: sticky;
    top: 0;
    overflow: hidden;
}
/* Java: the border drawn over everything */
.lex-completion-border {
    position: absolute;
    inset: 0;
    box-shadow: inset 0 0 0 1px var(--autocomplete-border-color);
    pointer-events: none;
}
.fade-overlay {
    position: absolute;
    left: 1px;
    right: 1px;
    margin-top: 1px;
    height: 24px;
    background: linear-gradient(to bottom, rgb(from var(--autocomplete-fade) r g b / 0%) 0%, rgb(from var(--autocomplete-fade) r g b / 0%) 60%, rgb(from var(--autocomplete-fade) r g b / 50%) 90%, rgb(from var(--autocomplete-fade) r g b / 80%) 100%);
    pointer-events: none;
}
/* (Inside the list's 1px border, as Java's -fx-padding: 1; so the text, after the row's 2px padding,
   is 3px in, and the editor puts the list 3px left of the completed text so they line up) */
.lex-completion {
    position: absolute;
    left: 1px;
    right: 1px;
    margin-top: 1px;
    box-sizing: border-box;
    height: 24px;
    padding: 0 2px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
    background: var(--autocomplete-background-color);
    color: var(--text-color);
    cursor: default;
    white-space: nowrap;
}
.lex-completion-text-flow {
    overflow: hidden;
    text-overflow: ellipsis;
}
.lex-completion-header {
    background: hsl(217 8% 95%);
    color: rgb(102 102 102);
    padding: 0 5px;
    border-bottom: 1px solid var(--autocomplete-background-color);
}
.side-text {
    color: rgb(128 128 128);
    font-size: 75%;
    padding: 2px;
}
.lex-completion.selected {
    background: var(--focus-color);
    color: var(--focus-color-text);
}
.lex-completion.selected .side-text {
    color: var(--focus-color-text-faint);
}
/* Java: 500 pixels wide, or 350 on a screen less than 1200 pixels wide */
.lex-webview-wrapper {
    width: 500px;
    max-height: 400px;
    overflow: auto;
    border: 1px solid var(--autocomplete-border-color);
    border-left: none;
    background: var(--autocomplete-background-color);
}
@media (max-width: 1199px) {
    .lex-webview-wrapper {
        width: 350px;
    }
}
</style>
