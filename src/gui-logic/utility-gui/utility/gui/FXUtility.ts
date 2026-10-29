// Port of xyz.columnal.utility.gui.FXUtility (utility-gui module): only the parts that aren't JavaFX.
//
// PORT-DEFERRED: everything else in FXUtility (JavaFX helpers: listeners, focus, drag handling, CSS,
// windows, ...), which the GUI phases rebuild as Vue code where it is needed.
import type { LocalizableKey, Localized } from "../../../../engine/anns/Annotations.js";
import { InternalException } from "../../../../engine/utility-error/error/InternalException.js";
import { UserException } from "../../../../engine/utility-error/error/UserException.js";
import { AcceleratorLexer } from "../../../../engine/parsers/generated/AcceleratorLexer.js";
import { AcceleratorParser } from "../../../../engine/parsers/generated/AcceleratorParser.js";
import { Pair } from "../../../../engine/utility-adt/utility/adt/Pair.js";
import { Log } from "../../../../engine/utility/log/Log.js";
import { TranslationUtility } from "../../../../engine/utility/utility/TranslationUtility.js";
import { Utility } from "../../../../engine/utility/utility/Utility.js";

/**
 * PORT-NOTE: stands in for JavaFX's KeyCombination as made here (a KeyCodeCombination for Esc, else a
 * KeyCharacterCombination).  `shortcut` is JavaFX's SHORTCUT_DOWN: Cmd on macOS, Ctrl elsewhere.
 */
export interface KeyCombination
{
    readonly shortcut: boolean;
    readonly alt: boolean;
    readonly shift: boolean;
    // A lower-case letter, or "Esc":
    readonly key: string;
}

export class FXUtility
{
    /**
     * A label and its keyboard shortcut, from a translation such as "_Save as...@C-A-s" (the
     * shortcut's syntax is Accelerator.g4).  The label keeps its mnemonic underscore, as in Java.
     */
    public static getStringAndShortcut(key: LocalizableKey): Pair<Localized, KeyCombination | null>
    {
        const original = TranslationUtility.getString(key);
        const atIndex = original.indexOf("@");
        if (atIndex !== -1)
        {
            let shortcut: KeyCombination | null = null;
            try
            {
                shortcut = Utility.parseAsOne<KeyCombination | null, AcceleratorParser>(original.substring(atIndex + 1).trim(), s => new AcceleratorLexer(s), t => new AcceleratorParser(t), p =>
                {
                    const ctx = p.accelerator();
                    return {
                        shortcut: ctx.SHORTCUT_MODIFIER() !== null,
                        alt: ctx.ALT_MODIFIER() !== null,
                        shift: ctx.SHIFT_MODIFIER() !== null,
                        key: ctx.KEY().getText(),
                    };
                });
            }
            catch (e)
            {
                if (!(e instanceof InternalException || e instanceof UserException))
                    throw e;
                // No need to tell the user, it's an internal error:
                Log.log(e);
            }
            return new Pair(original.substring(0, atIndex), shortcut);
        }
        else
            return new Pair(original, null);
    }
}
