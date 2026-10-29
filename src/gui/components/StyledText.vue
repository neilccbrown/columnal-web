<script setup lang="ts">
// Shows a StyledString (Java: StyledString.toGUI(), a list of styled JavaFX Text nodes): a span per
// segment, with its styles' classes and inline styles.  A Clickable part is clicked, hovered (after
// 300 ms, as Java's) and has its tooltip, as Clickable's PORT-NOTE describes.
import { computed, onBeforeUnmount } from "vue";
import type { StyledString } from "../../engine/utility-error/styled/StyledString.js";
import { Clickable } from "../../gui-logic/utility-gui/utility/gui/Clickable.js";
import { t } from "../i18n.js";

const props = defineProps<{ text: StyledString }>();

interface Segment
{
    readonly text: string;
    readonly classes: readonly string[];
    readonly style: Record<string, string>;
    readonly clickable: Clickable | null;
}

const segments = computed<Segment[]>(() =>
{
    const r: Segment[] = [];
    props.text.forEach((styles, text) =>
    {
        const target = { classes: new Set<string>(["styled-text"]), inlineStyles: new Map<string, string>() };
        let clickable: Clickable | null = null;
        for (const style of styles)
        {
            style.applyTo(target);
            if (style instanceof Clickable)
                clickable = style;
        }
        r.push({ text, classes: [...target.classes], style: Object.fromEntries(target.inlineStyles), clickable });
    });
    return r;
});

const MOUSE_BUTTONS = ["PRIMARY", "MIDDLE", "SECONDARY"];
let hoverTimer: ReturnType<typeof setTimeout> | null = null;

function cancelHover(): void
{
    if (hoverTimer !== null)
        clearTimeout(hoverTimer);
    hoverTimer = null;
}

function clicked(segment: Segment, e: MouseEvent): void
{
    cancelHover();
    segment.clickable?.setHovering(false, { x: e.screenX, y: e.screenY });
    segment.clickable?.click(MOUSE_BUTTONS[e.button] ?? "NONE", { x: e.screenX, y: e.screenY });
}

function entered(segment: Segment, e: MouseEvent): void
{
    cancelHover();
    hoverTimer = setTimeout(() => segment.clickable?.setHovering(true, { x: e.screenX, y: e.screenY }), 300);
}

function left(segment: Segment, e: MouseEvent): void
{
    cancelHover();
    segment.clickable?.setHovering(false, { x: e.screenX, y: e.screenY });
}

onBeforeUnmount(cancelHover);
</script>

<template>
  <span class="styled-text-flow"><template
    v-for="(segment, i) in segments"
    :key="i"
  ><span
    v-if="segment.clickable === null"
    :class="segment.classes"
    :style="segment.style"
  >{{ segment.text }}</span><span
    v-else
    :class="segment.classes"
    :style="segment.style"
    :title="segment.clickable.getTooltipKey() !== null ? t(segment.clickable.getTooltipKey()!) : undefined"
    @click="clicked(segment, $event)"
    @auxclick="clicked(segment, $event)"
    @mouseenter="entered(segment, $event)"
    @mouseleave="left(segment, $event)"
  >{{ segment.text }}</span></template></span>
</template>

<style>
.styled-text-flow {
    white-space: pre-wrap;
}
/* general.scss */
.styled-text.styled-text-clickable {
    cursor: pointer;
}
</style>
