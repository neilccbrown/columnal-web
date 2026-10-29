// Keyboard shortcuts: the Java app's (from the translations, FXUtility.getStringAndShortcut), with the
// remappings for the ones a browser keeps for itself (CONVENTIONS.md "GUI"), matched against key events
// and shown as text.
import { onBeforeUnmount } from "vue";
import type { LocalizableKey } from "../engine/anns/Annotations.js";
import type { KeyCombination } from "../gui-logic/utility-gui/utility/gui/FXUtility.js";

const altShift = (key: string): KeyCombination => ({ shortcut: false, alt: true, shift: true, key });

// By translation key; null means the shortcut is dropped:
const REMAPPED: ReadonlyMap<LocalizableKey, KeyCombination | null> = new Map([
    // Ctrl/Cmd+N, Ctrl/Cmd+W and Shift+Esc (Chrome's task manager) can't be captured:
    ["menu.project.new", altShift("n")],
    ["menu.project.close", altShift("w")],
    ["menu.view.tasks", altShift("Esc")],
    // Ctrl/Cmd+Q can't be captured, and closing the tab does it:
    ["menu.exit", null],
]);

/** The shortcut for a translation key, given the Java app's. */
export function remapShortcut(key: LocalizableKey, javaShortcut: KeyCombination | null): KeyCombination | null
{
    return REMAPPED.has(key) ? REMAPPED.get(key)! : javaShortcut;
}

export function isMac(): boolean
{
    return /mac/i.test(navigator.platform);
}

/** Whether a key event is the shortcut (on macOS, JavaFX's "shortcut" is Cmd, else Ctrl). */
export function matchesShortcut(combination: KeyCombination, event: KeyboardEvent, mac: boolean = isMac()): boolean
{
    const shortcutDown = mac ? event.metaKey : event.ctrlKey;
    const otherDown = mac ? event.ctrlKey : event.metaKey;
    if (shortcutDown !== combination.shortcut || otherDown || event.altKey !== combination.alt || event.shiftKey !== combination.shift)
        return false;
    if (combination.key === "Esc")
        return event.key === "Escape";
    // By the character typed, unless a modifier changed it (e.g. Alt on macOS), then by the key's
    // position:
    if (/^[a-z]$/i.test(event.key))
        return event.key.toLowerCase() === combination.key;
    return event.code === "Key" + combination.key.toUpperCase();
}

/** The shortcut as shown in a menu, e.g. "Ctrl+Alt+S", or "⌥⌘S" on macOS. */
export function shortcutText(combination: KeyCombination, mac: boolean = isMac()): string
{
    const key = combination.key === "Esc" ? (mac ? "⎋" : "Esc") : combination.key.toUpperCase();
    if (mac)
        return (combination.alt ? "⌥" : "") + (combination.shift ? "⇧" : "") + (combination.shortcut ? "⌘" : "") + key;
    return [combination.shortcut ? "Ctrl" : null, combination.alt ? "Alt" : null, combination.shift ? "Shift" : null, key]
        .filter(p => p !== null).join("+");
}

/** Runs the action when the shortcut is pressed anywhere in the page, while the component is mounted. */
export function useShortcut(combination: KeyCombination | null, action: () => void): void
{
    if (combination === null)
        return;
    const listener = (event: KeyboardEvent): void =>
    {
        if (matchesShortcut(combination, event))
        {
            event.preventDefault();
            action();
        }
    };
    window.addEventListener("keydown", listener);
    onBeforeUnmount(() => window.removeEventListener("keydown", listener));
}
