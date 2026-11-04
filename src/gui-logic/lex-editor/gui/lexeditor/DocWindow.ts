// Port of xyz.columnal.gui.lexeditor.DocWindow (lex-editor module): a window showing a page of the
// documentation, whose "insert" links insert their content into the editor.
//
// The window is the GUI's (src/gui/lexeditor/docWindows.ts): the lexers and the error recorder open one
// through DocWindow.show, which the GUI sets.  PORT-NOTE: Java's ExpressionSaver passed
// toRightOf.sceneProperty() as the scene; here the GUI's toRightOf carries both.
import type { InsertListener } from "../../../lex-editor-completion/gui/lexeditor/completion/InsertListener.js";

export namespace DocWindow
{
    type Show = (title: string, docURL: string, toRightOf: unknown, insertListener: InsertListener, scene: unknown) => void;
    // (A function calling this, as a namespace's exported variable isn't updated by an assignment
    // within it once transpiled)
    let showImpl: Show = () => {};

    /**
     * Java: new DocWindow(title, docURL, toRightOf, insertListener, lastAsLongAsSceneIsNotNull).show().
     * toRightOf (what the window appears to the right of) and the scene (how long it lasts) are the
     * GUI's.
     */
    export function show(title: string, docURL: string, toRightOf: unknown, insertListener: InsertListener, scene: unknown): void
    {
        showImpl(title, docURL, toRightOf, insertListener, scene);
    }

    /** Lets the GUI set show. */
    export function setShow(newShow: Show): void
    {
        showImpl = newShow;
    }
}
