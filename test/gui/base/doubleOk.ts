// Port of test.gui.TFXUtil.doubleOk (tests-gui-base): OK (moving the mouse there first, which dismisses
// popups), then OK again if a dialog is still there (a popup, or the double OK's prompt, took the first).
import { userEvent } from "vitest/browser";
import { moveAndDismissPopupsAtPos } from "./popup.js";
import { sleep } from "./util.js";

export async function doubleOk(): Promise<void>
{
    const ok = document.querySelector(".ok-button")!.getBoundingClientRect();
    await moveAndDismissPopupsAtPos({ x: ok.left + ok.width / 2, y: ok.top + ok.height / 2 });
    await userEvent.click(document.querySelector(".ok-button")!);
    await sleep(300);
    if (document.querySelector(".ok-button") !== null)
        await userEvent.click(document.querySelector(".ok-button")!);
}
