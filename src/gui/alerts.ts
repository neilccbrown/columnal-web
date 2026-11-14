// Errors shown to the user in an alert (Java: FXUtility.showError's Alert), which AlertHost shows; and
// questions asked in one, with Yes and Cancel (Java: an Alert of AlertType.CONFIRMATION).
import { shallowRef } from "vue";
import type { EngineAlert } from "./engine/protocol.js";

export interface Alert extends EngineAlert
{
    // Called once it is closed:
    readonly afterClose?: () => void;
    // For a question, called if Yes is clicked (the alert then has Yes and Cancel):
    readonly onYes?: () => void;
}

// The alerts waiting to be shown, the first showing:
export const alerts = shallowRef<readonly Alert[]>([]);

export function showAlert(alert: Alert): void
{
    alerts.value = [...alerts.value, alert];
}

/** The showing alert was closed. */
export function closeAlert(): void
{
    const closed = alerts.value[0];
    alerts.value = alerts.value.slice(1);
    closed?.afterClose?.();
}
