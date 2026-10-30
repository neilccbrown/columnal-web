# Cell editor

Java: `stf/.../dtf/DocumentTextField.java` (on `TextEditorBase`), the documents (`Document`,
`DisplayDocument`, `ReadOnlyDocument`, `RecogniserDocument`), `stable/EditorKitCache.java` (which document
a cell gets, and its Saver in `TableDisplayUtility.GetValueAndComponent.makeDisplayCache`),
`table-gui/.../DataCellSupplier.java` (starting an edit, the expanded cell), `DataDisplay.java` (where
the selection goes after an edit, deleting) and `app/.../TableDisplay.java` (`onModify`, `deleteValue`).
Styles: `virtual-grid.scss` (`.table-data-cell:expanded`, `:has-error`), `general.scss` (`.text-editor`).
Tests: `TestDocumentTextField`, `TestCellReadWrite`, the editing half of `TestNumberColumnDisplay`.
Web: `src/gui/components/DocumentTextField.vue`, `src/gui/grid/CellEditDocument.ts`, the editing part of
`src/gui/grid/TableGrid.vue`, `GridTableDisplay.edit`/`deleteCells`, the engine's `canEdit`, `edit` and
`deleteCells` requests (`src/gui/engine/`), and `src/gui/grid/alerts.ts`.

## Starting an edit

- Enter or Space on a selected data cell (keyboard activate) edits it with all its text selected.
- Typing a character on a selected cell edits it with the text replaced by that character (after the
  focus is gained, so that undo goes back to the old text).
- Clicking the cell that is selected by itself, or double-clicking a cell, edits it with the caret where
  the click was. For a number shortened by `NumberColumnFormatter`, the position in the shown text is
  mapped to the whole number's (`Document.mapCaretPos`).
- A cell still loading can't be edited.
- The cell's document: for a value or invalid value in an editable column, a `RecogniserDocument`
  (web: `CellEditDocument`); in a read-only column, `ReadOnlyDocument(text)`; for an error,
  `ReadOnlyDocument(text, true)`.
- While editing, the cell expands to 350 × 110 px over the grid (rounded corners but the top left, a
  shadow), and its text wraps; it shows the whole text (numbers unshortened), left-aligned.
- If the column's `EditableStatus.checkEditable` refuses the row (a ManualEdit row whose identifier is an
  error), the edit is cancelled and an alert says "Cannot edit value on a row with an error in the
  identifier column."; when it closes, the cell is selected again.

## Editing (DocumentTextField)

- Typing replaces the selection. Left and Right move the caret one character and collapse the selection
  there; with Shift, the selection extends. Home and End go to the ends. Up, on one line, goes to the
  start; expanded, Up and Down move between lines.
- Backspace and Delete delete the selection, else one character.
- Ctrl/Cmd+A selects everything; Ctrl/Cmd+X, C and V cut, copy and paste plain text.
- A press puts the caret there (and the anchor, unless Shift is down); dragging selects; a double click
  selects everything.
- Ctrl/Cmd+Z and Escape go back to the text the cell had when the edit began.
- The field keeps the caret in view, scrolling 10 px past it when it moves out (sideways on one line,
  down and up when expanded).
- The `has-error` style shows while the cell's value had an error when the edit began (the recogniser
  only runs when the edit ends).
- A read-only document can be selected and copied but not changed.

## Ending an edit

- Enter: the edit ends and the cell below is selected (even below the table's last row). Tab and Escape:
  the edit ends and the cell stays selected. Clicking elsewhere ends it too.
- When the edit ends, if the text changed it is stored: the column's recogniser reads it; the value is
  stored, or the text as an invalid value if it can't be read. Then the tables that depend on the table
  are re-run. The cell shows what was stored.
- Storing into a transformation's column is cancelled (Java then offers to make a Manual Edit).
- An error storing the value ("Error storing data value"), or re-running the dependent tables ("Error
  updating dependent transformations"), is shown in an alert (title as the header, then the message, an
  OK button). Alerts show one at a time.
- Escape, Enter and Tab end the edit of a read-only document as for an editable one. (Java bug, fixed:
  `ReadOnlyDocument` kept `Document`'s `defocus`, which does nothing, so only clicking elsewhere did.)

## Deleting

- Delete or Backspace on selected data cells sets them to their columns' default values, for editable
  columns with a default, then re-runs the dependent tables. (Java bug, fixed: it only changed the cells
  that existed, those on screen, so the rest of a large selection was left as it was.)

## Web differences

- The field is a native textarea, so typing, input methods, the clipboard, dragging to select and
  scrolling while typing are the browser's; Java's keys above are handled on top. Java drew its own caret
  and selection.
- Java moved the caret, and deleted, one UTF-16 unit at a time, so it could split a surrogate pair; the
  textarea goes one code point, and clicks land between graphemes.
- Text can't be dragged and dropped within the field (Java had no dragging of text): a press in the
  selection places the caret.
- Expanded, the field has a scroll bar where Java faded the text at the top and bottom edges.
- The recogniser runs in the engine when the edit is stored (Java's `RecogniserDocument` also ran it only
  then), so the page needs no copy of the column's type. The cell then shows the value as the engine
  gives it (`DataTypeUtility.valueToString`), where Java kept the recogniser's replacement text until the
  cell was reloaded.
- An edit of a table that was replaced while it was being edited is not stored, and an alert says so (in
  Java, tables changed on one thread, so this couldn't happen).
- Not yet: the guidance shown when a data cell's text starts with "=" (Java: `DataCellSupplier`'s
  `GuidanceWindow`, Phase 9), the cell's context menu items (`getAdditionalMenuItems`, Phase 9), hover
  text for cut-off values, and marking the file as modified (Phase 9).
