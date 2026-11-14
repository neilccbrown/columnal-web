<script setup lang="ts" generic="C extends AutoComplete.Completion">
// A text field with completions below it (Java: AutoComplete on a TextField; see autoComplete.ts).
// (docs/gui-spec/autocomplete.md)
import { useTemplateRef } from "vue";
import type { AutoComplete } from "../../gui-logic/dialogs-non-expression/gui/dialog/AutoComplete.js";
import { useAutoComplete } from "./autoComplete.js";
import AutoCompleteList from "./AutoCompleteList.vue";

const text = defineModel<string>("text", { required: true });
const props = defineProps<{
    model: AutoComplete.Model<C>,
    fieldClass?: string,
    ariaLabel?: string,
    placeholder?: string,
    disabled?: boolean,
}>();
const emit = defineEmits<{
    focus: [],
    blur: [],
}>();

const input = useTemplateRef<HTMLInputElement>("input");
const state = useAutoComplete(props.model, text, () => input.value);

defineExpose({
    focus: (): void => input.value?.focus(),
    setContentDirect: state.setContentDirect,
    input: () => input.value,
});
</script>

<template>
  <input
    ref="input"
    type="text"
    class="text-field"
    :class="fieldClass"
    :value="text"
    :aria-label="ariaLabel"
    :placeholder="placeholder"
    :disabled="disabled"
    autocomplete="off"
    spellcheck="false"
    @input="state.onInput"
    @focus="() => { state.onFocus(); emit('focus'); }"
    @blur="() => { state.onBlur(); emit('blur'); }"
    @keydown="state.onKeyDown"
  >
  <AutoCompleteList
    :state="state"
    :anchor="input"
  />
</template>
