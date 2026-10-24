// Port of xyz.columnal.gui.lexeditor.DocWindow (lex-editor module): a window showing a page of the
// documentation, whose "insert" links insert their content into the editor.
//
// PORT-DEFERRED: the window (Phase 10).  The lexers and the error recorder open one through
// DocWindow.show, which the GUI sets; until then it does nothing.
import type { InsertListener } from "../../../lex-editor-completion/gui/lexeditor/completion/InsertListener.js";

export namespace DocWindow
{
    /**
     * Java: new DocWindow(title, docURL, toRightOf, insertListener, lastAsLongAsSceneIsNotNull).show().
     * toRightOf (a node the window appears to the right of) and the scene are the GUI's.
     */
    export let show: (title: string, docURL: string, toRightOf: unknown, insertListener: InsertListener, scene: unknown) => void = () => {};

    /** Lets the GUI set show. */
    export function setShow(newShow: typeof show): void
    {
        show = newShow;
    }
}
