<script setup lang="ts">
// Ark UI version of LightDialog: a modal dialog over the dimmed window, moved by dragging.
import { Dialog } from "@ark-ui/vue/dialog";
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
  <Dialog.Root
    v-model:open="open"
    @open-change="drag.reset()"
  >
    <Teleport to="body">
      <Dialog.Backdrop class="dialog-overlay" />
      <Dialog.Positioner>
        <Dialog.Content
          class="light-dialog"
          :style="drag.style.value"
          @pointerdown="drag.onPointerDown"
        >
          <Dialog.Title class="light-dialog-title">
            {{ title }}
          </Dialog.Title>
          <slot />
          <div class="light-dialog-buttons">
            <button @click="open = false">
              Cancel
            </button>
            <button @click="ok">
              OK
            </button>
          </div>
        </Dialog.Content>
      </Dialog.Positioner>
    </Teleport>
  </Dialog.Root>
</template>
