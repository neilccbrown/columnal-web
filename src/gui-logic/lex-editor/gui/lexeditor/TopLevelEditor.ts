// Port of xyz.columnal.gui.lexeditor.TopLevelEditor (lex-editor module): only its enums, which the
// lexers use.
//
// The editor itself is src/gui/lexeditor/TopLevelEditor.vue (on CodeMirror).
export namespace TopLevelEditor
{
    export enum Focus { LEFT, RIGHT }

    // Note -- these names are used in lower-case for styleclasses so change the CSS
    // if you change the names here.
    export enum DisplayType
    {
        ERROR,
        WARNING,
        // Things that are like warnings but information, e.g.
        // this could be refactored, or this column is overridden in this calculate
        INFORMATION,
        // Information for entry.
        PROMPT,
    }
}
