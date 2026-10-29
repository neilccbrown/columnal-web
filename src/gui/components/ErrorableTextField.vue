<script setup lang="ts" generic="T">
// Rebuild of xyz.columnal.utility.gui.ErrorableTextField (utility-gui): a text field whose text is
// converted to a value, or to an error (with quick fixes) or warnings, which outline the field and are
// shown in a popup while it has the focus (docs/gui-spec/errorable-text-field.md).  The conversion is
// in src/gui-logic/utility-gui/utility/gui/ErrorableTextField.ts.  The converter is re-run when the
// text changes, and when anything reactive it reads changes (Java: conversionDependencies).
import { PopoverAnchor, PopoverArrow, PopoverContent, PopoverPortal, PopoverRoot } from "reka-ui";
import { computed, shallowRef, useTemplateRef, watch } from "vue";
import type { ErrorableTextField } from "../../gui-logic/utility-gui/utility/gui/ErrorableTextField.js";
import { t } from "../i18n.js";
import StyledText from "./StyledText.vue";

// (Attributes such as aria-label go on the input)
defineOptions({ inheritAttrs: false });
const text = defineModel<string>("text", { default: "" });
const props = withDefaults(defineProps<{
    converter: (text: string) => ErrorableTextField.ConversionResult<T>,
    placeholder?: string,
    disabled?: boolean,
    editable?: boolean,
    // Which side of the field the popup is on (Java: withArrowLocation; its default, BOTTOM_CENTER,
    // puts the arrow at the bottom of the popup, so the popup above the field):
    popupSide?: "top" | "bottom" | "left" | "right",
}>(), {
    placeholder: undefined,
    disabled: false,
    editable: true,
    popupSide: "top",
});
const emit = defineEmits<{
    // Java: valueProperty(); also emitted at the start:
    "update:value": [value: T | null],
    // Java: addOnFocusLoss
    "focusLost": [value: T | null],
}>();

const field = useTemplateRef<HTMLInputElement>("field");
const converted = computed(() => props.converter(text.value));
const value = computed(() => converted.value.getValue());
const focused = shallowRef(false);
// No errors are shown until the text has changed or the field has lost the focus:
const suppressingErrors = shallowRef(true);
// The popup was hidden by Escape or a click elsewhere, until something changes:
const dismissed = shallowRef(false);
let lastFocusLeft = 0;

watch(text, () => { suppressingErrors.value = false; });
watch(value, v => emit("update:value", v), { immediate: true });
watch([converted, focused], () => { dismissed.value = false; });

const hasError = computed(() => converted.value.getError() !== null && !suppressingErrors.value);
const hasWarnings = computed(() => converted.value.getWarnings().length > 0 && !suppressingErrors.value);
const popupOpen = computed(() => (hasError.value || hasWarnings.value) && focused.value && !dismissed.value);

function focusChanged(isFocused: boolean): void
{
    focused.value = isFocused;
    if (!isFocused)
    {
        suppressingErrors.value = false;
        lastFocusLeft = Date.now();
        emit("focusLost", value.value);
    }
}

function setOpen(open: boolean): void
{
    if (!open)
        dismissed.value = true;
}

function popupClicked(e: MouseEvent): void
{
    if (e.button === 1)
        dismissed.value = true;
}

// A click on the field isn't outside the popup:
function interactOutside(event: Event): void
{
    if (event.target instanceof Node && field.value?.contains(event.target))
        event.preventDefault();
}

function setText(newText: string): void
{
    text.value = newText;
}

defineExpose({
    focus: () => field.value?.focus(),
    isFocused: () => focused.value,
    // Java: TimedFocusable
    lastFocusedTime: () => focused.value ? Date.now() : lastFocusLeft,
    value,
    setText,
});
</script>

<template>
  <PopoverRoot
    :open="popupOpen"
    @update:open="setOpen"
  >
    <PopoverAnchor as-child>
      <input
        ref="field"
        v-bind="$attrs"
        v-model="text"
        type="text"
        class="errorable-text-field"
        :class="{ 'has-error': hasError, 'has-warnings': hasWarnings }"
        :aria-invalid="hasError"
        :placeholder="placeholder"
        :disabled="disabled"
        :readonly="!editable"
        @focus="focusChanged(true)"
        @blur="focusChanged(false)"
      >
    </PopoverAnchor>
    <PopoverPortal>
      <PopoverContent
        class="errorable-text-field-popup"
        :class="{ 'has-error': hasError, 'has-warnings': hasWarnings }"
        :side="popupSide"
        :side-offset="4"
        :aria-label="t(hasError ? 'error.popup.title.error' : 'error.popup.title.warnings')"
        @open-auto-focus.prevent
        @close-auto-focus.prevent
        @interact-outside="interactOutside"
        @auxclick="popupClicked"
      >
        <div class="popup-error-pane">
          <div class="popup-error-text">
            <StyledText
              v-if="converted.getError() !== null"
              :text="converted.getError()!"
            /><span
              v-for="(warning, i) in converted.getWarnings()"
              :key="i"
            >{{ warning }}</span>
          </div>
          <div
            v-if="converted.getFixes().length > 0"
            class="quick-fix-list"
          >
            <div class="fix-list-heading">
              {{ t("error.fixes") }}
            </div>
            <div
              v-for="(fix, i) in converted.getFixes()"
              :key="i"
              class="quick-fix-row"
              :class="`key-F${i + 1}`"
              role="button"
              @mousedown.prevent
              @click="setText(fix.fixedValue)"
            >
              <StyledText :text="fix.fixDescription" />
            </div>
          </div>
        </div>
        <PopoverArrow
          class="errorable-text-field-popup-arrow"
          :width="16"
          :height="8"
        />
      </PopoverContent>
    </PopoverPortal>
  </PopoverRoot>
</template>

<style>
/* general.scss */
.errorable-text-field {
    border: 2px solid transparent;
}
.errorable-text-field.has-warnings {
    border-color: orange;
}
.errorable-text-field.has-error {
    border-color: var(--error-outline);
}
/* A ControlsFX PopOver, as HelpBox's, with the field's outline colour */
.errorable-text-field-popup {
    max-width: 400px;
    background: white;
    border: 2px solid rgb(0 0 0 / 0.3);
    border-radius: 6px;
    filter: drop-shadow(5px 5px 4px rgb(0 0 0 / 0.2));
    font-family: var(--font-main);
    z-index: 100;
}
.errorable-text-field-popup.has-warnings {
    border-color: orange;
}
.errorable-text-field-popup.has-error {
    border-color: var(--error-outline);
}
.errorable-text-field-popup-arrow {
    fill: white;
}
.popup-error-pane {
    padding: 0.5em 1em;
}
.errorable-text-field-popup .errorable-sub-explanation {
    color: rgb(60% 60% 60%);
    font-size: 80%;
}
.fix-list-heading {
    color: rgb(40% 40% 40%);
}
.quick-fix-row {
    padding-left: 2em;
    cursor: pointer;
}
.quick-fix-row .styled-text {
    text-decoration: underline;
    color: rgb(40% 40% 40%);
}
</style>
