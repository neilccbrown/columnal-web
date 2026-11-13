<script setup lang="ts">
// Java: EditAggregateSplitByDialog: an Aggregate's split (AggregateSplitByPane), from its hat.  It isn't
// modal: a column of the source clicked in the grid goes into the column being edited, else is added at
// the end.  (docs/gui-spec/transformations.md)
import { markRaw, shallowRef, useTemplateRef, watch } from "vue";
import { Either } from "../../engine/utility-adt/utility/adt/Either.js";
import { TranslationUtility } from "../../engine/utility/utility/TranslationUtility.js";
import AggregateSplitByPane from "../components/AggregateSplitByPane.vue";
import ErrorableLightDialog from "../components/dialogs/ErrorableLightDialog.vue";
import ErrorLabel from "../components/dialogs/ErrorLabel.vue";
import type { PickingMode } from "../grid/picking.js";

const open = defineModel<boolean>("open", { required: true });
const props = defineProps<{
    // The source table, and its columns
    src: string,
    srcColumns: readonly string[],
    originalSplitBy: readonly string[],
    centreOn: { readonly x: number, readonly y: number } | null,
}>();
const emit = defineEmits<{
    ok: [splitBy: string[]],
    picking: [mode: PickingMode | null],
}>();

const pane = useTemplateRef<{ getItems(): string[] | null, pickColumnIfEditing(column: string): void }>("pane");
const content = shallowRef<HTMLElement | null>(null);

function calculateResult(): Either<string, string[]>
{
    const items = pane.value?.getItems() ?? null;
    if (items === null)
        return Either.left(TranslationUtility.getString("edit.column.invalid.column.name"));
    return Either.right(items);
}

// Java: enableColumnPickingMode, for the source's columns
const picking = markRaw<PickingMode>({
    kind: "column",
    include: (table, column) => column !== null && table === props.src,
    onPick: picked =>
    {
        if (picked.column !== null)
            pane.value?.pickColumnIfEditing(picked.column);
    },
    target: () => content.value?.closest(".light-dialog")?.getBoundingClientRect() ?? null,
    startPoint: props.centreOn,
});

watch(open, isOpen => emit("picking", isOpen ? picking : null), { immediate: true });
</script>

<template>
  <ErrorableLightDialog
    v-model:open="open"
    label="Calculate each expression once per"
    resizable
    :modal="false"
    :centre-on="centreOn"
    :calculate-result="calculateResult"
    @ok="r => emit('ok', r)"
  >
    <template #default="{ error }">
      <div
        :ref="(e: unknown) => { content = e as HTMLElement | null; }"
        class="split-by-dialog"
      >
        <AggregateSplitByPane
          ref="pane"
          :src-columns="srcColumns"
          :original-split-by="originalSplitBy"
        />
        <ErrorLabel :error="error" />
      </div>
    </template>
  </ErrorableLightDialog>
</template>

<style scoped>
.split-by-dialog {
    display: flex;
    flex-direction: column;
    gap: 5px;
    min-width: 250px;
    min-height: 150px;
    width: 300px;
}
</style>
