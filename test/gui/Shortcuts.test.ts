// Menu labels and keyboard shortcuts: Java's, from the translations, with the browser remappings.
import { describe, expect, it } from "vitest";
import { label, parseMnemonic } from "../../src/gui/i18n.js";
import { matchesShortcut, shortcutText } from "../../src/gui/shortcuts.js";

function key(init: KeyboardEventInit): KeyboardEvent
{
    return new KeyboardEvent("keydown", init);
}

describe("labels", () =>
{
    it("keeps Java's shortcuts that a browser lets a page have", () =>
    {
        expect(label("menu.project.saveAs")).toEqual({ text: "Save as...", mnemonicIndex: 0, shortcut: { shortcut: true, alt: true, shift: false, key: "s" } });
        expect(label("menu.edit.undo").shortcut).toEqual({ shortcut: true, alt: false, shift: false, key: "z" });
    });

    it("remaps or drops the ones a browser keeps", () =>
    {
        expect(label("menu.project.new").shortcut).toEqual({ shortcut: false, alt: true, shift: true, key: "n" });
        expect(label("menu.project.close").shortcut).toEqual({ shortcut: false, alt: true, shift: true, key: "w" });
        expect(label("menu.view.tasks").shortcut).toEqual({ shortcut: false, alt: true, shift: true, key: "Esc" });
        expect(label("menu.exit")).toEqual({ text: "Exit", mnemonicIndex: 1, shortcut: null });
    });

    it("parses mnemonics as JavaFX does", () =>
    {
        expect(parseMnemonic("E_xit")).toEqual({ text: "Exit", mnemonicIndex: 1 });
        expect(parseMnemonic("a__b")).toEqual({ text: "a_b", mnemonicIndex: null });
        expect(parseMnemonic("plain")).toEqual({ text: "plain", mnemonicIndex: null });
    });
});

describe("shortcuts", () =>
{
    const saveAs = { shortcut: true, alt: true, shift: false, key: "s" };
    const tasks = { shortcut: false, alt: true, shift: true, key: "Esc" };

    it("matches Ctrl elsewhere and Cmd on macOS", () =>
    {
        expect(matchesShortcut(saveAs, key({ key: "s", code: "KeyS", ctrlKey: true, altKey: true }), false)).toBe(true);
        expect(matchesShortcut(saveAs, key({ key: "s", code: "KeyS", metaKey: true, altKey: true }), false)).toBe(false);
        // On macOS, Alt changes the character, so the key's position is used:
        expect(matchesShortcut(saveAs, key({ key: "ß", code: "KeyS", metaKey: true, altKey: true }), true)).toBe(true);
        expect(matchesShortcut(saveAs, key({ key: "ß", code: "KeyS", ctrlKey: true, metaKey: true, altKey: true }), true)).toBe(false);
    });

    it("needs exactly the modifiers", () =>
    {
        expect(matchesShortcut(saveAs, key({ key: "S", code: "KeyS", ctrlKey: true, altKey: true, shiftKey: true }), false)).toBe(false);
        expect(matchesShortcut(tasks, key({ key: "Escape", code: "Escape", altKey: true, shiftKey: true }), false)).toBe(true);
        expect(matchesShortcut(tasks, key({ key: "Escape", code: "Escape", shiftKey: true }), false)).toBe(false);
    });

    it("uses the typed character, so other layouts work", () =>
    {
        // AZERTY: the Z key is where QWERTY's W is
        const undo = { shortcut: true, alt: false, shift: false, key: "z" };
        expect(matchesShortcut(undo, key({ key: "z", code: "KeyW", ctrlKey: true }), false)).toBe(true);
    });

    it("shows shortcuts as each platform does", () =>
    {
        expect(shortcutText(saveAs, false)).toBe("Ctrl+Alt+S");
        expect(shortcutText(saveAs, true)).toBe("⌥⌘S");
        expect(shortcutText(tasks, false)).toBe("Alt+Shift+Esc");
        expect(shortcutText(tasks, true)).toBe("⌥⇧⎋");
    });
});
