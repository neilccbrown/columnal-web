// The documentation windows (Java: DocWindow, a window of its own, always on top, showing a page of
// the documentation; here a panel over the page, shown by DocWindowHost.vue).  The lexers open one
// through gui-logic's DocWindow.show, which this sets, and so does choosing a completion which is a
// guide (Java opened those in the system's browser).  (docs/gui-spec/expression-editor.md)
import { shallowRef } from "vue";
import { Log } from "../../engine/utility/log/Log.js";
import type { InsertListener } from "../../gui-logic/lex-editor-completion/gui/lexeditor/completion/InsertListener.js";
import { DocWindow } from "../../gui-logic/lex-editor/gui/lexeditor/DocWindow.js";
import { EditorDisplay } from "../../gui-logic/lex-editor/gui/lexeditor/EditorDisplay.js";
import { loadFuncdocPages } from "../funcdoc.js";

/** How long an editor is shown: its documentation windows close when it goes (Java: its scene). */
export class EditorLifetime
{
    private ended = false;
    private readonly listeners: (() => void)[] = [];

    public onEnd(listener: () => void): void
    {
        if (this.ended)
            listener();
        else
            this.listeners.push(listener);
    }

    public end(): void
    {
        this.ended = true;
        for (const l of this.listeners.splice(0))
            l();
    }
}

/**
 * What the editor gives the lexers as DocWindow's toRightOf and scene: the element a window shows to the
 * right of (Java: the editor's scene's root, i.e. its dialog), and the editor's lifetime.
 */
export interface DocWindowAnchor
{
    readonly element: Element | null;
    readonly lifetime: EditorLifetime;
}

export interface DocWindowShown
{
    readonly id: number;
    readonly title: string;
    readonly page: string;
    readonly insertListener: InsertListener;
    // Where it first shows (Java: 10 px right of toRightOf, level with its top), or null to be centred
    readonly position: { readonly x: number, readonly y: number } | null;
}

export const docWindows = shallowRef<readonly DocWindowShown[]>([]);
let nextId = 0;

export function closeDocWindow(id: number): void
{
    docWindows.value = docWindows.value.filter(w => w.id !== id);
}

function isAnchor(x: unknown): x is DocWindowAnchor
{
    return typeof x === "object" && x !== null && "lifetime" in x;
}

DocWindow.setShow((title, docURL, toRightOf, insertListener, scene) =>
{
    const id = nextId++;
    const anchorElement = isAnchor(toRightOf) ? toRightOf.element : null;
    void loadFuncdocPages().then(pages =>
    {
        // Java: an InternalException (logged by the callers) for a page which isn't there
        if (!pages.has(docURL.split("#")[0]!))
        {
            Log.error("Could not find resource: " + docURL);
            return;
        }
        const r = anchorElement?.getBoundingClientRect() ?? null;
        docWindows.value = [...docWindows.value, { id, title, page: docURL, insertListener, position: r === null ? null : { x: r.right + 10, y: r.top } }];
        if (isAnchor(scene))
            scene.lifetime.onEnd(() => closeDocWindow(id));
    });
});

EditorDisplay.setOpenFurtherDetails((resourceName, insertListener) =>
{
    void loadFuncdocPages().then(pages => DocWindow.show(pages.get(resourceName)?.title ?? resourceName, resourceName, null, insertListener, null));
});
