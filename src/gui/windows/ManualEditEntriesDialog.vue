<script setup lang="ts">
// Java: ManualEditEntriesDialog: a Manual Edit's entries (each its key, column and value, which are links),
// which can be deleted ("No edits" when there are none), and Close, centred.  Closing it keeps the
// entries not deleted; clicking an entry's link does too, and asks to go to the entry.
// (docs/gui-spec/transformations.md)
import { shallowRef } from "vue";
import LightDialog from "../components/dialogs/LightDialog.vue";
import FancyList from "../components/FancyList.vue";
import type { ManualEditEntryInfo } from "../engine/protocol.js";

const open = defineModel<boolean>("open", { required: true });
const props = defineProps<{ entries: readonly ManualEditEntryInfo[] }>();
const emit = defineEmits<{
    // The indexes of the entries not deleted, and the entry clicked (if any)
    closed: [keep: number[], jumpTo: number | null],
}>();

interface Item
{
    readonly index: number;
    readonly entry: ManualEditEntryInfo;
}
const items = shallowRef<readonly Item[]>(props.entries.map((entry, index) => ({ index, entry })));
let jumpTo: number | null = null;
let closed = false;

// Java: the result converter (Close, or Escape), and a link's jumpTo
function close(): void
{
    if (closed)
        return;
    closed = true;
    emit("closed", items.value.map(i => i.index), jumpTo);
}

function jump(index: number): void
{
    jumpTo = index;
    close();
    open.value = false;
}
</script>

<template>
  <LightDialog
    v-model:open="open"
    label="Manual edit entries"
    :buttons="['close']"
    buttons-centred
    resizable
    @cancel="close"
  >
    <div class="manual-edit-entries-dialog">
      <FancyList
        v-model:items="items"
        class="manual-edit-entries-list"
        :allow-reordering="false"
        :allow-adding="false"
      >
        <template #cell="{ item }">
          <span
            v-if="'error' in item.entry"
            class="manual-edit-entry"
          >{{ item.entry.error }}</span>
          <span
            v-else
            class="manual-edit-entry"
          >
            <!-- (Links, which the list leaves to themselves rather than selecting the entry) -->
            <a
              class="jump-to-link"
              @click="jump(item.index)"
            >{{ item.entry.key }}</a>
            <a
              class="jump-to-link"
              @click="jump(item.index)"
            >{{ item.entry.column }}</a>
            <a
              class="jump-to-link"
              @click="jump(item.index)"
            >{{ item.entry.value }}</a>
          </span>
        </template>
      </FancyList>
      <label
        v-if="items.length === 0"
        class="manual-edit-entries-empty"
      >No edits</label>
    </div>
  </LightDialog>
</template>

<style scoped>
/* Java: a StackPane of the list and "No edits" */
.manual-edit-entries-dialog {
    display: grid;
    min-width: 300px;
    min-height: 200px;
}
.manual-edit-entries-list, .manual-edit-entries-empty {
    grid-area: 1 / 1;
}
.manual-edit-entries-empty {
    align-self: center;
    justify-self: center;
}
/* PORT-NOTE: Java's labels had no style (so no space between them); here a gap, and a pointer over them */
.manual-edit-entry {
    display: flex;
    gap: 10px;
}
.jump-to-link {
    cursor: pointer;
}
</style>
