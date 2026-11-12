// What the dialog components share.
import { inject, provide, type InjectionKey } from "vue";

/** A dialog's buttons (JavaFX's ButtonType.OK, CANCEL and CLOSE). */
export type DialogButton = "ok" | "cancel" | "close";

const RETURN_FOCUS: InjectionKey<() => void> = Symbol("returnFocus");

/**
 * Where the focus goes when a dialog closes with nothing to return it to (as when it opened just after
 * another closed): Java's dialogs returned it to their window's focus owner, which in a project's window
 * is the grid.
 */
export function provideDialogReturnFocus(focus: () => void): void
{
    provide(RETURN_FOCUS, focus);
}

export function useDialogReturnFocus(): (() => void) | null
{
    return inject(RETURN_FOCUS, null);
}

/** Java: DoubleOKLightDialog.Validity */
export type Validity = "IMPOSSIBLE_TO_SAVE" | "ERROR_BUT_CAN_SAVE" | "NO_ERRORS";

export function isWindows(): boolean
{
    return navigator.platform.startsWith("Win");
}

/**
 * The buttons in the order JavaFX's ButtonBar puts them: on Windows OK comes first, elsewhere
 * (macOS and Linux) Cancel or Close comes first.
 */
export function sortButtons(buttons: readonly DialogButton[], windows: boolean): DialogButton[]
{
    const order: readonly DialogButton[] = windows ? ["ok", "cancel", "close"] : ["cancel", "close", "ok"];
    return [...buttons].sort((a, b) => order.indexOf(a) - order.indexOf(b));
}
