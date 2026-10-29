// The GUI's text, from the translation files (TranslationUtility, as in Java).  There is one
// language, fixed at load, so the text needs no reactivity.
import type { LocalizableKey } from "../engine/anns/Annotations.js";
import { TranslationUtility } from "../engine/utility/utility/TranslationUtility.js";
import { FXUtility, type KeyCombination } from "../gui-logic/utility-gui/utility/gui/FXUtility.js";
import { remapShortcut } from "./shortcuts.js";

/** The text for a key, with $1, $2, ... replaced by the values. */
export function t(key: LocalizableKey, ...values: string[]): string
{
    return TranslationUtility.getString(key, ...values);
}

/** A menu item's or button's label, e.g. from "_Save as...@C-A-s". */
export interface Label
{
    // Without the mnemonic marker:
    readonly text: string;
    // The index in text of the mnemonic letter (JavaFX underlines it), or null:
    readonly mnemonicIndex: number | null;
    readonly shortcut: KeyCombination | null;
}

export function label(key: LocalizableKey): Label
{
    const stringAndShortcut = FXUtility.getStringAndShortcut(key);
    return { ...parseMnemonic(stringAndShortcut.getFirst()), shortcut: remapShortcut(key, stringAndShortcut.getSecond()) };
}

/** As JavaFX parses a label: "_" marks the next character as the mnemonic, and "__" is "_". */
export function parseMnemonic(s: string): { text: string, mnemonicIndex: number | null }
{
    let text = "";
    let mnemonicIndex: number | null = null;
    for (let i = 0; i < s.length; i++)
    {
        if (s[i] === "_" && i + 1 < s.length)
        {
            i++;
            if (s[i] !== "_" && mnemonicIndex === null)
                mnemonicIndex = text.length;
        }
        text += s[i];
    }
    return { text, mnemonicIndex };
}
