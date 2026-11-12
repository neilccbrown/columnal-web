<script setup lang="ts">
// Java: HideColumnsPanel (dialogs-non-expression): the columns hidden (left) and the source's other
// columns (right), with a button between which moves the selection across ("<< Hide" or "Show >>").
// Several remaining columns can be selected, and dragged to the hidden list; a double click (or Enter,
// on the remaining list) moves one across.  (docs/gui-spec/transformations.md)
import { computed, shallowRef } from "vue";
import { t } from "../i18n.js";
import ListView from "./ListView.vue";

const hidden = defineModel<readonly string[]>("hidden", { required: true });
const props = defineProps<{
    // The source's columns, or null while they aren't known, or if they can't be had (with the message
    // the remaining list shows: Java's "Loading...", "Could not find source table." or "Error:...")
    srcColumns: readonly string[] | null,
    srcMessage: string,
}>();

const DRAG_FORMAT = "application/x-columnal-column-ids";

const shownSelected = shallowRef<readonly string[]>([]);
const hiddenSelected = shallowRef<readonly string[]>([]);
// Java: allSourceColumns filtered by not being hidden
const shown = computed(() => (props.srcColumns ?? []).filter(c => !hidden.value.includes(c)));

// Java: selecting in one list clears the other's selection
function selectShown(items: readonly string[]): void
{
    shownSelected.value = items;
    if (items.length > 0)
        hiddenSelected.value = [];
}

function selectHidden(items: readonly string[]): void
{
    hiddenSelected.value = items;
    if (items.length > 0)
        shownSelected.value = [];
}

// Java: updateButton
const button = computed(() => shownSelected.value.length > 0 ? { text: "<< Hide", disabled: false }
    : hiddenSelected.value.length > 0 ? { text: "Show >>", disabled: false }
    : { text: "Transfer", disabled: true });

/**
 * Java: addAllItemsToHidden.  The hidden columns are sorted by their positions in the source (any not in it
 * first, by name).
 *
 * PORT-NOTE: bug fix.  Java sorted by the positions in the remaining list as it was before they were
 * added (its list didn't refilter until afterwards), so those hidden before (not in it) came first, by
 * name, instead of in the source's order.
 */
function addAllItemsToHidden(items: readonly string[]): void
{
    const srcList = props.srcColumns ?? [];
    const next = [...hidden.value];
    for (const item of items)
    {
        if (!next.includes(item))
            next.push(item);
    }
    // (Pair.comparator: by position, then by name)
    next.sort((a, b) => srcList.indexOf(a) - srcList.indexOf(b) || (a < b ? -1 : a > b ? 1 : 0));
    hidden.value = next;
    shownSelected.value = shownSelected.value.filter(c => !next.includes(c));
}

function removeFromHidden(items: readonly string[]): void
{
    hidden.value = hidden.value.filter(c => !items.includes(c));
    hiddenSelected.value = [];
}

function transfer(): void
{
    if (shownSelected.value.length > 0)
        addAllItemsToHidden(shownSelected.value);
    else
        removeFromHidden(hiddenSelected.value);
}
</script>

<template>
  <div class="hide-columns-lists">
    <label class="hide-columns-label">{{ t("transformEditor.hide.hiddenColumns") }}</label>
    <span />
    <label class="hide-columns-label">{{ t("transformEditor.hide.srcColumns") }}</label>
    <ListView
      class="hidden-columns-list-view"
      :items="hidden"
      :selected="hiddenSelected"
      :drop-format="DRAG_FORMAT"
      :aria-label="t('transformEditor.hide.hiddenColumns')"
      @update:selected="selectHidden"
      @double-click="removeFromHidden(hiddenSelected.length > 0 ? hiddenSelected : [])"
      @dropped="addAllItemsToHidden"
    />
    <button
      type="button"
      class="add-button"
      :disabled="button.disabled"
      @click="transfer"
    >
      {{ button.text }}
    </button>
    <ListView
      class="shown-columns-list-view"
      :items="shown"
      :selected="shownSelected"
      multiple
      :placeholder="srcColumns === null ? srcMessage : 'None'"
      :drag-format="DRAG_FORMAT"
      :aria-label="t('transformEditor.hide.srcColumns')"
      @update:selected="selectShown"
      @double-click="c => addAllItemsToHidden([c])"
      @enter="addAllItemsToHidden(shownSelected)"
    />
  </div>
</template>

<style scoped>
/* Java: a GridPane with columns of 40%, 20% and 40% */
.hide-columns-lists {
    display: grid;
    grid-template-columns: 40% 20% 40%;
    grid-template-rows: auto 1fr;
    min-width: 450px;
    min-height: 250px;
}
.hide-columns-label {
    justify-self: center;
    margin-bottom: 10px;
}
.add-button {
    align-self: start;
    justify-self: center;
    margin-top: 30px;
    white-space: nowrap;
}
</style>
