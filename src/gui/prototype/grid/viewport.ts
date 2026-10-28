// Grid prototype (Phase 7, throwaway): the grid's scroll position and size, which the tables read
// to work out which of their rows and columns are in view.
import type { InjectionKey, ShallowRef } from "vue";

export interface Viewport
{
    readonly scrollTop: ShallowRef<number>;
    readonly scrollLeft: ShallowRef<number>;
    readonly viewWidth: ShallowRef<number>;
    readonly viewHeight: ShallowRef<number>;
}

export const VIEWPORT: InjectionKey<Viewport> = Symbol("viewport");
