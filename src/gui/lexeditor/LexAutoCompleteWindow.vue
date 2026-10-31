<script setup lang="ts">
// The completions shown below the editor's caret (Java: LexAutoCompleteWindow, the view of
// LexCompletionList), with the selected completion's further details beside them: a function
// documentation page, or HTML content (docs/gui-spec/lex-editor.md).  The list's model (selection,
// keys, choosing) is the ported LexCompletionList.
import { nextTick, useTemplateRef, watch } from "vue";
import { Pair } from "../../engine/utility-adt/utility/adt/Pair.js";
import type { LexCompletion } from "../../gui-logic/lex-editor-completion/gui/lexeditor/completion/LexCompletion.js";
import type { LexCompletionGroup } from "../../gui-logic/lex-editor-completion/gui/lexeditor/completion/LexCompletionGroup.js";
import type { LexCompletionList } from "../../gui-logic/lex-editor-completion/gui/lexeditor/completion/LexCompletionList.js";
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
}>();

const list = useTemplateRef<HTMLElement>("list");

// Java: LexCompletionList scrolls to show the selected item
watch(() => props.selected, () => void nextTick(() =>
{
    list.value?.querySelector(".lex-completion.selected")?.scrollIntoView({ block: "nearest" });
}));

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
  >
    <div
      ref="list"
      class="lex-completion-list"
    >
      <template
        v-for="(group, gi) in groups"
        :key="gi"
      >
        <div
          v-if="group.header !== null && group.completions.length > 0"
          class="lex-completion lex-completion-header"
        >
          <StyledText :text="group.header" />
        </div>
        <div
          v-for="(completion, ci) in group.completions"
          :key="gi + '-' + ci"
          class="lex-completion"
          :class="{ selected: completion === selected }"
          @mousedown="click($event, gi, ci)"
        >
          <span class="lex-completion-text-flow"><StyledText :text="completion.display" /></span>
          <span class="side-text">{{ completion.sideText }}</span>
        </div>
      </template>
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
    max-height: 400px;
    overflow-y: auto;
    border: 1px solid var(--autocomplete-border-color);
    background: var(--autocomplete-background-color);
}
.lex-completion {
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
