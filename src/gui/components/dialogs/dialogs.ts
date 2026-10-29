// What the dialog components share.

/** A dialog's buttons (JavaFX's ButtonType.OK, CANCEL and CLOSE). */
export type DialogButton = "ok" | "cancel" | "close";

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
