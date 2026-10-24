// TS-only (no Java counterpart).  The dialogs that the importers show while importing.
//
// PORT-NOTE: the Java importers take the parent Window and show JavaFX dialogs themselves
// (ImportChoicesDialog, and dialogs for picking an HTML table, R tables or an importer), waiting
// for each with showAndWait.  The dialogs are rebuilt in the GUI (Phase 11), and the browser
// can't wait for one, so the importers take an ImporterDialogs in place of the Window.  Each
// method shows its dialog and calls `then` once it closes, with the result, or with null if it
// was cancelled (Java: showAndWait() returning an empty Optional).
import type { EditableRecordSet } from "../../data/data/EditableRecordSet.js";
import type { JavaFile } from "../../java/JavaFile.js";
import type { Pair } from "../../utility-adt/utility/adt/Pair.js";
import type { GuessFormat } from "./GuessFormat.js";
import type { Importer } from "./Importer.js";

export interface ImporterDialogs
{
    /** Java: new ImportChoicesDialog<>(parentWindow, suggestedName, importer).showAndWait() */
    showImportChoices<SRC_FORMAT, FORMAT>(suggestedName: string, importer: GuessFormat.Import<SRC_FORMAT, FORMAT>, then: (importInfo: GuessFormat.ImportInfo<FORMAT> | null) => void): void;

    /**
     * Java: HTMLImporter.PickHTMLTableDialog, which shows the document (with each table that can be
     * imported wrapped in a link to "gui_import:id<index>") and gives the index of the table clicked.
     */
    pickHTMLTable(doc: Document, then: (tableIndex: number | null) => void): void;

    /** Java: RImporter.PickImportsDialog, which picks some of the tables in an R file (all selected at first). */
    pickRTables(tables: readonly Pair<string, EditableRecordSet>[], then: (picked: readonly Pair<string, EditableRecordSet>[] | null) => void): void;

    /** Java: ImporterManager.PickImporterDialog, shown when no importer handles the file's extension. */
    pickImporter(src: JavaFile, importers: readonly Importer[], then: (importer: Importer | null) => void): void;
}
