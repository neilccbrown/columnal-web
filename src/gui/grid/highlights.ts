// Highlighting tables on the grid (Java: TableHighlights): a rectangle over each highlighted area, and
// an arrow from its centre to a point.  SOURCE shows a transformation's source, when its name in the
// hat is hovered; SELECT is for picking a table (Phase 11's dialogs).
import { inject, type InjectionKey, type ShallowRef } from "vue";
import type { RectangleBounds } from "../../gui-logic/stf/gui/grid/RectangleBounds.js";

export interface GridHighlight
{
    readonly type: "SELECT" | "SOURCE";
    readonly bounds: readonly RectangleBounds[];
    // Where each area's arrow points (on the grid's canvas), or null for no arrow:
    readonly arrowTo: readonly ({ readonly x: number, readonly y: number } | null)[];
}

export const HIGHLIGHT: InjectionKey<ShallowRef<GridHighlight | null>> = Symbol("highlight");

export function useHighlight(): ShallowRef<GridHighlight | null> | null
{
    return inject(HIGHLIGHT, null);
}

/**
 * Java: TableArrow.setPathElements: a curve from the area's centre to (just short of) the point, with an
 * arrow head; the path is relative to the centre.
 */
export function arrowPath(from: { x: number, y: number }, to: { x: number, y: number }): string
{
    const headX = to.x - from.x - 5;
    const xMiddle = headX / 2.0;
    const headY = to.y - from.y - 5;
    const yMiddle = headY / 2.0;
    const angle = Math.atan2(yMiddle, xMiddle);
    const headSize = 10;
    const rad = (deg: number): number => deg * Math.PI / 180;
    return `M 0 0 Q ${xMiddle + 20} ${yMiddle - 20} ${headX} ${headY}`
        + ` L ${headX + headSize * Math.cos(angle - rad(135))} ${headY + headSize * Math.sin(angle - rad(135))}`
        + ` M ${headX} ${headY}`
        + ` L ${headX + headSize * Math.cos(angle + rad(135))} ${headY + headSize * Math.sin(angle + rad(135))}`;
}
