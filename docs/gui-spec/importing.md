# Importing

Java: `importers/.../gui/ImportChoicesDialog.java`, `ImporterGUI.java`, `manager/ImporterManager.java`
(`chooseAndImportFile`, `chooseAndImportURL`, `ImportURLDialog`, `PickImporterPane`, `PickImporterDialog`),
`HTMLImporter.java` (`PickHTMLTableDialog`, `getGUI`), `RImporter.java` (`PickImportsDialog`),
`GuessFormat.java` (the text import's `getGUI`), `View.java` (`createTable`'s IMPORT_FILE and IMPORT_URL,
`pasteIntoEmpty`), `Main.java` (registering the importers). Styles: `guess-format.scss`, `htmlimport.scss`.
Web: `src/gui/windows/import/` (`ImportDialogs.vue`, which shows them; `ImportChoicesDialog.vue`,
`ImportGrid.vue`, `importTrim.ts`, `ImportURLDialog.vue`, `PickImporterPane.vue`, `PickImporterDialog.vue`,
`PickHTMLTableDialog.vue`, `PickRTablesDialog.vue`), `src/gui/engine/importSessions.ts` (the importers'
dialogs, for the engine), `src/engine/importers/importers/gui/ImporterGUI.ts` (the choices' model). Tests:
`test/gui/importing/ImportDialog.test.ts`, `BugFixes.test.ts`, `test/engine/importers/ImporterGUI.test.ts`.

## Starting an import

- The new-table dialog's Import File... picks a file (the browser's file picker, offering the importers'
  file types; Java's had filters for "All Known Types", each importer, and "All files"), then imports it at the cell with
  the importer for its extension: text (`*.txt`, `*.csv`), HTML (`*.html`, `*.htm`), Excel (`*.xls`,
  `*.xlsx`, `*.xlsm`) or R (`*.rds`, `*.Rdata`), ignoring case (Java's matched with case, so "DATA.CSV"
  asked; fixed). If none
  handles it: "Pick importer for <name>" and the importers, as "name (*.ext, ...)", the first selected (or
  the one for its extension, ignoring case); OK with none: "Pick an importer". The tables imported are
  recorded at the cell.
- The new-table dialog's Import URL...: "Link:" (filled with the clipboard's text if it is a URL), "File
  type to import:" and the importers (the HTML one selected at first; typing a link selects the one for its
  extension, if any), and the error. OK checks the link ("URL cannot be blank"; one that isn't a URL gets
  "http://" in front), then downloads it ("Problem downloading: <why>") and imports it with the importer
  selected ("Must pick an importer" if none). The download is named after the link's last part (or its
  host, if it has none), which the importers suggest the table's name from. (Java named it as its
  temporary file: the link's path, only its letters and digits, a random number and ".tmp", so the table
  was suggested a name like "dataxlsx1234567890"; fixed.)
- Pasting into an empty cell when the clipboard has text but not Columnal's values imports the text
  (`tables.md`).

## The import dialog

- At the top, the import's choices, each a label, its help, and (Java: `ImporterGUI.makeGUI`) a label of the
  only option (or "No possible options for <label>"), or a combo box of the options ("Tab", "Space" and
  "None" for invisible ones), with "Other..." last where a value can be typed (a text field then shows,
  with its error). A choice that isn't one of the options shows as "Other..." with its text (none as the
  "" option, "None", or an empty text); with no "Other...", the first option is chosen. (Java showed the
  first option, while the choice stayed; fixed.) A text file's: "Encoding", "Column separator", "Column quote" (one character). An HTML table's:
  "Remove leading/trailing spaces from values" (checked), and for a page from Wikipedia, "Remove Wikipedia
  footnotes". Excel and R files have none.
- Below, "Original data" → "Imported preview", and the two side by side, scrolling together: the original
  (its column names, its rows, numbered), and the preview of the table (its column names and types, its
  rows, numbered); 100 px columns, 24 px rows. The area of the original to import is outlined in black; the
  preview is placed beside it, its rows level with the area's (its names and types in the two rows above).
- Changing a choice reloads the original if the format changed. With a different number of columns, the
  area is the one guessed for it; otherwise it stays. No format (e.g. no encoding): no preview.
- The area is changed by dragging (Java: `SrcDataDisplay`'s mouse pane): near its edges (5 px) the cursor
  shows which edges (corners too) a drag moves, to the grid line nearest the mouse; elsewhere, a drag makes
  a new area from the cell pressed to the cell whose top left corner is nearest the mouse. It is kept within
  the data (Java only kept it below the column names, so its left edge could go onto the row numbers;
  fixed). When the mouse is released, the preview is remade for it.
- Below: "Undo area" (back to the area before the last change; the 31 most recent are kept), "Reset area"
  (the area guessed; disabled until the original has loaded), and the area, as "Rows ↕ 2-4 of 4.  Columns ↔
  1-2 of 2." Each remakes the preview. (Java's didn't, so OK then imported the old area; and a newly
  loaded original added its area to the undo twice, so the first Undo after it changed nothing; fixed.)
- OK imports the table with the last preview's format, named after the file; Cancel imports nothing. Enter
  and Escape don't close it. It is resizable; at first the window's size less 100 px.

## Picking what to import

- An HTML file: "Choose HTML table to import" — "Click any red-bordered table to import it", above the page,
  in which each table that can be imported (one with no tables inside it) has a red overlay (redder while
  hovered); clicking one imports it (the import dialog). Cancel only. The page is in a sandboxed frame,
  without scripts (Java's WebView ran them), and its other links do nothing (Java's followed them).
- An R file with several tables: "Choose tables to import" and the tables, all selected at first (a click
  selects one; Ctrl/Cmd+click toggles one; Shift+click selects a range); OK is disabled while none is
  selected. They are imported side by side, a column apart. One table is imported straight away.

## Web differences

- The engine (in a Web Worker) has no DOM, so the page parses an HTML file, and reads the table picked,
  for the engine (`HTMLImporter.prepareForPicking` and `readTable`; `ImporterDialogs.pickHTMLTable`).
- Not yet (Phase 13): dragging the area near the grid's edge doesn't scroll it (Java nudged it); the split between
  the original and the preview can't be moved (Java's SplitPane).
- A downloaded link must allow the page to read it (CORS); Java could download any.
