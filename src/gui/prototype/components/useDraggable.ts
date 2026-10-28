// Component comparison prototype (Phase 7, throwaway): moving a dialog by dragging its background
// (Java: LightDialog).  Neither library does this, so both versions use it.
import { computed, shallowRef } from "vue";

export function useDraggable()
{
    const offset = shallowRef({ x: 0, y: 0 });
    const style = computed(() => ({ transform: `translate(calc(-50% + ${offset.value.x}px), calc(-50% + ${offset.value.y}px))` }));

    function onPointerDown(e: PointerEvent): void
    {
        if (e.button !== 0 || (e.target as HTMLElement).closest("input, button, select, textarea, [role=combobox], [role=listbox]") !== null)
            return;
        const target = e.currentTarget as HTMLElement;
        target.setPointerCapture(e.pointerId);
        const start = { x: e.clientX - offset.value.x, y: e.clientY - offset.value.y };
        const move = (ev: PointerEvent): void =>
        {
            offset.value = { x: ev.clientX - start.x, y: ev.clientY - start.y };
        };
        const up = (): void =>
        {
            target.removeEventListener("pointermove", move);
            target.removeEventListener("pointerup", up);
        };
        target.addEventListener("pointermove", move);
        target.addEventListener("pointerup", up);
    }

    return { style, onPointerDown, reset: () => { offset.value = { x: 0, y: 0 }; } };
}
