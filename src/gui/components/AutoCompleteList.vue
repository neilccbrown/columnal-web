<script setup lang="ts" generic="C extends AutoComplete.Completion">
// The completions below a field (Java: AutoComplete's AutoCompleteWindow): 30 px rows, each with its
// text and description, in a list 400 px wide and at most 300 px high, shown while there are some.
// (docs/gui-spec/autocomplete.md)
import { PopoverAnchor, PopoverContent, PopoverPortal, PopoverRoot } from "reka-ui";
import type { AutoComplete } from "../../gui-logic/dialogs-non-expression/gui/dialog/AutoComplete.js";
import type { AutoCompleteState } from "./autoComplete.js";

const props = defineProps<{
    state: AutoCompleteState<C>,
    // The field it shows below
    anchor: HTMLElement | null,
}>();

const CELL_HEIGHT = 30;

function display(c: C): AutoComplete.CompletionContent
{
    return c.makeDisplay(props.state.text.value);
}
</script>

<template>
  <PopoverRoot :open="state.showing.value && state.completions.value.length > 0 && anchor !== null">
    <PopoverAnchor
      v-if="anchor !== null"
      :reference="anchor"
    />
    <PopoverPortal>
      <PopoverContent
        side="bottom"
        align="start"
        :side-offset="0"
        :avoid-collisions="false"
        class="autocomplete-popover"
        @open-auto-focus.prevent
        @close-auto-focus.prevent
        @interact-outside.prevent
        @escape-key-down.prevent
        @mouseup="state.listMouseUp"
      >
        <div
          class="autocomplete"
          role="listbox"
          :style="{ height: Math.min(300, 2 + CELL_HEIGHT * state.completions.value.length) + 'px' }"
        >
          <div
            v-for="(c, i) in state.completions.value"
            :key="i"
            class="completion-cell"
            :class="{ selected: i === state.selectedIndex.value }"
            role="option"
            :aria-selected="i === state.selectedIndex.value"
            @mousedown="state.cellMouseDown($event, i)"
          >
            <span class="completion-cell-text">{{ display(c).completion }}</span>
            <span class="completion-cell-description">{{ display(c).description }}</span>
          </div>
        </div>
      </PopoverContent>
    </PopoverPortal>
  </PopoverRoot>
</template>

<style>
/* (In a portal) autocomplete.scss: .autocomplete, .completion-cell, .completion-cell-description */
.autocomplete-popover {
    z-index: 1001;
}
.autocomplete {
    box-sizing: border-box;
    width: 400px;
    overflow-y: auto;
    background: var(--autocomplete-background-color);
    border: 1px solid var(--autocomplete-border-color);
    font-family: var(--font-main);
}
.autocomplete .completion-cell {
    box-sizing: border-box;
    height: 30px;
    padding: 0 6px;
    display: flex;
    align-items: center;
    gap: 10px;
    color: var(--text-color);
    cursor: default;
    white-space: nowrap;
}
.autocomplete .completion-cell.selected {
    background: var(--focus-color);
    color: var(--focus-color-text);
}
.autocomplete .completion-cell-description {
    color: var(--text-color-faint);
    font-size: 75%;
}
.autocomplete .completion-cell.selected .completion-cell-description {
    color: var(--focus-color-text-faint);
}
</style>
