// The Java GUI tests' EditorDisplay: waitForOne(".editor-display"), and the focus owner as one.  Here,
// the lex editors' test API (TopLevelEditorApi), found from the editor's element.
import { expect, vi } from "vitest";
import type { StyledShowable } from "../../../src/engine/utility-error/styled/StyledShowable.js";
import { _test_editors, type TopLevelEditorApi } from "../../../src/gui/lexeditor/TopLevelEditorApi.js";
import { getFocusOwner } from "./focusOwner.js";

/** The editor which has the focus (Java: getFocusOwner(EditorDisplay.class)). */
export function focusedEditor<E extends StyledShowable = StyledShowable>(): TopLevelEditorApi<E>
{
    const focusOwner = getFocusOwner();
    const host = focusOwner?.closest(".top-level-editor");
    const e = host === null || host === undefined ? undefined : _test_editors.get(host);
    if (e === undefined)
        throw new Error("Focus owner is not an editor: " + String(focusOwner?.className));
    return e as unknown as TopLevelEditorApi<E>;
}

/** The one editor showing (Java: waitForOne(".editor-display")). */
export async function waitForOneEditor<E extends StyledShowable = StyledShowable>(): Promise<TopLevelEditorApi<E>>
{
    await vi.waitUntil(() => document.querySelectorAll(".top-level-editor").length !== 0, { timeout: 5000 });
    const hosts = document.querySelectorAll(".top-level-editor");
    expect(hosts.length, "Editors showing").toBe(1);
    return _test_editors.get(hosts[0]!) as unknown as TopLevelEditorApi<E>;
}

/** Lets the editor's sync with its content (a microtask) and a frame run. */
export async function settle(): Promise<void>
{
    await new Promise(r => requestAnimationFrame(r));
    await new Promise(r => setTimeout(r, 0));
}
