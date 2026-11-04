<script setup lang="ts">
// Java: PickTransformationDialog (dialogs-non-expression): the kinds of transformation, as buttons with
// a preview image and an explanation (Java: ExplainedButton), three to a row in a scrolling pane, and
// Cancel.  It is centred on the point given.  (docs/gui-spec/transformations.md)
import aggregateImage from "@resources/gui/images/preview-aggregate.png";
import calculateImage from "@resources/gui/images/preview-calculate.png";
import concatenateImage from "@resources/gui/images/preview-concatenate.png";
import editImage from "@resources/gui/images/preview-edit.png";
import filterImage from "@resources/gui/images/preview-filter.png";
import hideImage from "@resources/gui/images/preview-hide.png";
import joinImage from "@resources/gui/images/preview-join.png";
import runrImage from "@resources/gui/images/preview-runr.png";
import sortImage from "@resources/gui/images/preview-sort.png";
import LightDialog from "../components/dialogs/LightDialog.vue";
import { makeId } from "../components/menus/menus.js";
import { t } from "../i18n.js";

const open = defineModel<boolean>("open", { required: true });
defineProps<{ centreOn: { readonly x: number, readonly y: number } | null }>();
const emit = defineEmits<{
    // The transformation's canonical name, and where its button was clicked
    chosen: [name: string, point: { x: number, y: number }],
}>();

interface Choice
{
    readonly name: string;
    readonly titleKey: string;
    readonly explanationKey: string;
    readonly image: string;
}

// Java: TransformationManager.getTransformations(), less Check (which the new-table dialog shows)
const CHOICES: readonly Choice[] = [
    { name: "calculate", titleKey: "transform.calculate", explanationKey: "calculate.explanation.short", image: calculateImage },
    { name: "aggregate", titleKey: "transform.aggregate", explanationKey: "aggregate.explanation.short", image: aggregateImage },
    { name: "filter", titleKey: "transform.filter", explanationKey: "filter.explanation.short", image: filterImage },
    { name: "sort", titleKey: "transform.sort", explanationKey: "sort.explanation.short", image: sortImage },
    { name: "join", titleKey: "transform.join", explanationKey: "join.explanation.short", image: joinImage },
    { name: "concatenate", titleKey: "transform.concatenate", explanationKey: "concatenate.explanation.short", image: concatenateImage },
    { name: "hideColumns", titleKey: "transform.hideColumns", explanationKey: "hide.explanation.short", image: hideImage },
    { name: "edit", titleKey: "transform.edit", explanationKey: "edit.explanation.short", image: editImage },
    { name: "runr", titleKey: "transform.runr", explanationKey: "runr.explanation.short", image: runrImage },
];
// PORT-DEFERRED: the other transformations' dialogs (Phase 11; R, Phase 12)
const BUILT: ReadonlySet<string> = new Set(["calculate"]);

function choose(c: Choice, e: MouseEvent): void
{
    open.value = false;
    const box = (e.currentTarget as HTMLElement).getBoundingClientRect();
    // (A button pressed by keyboard has no mouse position: its centre)
    emit("chosen", c.name, e.detail === 0 ? { x: box.left + box.width / 2, y: box.top + box.height / 2 } : { x: e.clientX, y: e.clientY });
}
</script>

<template>
  <LightDialog
    v-model:open="open"
    :label="t('new.transform')"
    :buttons="['cancel']"
    :centre-on="centreOn"
    resizable
  >
    <div class="pick-transformation-scroll-pane">
      <div class="pick-transformation-tile-pane">
        <button
          v-for="c in CHOICES"
          :key="c.name"
          type="button"
          class="explanation-button"
          :class="makeId(c.titleKey)"
          :disabled="!BUILT.has(c.name)"
          :aria-label="t(c.titleKey) + '\n' + t(c.explanationKey)"
          @click="choose(c, $event)"
        >
          <span class="explanation-button-title">{{ t(c.titleKey) }}</span>
          <img
            :src="c.image"
            alt=""
            class="explanation-button-image"
          >
          <span class="explanation-button-explanation">{{ t(c.explanationKey) }}</span>
        </button>
      </div>
    </div>
  </LightDialog>
</template>

<style scoped>
/* dialogs.scss: .pick-transformation-* (Java: buttons 150 by 165, 10 px apart, in a pane 630 by 410) */
.pick-transformation-scroll-pane {
    width: 630px;
    height: 360px;
    overflow-y: scroll;
    box-sizing: border-box;
}
.pick-transformation-tile-pane {
    display: grid;
    grid-template-columns: repeat(3, 150px);
    grid-auto-rows: 165px;
    gap: 10px;
    padding: 0 5px 0 0;
}
.explanation-button {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: flex-start;
    gap: 2px;
    font-family: var(--font-main);
}
.explanation-button-image {
    width: 100px;
    margin-bottom: 15px;
}
.explanation-button-explanation {
    max-width: 85%;
    font-size: 8pt;
    color: rgb(40% 40% 40%);
}
</style>
