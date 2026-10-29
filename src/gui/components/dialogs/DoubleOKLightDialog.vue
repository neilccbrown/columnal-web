<script setup lang="ts" generic="R">
// Rebuild of xyz.columnal.utility.gui.DoubleOKLightDialog (utility-gui): a LightDialog which checks the
// values when OK is pressed.  If they can't be saved, it shows the errors and stays; if they have
// errors but can be saved, it shows the errors and a prompt to press OK again, and a second OK without
// changes in between saves them anyway (docs/gui-spec/light-dialog.md).  Call notifyModified() when the
// values change.
import { PopoverAnchor, PopoverContent, PopoverPortal, PopoverRoot } from "reka-ui";
import { shallowRef, useTemplateRef, watch } from "vue";
import type { DialogButton, Validity } from "./dialogs.js";
import LightDialog from "./LightDialog.vue";

const open = defineModel<boolean>("open", { required: true });
const props = withDefaults(defineProps<{
    label: string,
    buttons?: readonly DialogButton[],
    buttonsToSide?: boolean,
    centreOn?: { readonly x: number, readonly y: number } | null,
    resizable?: boolean,
    checkValidity: () => Validity,
    showAllErrors: () => void,
    calculateResult: () => R | null,
}>(), {
    buttons: () => ["cancel", "ok"],
    buttonsToSide: false,
    centreOn: null,
    resizable: false,
});
const emit = defineEmits<{
    ok: [result: R | null],
    cancel: [],
}>();

const dialog = useTemplateRef<InstanceType<typeof LightDialog>>("dialog");
const promptOpen = shallowRef(false);
let modifiedSinceLastOK = true;
let lastOKPress = Date.now();

// (Java makes a new dialog each time)
watch(open, () =>
{
    promptOpen.value = false;
    modifiedSinceLastOK = true;
});

function okFilter(): boolean
{
    const prevModified = modifiedSinceLastOK;
    const validity = props.checkValidity();
    modifiedSinceLastOK = prevModified;
    let proceed = true;
    switch (validity)
    {
        case "IMPOSSIBLE_TO_SAVE":
            props.showAllErrors();
            proceed = false;
            break;
        case "ERROR_BUT_CAN_SAVE":
            if (modifiedSinceLastOK)
            {
                promptOpen.value = true;
                props.showAllErrors();
                modifiedSinceLastOK = false;
                proceed = false;
            }
            // A double-click on OK isn't two presses:
            else if (Date.now() < lastOKPress + 300)
                proceed = false;
            break;
        case "NO_ERRORS":
            break;
    }
    lastOKPress = Date.now();
    return proceed;
}

function ok(): void
{
    promptOpen.value = false;
    emit("ok", props.calculateResult());
}

function notifyModified(): void
{
    modifiedSinceLastOK = true;
}

defineExpose({ notifyModified });
</script>

<template>
  <LightDialog
    ref="dialog"
    v-model:open="open"
    :label="label"
    :buttons="buttons"
    :buttons-to-side="buttonsToSide"
    :centre-on="centreOn"
    :resizable="resizable"
    :ok-filter="okFilter"
    @ok="ok"
    @cancel="emit('cancel')"
  >
    <slot />
  </LightDialog>
  <PopoverRoot v-model:open="promptOpen">
    <PopoverAnchor :reference="dialog?.button('ok') ?? undefined" />
    <PopoverPortal>
      <PopoverContent
        class="ok-double-prompt"
        side="top"
        :side-offset="6"
        @open-auto-focus.prevent
        @close-auto-focus.prevent
      >
        Errors found. Click OK<br>again to save anyway
      </PopoverContent>
    </PopoverPortal>
  </PopoverRoot>
</template>

<style>
/* A ControlsFX PopOver, as HelpBox's */
.ok-double-prompt {
    padding: 0.5em 0.75em;
    background: white;
    border: 1px solid rgb(0 0 0 / 0.3);
    border-radius: 6px;
    filter: drop-shadow(5px 5px 4px rgb(0 0 0 / 0.2));
    font-family: var(--font-main);
    z-index: 100;
}
</style>
