<script setup lang="ts">
// Java: ExplanationDisplay (app): why a Check failed, or how a transformation's cell was calculated,
// below the cell it is for, centred on its column, 250 to 500 px wide (docs/gui-spec/tables.md).  Its
// lines, the last first, each start "⬑ " after the first; locations are links that select their cell; an
// expression shown more than once is highlighted everywhere while one is hovered.  The cross, or a
// middle click, closes it.
import { computed, shallowRef } from "vue";
import type { ExplanationInfo, ExplanationSegment } from "../engine/protocol.js";
import { t } from "../i18n.js";

const props = defineProps<{
    // Null while it loads:
    info: ExplanationInfo | null,
    // The pane's position in the canvas: the middle of its column, and the top of the row below its cell
    // (Java: getYCoordAfter(row) + 10, added here)
    middle: number,
    top: number,
}>();
const emit = defineEmits<{
    close: [],
    jump: [link: NonNullable<ExplanationSegment["link"]>],
}>();

// Java: HighlightExpression's highlight property, of each highlight:
const highlighted = shallowRef<ReadonlySet<number>>(new Set());

// Java: HighlightExpression's hover listener: the hovered expression's appearances (if it is explained
// directly, else its nearest parent's that is) are highlighted, with the expressions inside them, if
// there are several
function hover(segment: ExplanationSegment, hovering: boolean): void
{
    const highlights = props.info?.highlights;
    if (highlights === undefined || segment.highlight === null)
        return;
    const own = highlights[segment.highlight]!;
    const target = own.explainedDirectly ? segment.highlight : own.parents.find(p => highlights[p]!.explainedDirectly);
    if (target === undefined)
        return;
    const appearances = highlights.map((h, i) => [h, i] as const).filter(([h]) => h.expression === highlights[target]!.expression).map(([, i]) => i);
    const next = new Set(highlighted.value);
    const setHover = (i: number, on: boolean): void =>
    {
        if (on)
            next.add(i);
        else
            next.delete(i);
        for (const inner of highlights[i]!.inner)
            setHover(inner, on);
    };
    for (const a of appearances)
        setHover(a, hovering && appearances.length > 1);
    highlighted.value = next;
}

// The flow's parts: "Loading...", or the lines' segments, with "\n⬑ " between lines (Java: joining)
type Part = { readonly separator: string } | { readonly segment: ExplanationSegment };
const parts = computed<Part[]>(() =>
{
    if (props.info === null)
        return [{ separator: "Loading..." }];
    return props.info.lines.flatMap((line, i) => [...(i > 0 ? [{ separator: "\n\u2b11 " }] : []), ...line.map(segment => ({ segment }))]);
});

const isHighlighted = (segment: ExplanationSegment): boolean => segment.highlight !== null && highlighted.value.has(segment.highlight);

function auxClicked(e: MouseEvent): void
{
    if (e.button === 1)
    {
        e.preventDefault();
        emit("close");
    }
}
</script>

<template>
  <div
    class="explanation-pane"
    :style="{ left: middle + 'px', top: top + 'px' }"
    @pointerdown.stop
    @click.stop
    @auxclick="auxClicked"
    @contextmenu.stop
  >
    <span class="explanation-flow"><template
      v-for="(part, i) in parts"
      :key="i"
    ><span v-if="'separator' in part">{{ part.separator }}</span><a
      v-else-if="part.segment.link !== null"
      class="styled-text"
      :class="[part.segment.classes, { highlight: isHighlighted(part.segment) }]"
      :title="t('click.to.view')"
      @click.prevent="emit('jump', part.segment.link)"
      @mouseenter="hover(part.segment, true)"
      @mouseleave="hover(part.segment, false)"
    >{{ part.segment.text }}</a><span
      v-else
      class="styled-text"
      :class="[part.segment.classes, { highlight: isHighlighted(part.segment) }]"
      @mouseenter="hover(part.segment, true)"
      @mouseleave="hover(part.segment, false)"
    >{{ part.segment.text }}</span></template></span>
    <button
      type="button"
      class="small-delete explanation-close"
      tabindex="-1"
      aria-label="Close"
      @mousedown.prevent
      @click="emit('close')"
    >
      <svg
        width="16"
        height="16"
        viewBox="-8 -8 16 16"
      ><circle
        class="small-delete-circle"
        r="8"
      /><path
        class="small-delete-cross"
        d="M -4 -4 L 4 4 M 4 -4 L -4 4"
      /></svg>
    </button>
  </div>
</template>

<style scoped>
/* virtual-grid.scss: .explanation-pane, and its drop shadow (as .table-hat's) */
.explanation-pane {
    position: absolute;
    z-index: 30;
    transform: translateX(-50%);
    box-sizing: border-box;
    width: max-content;
    min-width: 250px;
    max-width: 500px;
    border: 1px solid var(--table-row-label-border-color);
    border-radius: 5px;
    background: var(--table-row-label-background-color);
    box-shadow: 1px 1px 6px rgb(179 179 179 / 0.6);
}
.explanation-flow {
    display: block;
    margin: 8px 24px 8px 8px;
    white-space: pre-wrap;
    overflow-wrap: anywhere;
}
.explanation-flow .styled-text-clickable {
    text-decoration: underline;
    color: inherit;
    cursor: pointer;
}
.explanation-flow .explained-expression {
    color: var(--explained-expression);
}
.explanation-flow .explained-expression.highlight {
    color: var(--explained-expression-highlight);
    text-decoration: underline;
}
.explanation-close {
    position: absolute;
    top: 10px;
    right: 10px;
    margin: 0;
}
</style>
