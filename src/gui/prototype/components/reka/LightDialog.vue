<script setup lang="ts">
// Reka UI version of LightDialog: a modal dialog over the dimmed window, moved by dragging.
import { DialogContent, DialogOverlay, DialogPortal, DialogRoot, DialogTitle } from "reka-ui";
import { useDraggable } from "../useDraggable.js";

const open = defineModel<boolean>("open", { required: true });
defineProps<{ title: string }>();
const emit = defineEmits<{ ok: [] }>();
const drag = useDraggable();

function ok(): void
{
    emit("ok");
    open.value = false;
}
</script>

<template>
  <DialogRoot
    v-model:open="open"
    @update:open="drag.reset()"
  >
    <DialogPortal>
      <DialogOverlay class="dialog-overlay" />
      <DialogContent
        class="light-dialog"
        :style="drag.style.value"
        :aria-describedby="undefined"
        @pointerdown="drag.onPointerDown"
      >
        <DialogTitle class="light-dialog-title">
          {{ title }}
        </DialogTitle>
        <slot />
        <div class="light-dialog-buttons">
          <button @click="open = false">
            Cancel
          </button>
          <button @click="ok">
            OK
          </button>
        </div>
      </DialogContent>
    </DialogPortal>
  </DialogRoot>
</template>
