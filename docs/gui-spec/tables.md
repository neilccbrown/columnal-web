# Tables: making them, and their parts of the grid

Java: `stf/.../VirtualGrid.java` (`CreateTableButtonSupplier`, `EmptyCellSelection`), `app/.../View.java`
(`createTable`, the `VirtualGridManager`), `dialogs-non-expression/.../NewTableDialog.java` and
`ExplainedButton.java`, `app/.../EditImmediateColumnDialog.java`, `dialogs-non-expression/.../ColumnNameTextField.java`,
`table-gui/.../TableNameTextField.java`, `app/.../ExpandTableArrowSupplier.java`, `app/.../table/app/TableDisplay.java`
(`addColumnOperation`, `addColumnBefore_IDS`, the record set's listener, `recalculateBottomRightIncl`).
Styles: `virtual-grid.scss` (`.create-table-grid-button`, `.expand-arrow`), `dialogs.scss` (`.explanation-button`,
`.new-button-list`). Tests: `TestBlankMainWindow`, and the screen checks of `TestTypeEditorError` and
`TestTypeQuickFix`. Web: `src/gui/grid/TableGrid.vue` (the button), `GridTable.vue` and `GridTableDisplay.ts`
(the arrows), `src/gui/components/dialogs/NewTableDialog.vue`, `src/gui/windows/EditImmediateColumnDialog.vue`
and `MainWindow.vue`, the engine's `typeInfo`, `createDataTable`, `addColumn` and `appendRows`, and
`src/gui/project/typeCopy.ts`. Tests: `test/gui/windows/BlankMainWindow.test.ts`,
`TypeEditorErrorScreen.test.ts`, `TypeQuickFixScreen.test.ts`.

The table's parts of the grid (step 5): Java `app/.../TableDisplay.java`, `TableHat.java`,
`TransformationEdits.java` (`editColumn_IDS`), `table-gui/.../DataDisplay.java` (column headers, `GotoRowDialog`),
`HeadedDisplay.java` (`TableHeaderItem`), `RowLabelSupplier.java` (the row label's menu),
`exporters/.../ExporterManager.java` (`PickExporterDialog`), `View.java` (`removeTable`, `gotoRowDialog`),
`VirtualGrid.java` (`HoverTip`). Tests: `TestTableEdits`, `TestRowOps`, `TestTableUpdate`,
`PropInsertRemoveRows`, `PropStorageSet`, `TestVirtualGridScrollCoordinates`. Web: `GridTable.vue`,
`TableHatView.vue`, `tableMenus.ts`, `TableGrid.vue` (the context menu, Enter on headers, hover text),
`src/gui/windows/GotoRowDialog.vue`, `ExportDialog.vue`, the engine's table operations, and
`src/gui-logic/app/gui/table/app/TableHat.ts` (the hat's text). Tests: `test/gui/tables/`,
`test/gui/grid/ScrollCoordinates.test.ts`, `test/gui-logic/app/TableHat.test.ts`,
`test/engine/tests-gui-central/`.

## Making a table

- A selected empty cell shows a "New…" button over it (at least the cell's width). Clicking it, or
  activating the cell (Enter), offers to make a table there.
- The new-table dialog (380 × 290, centred on the click, or on the cell's centre from the keyboard; Cancel):
  "Tables are either plain data (left) or transformations of other tables (right)", then two columns of
  buttons, each with its title and a small grey explanation: Data Entry ("Type in data directly."), Import
  File..., Import URL..., Comment on the left; Transform and Check on the right, which need a table to
  exist. Data Entry has the focus. Comment makes a comment (`comments.md`); Transform picks the
  transformation, then its source table; Check picks its source table, then its type and expression
  (`transformations.md`). Not yet: importing is disabled (Phase 11).
- Data Entry opens the column dialog for a new table; OK makes the table at the cell, with that one column
  and no rows. An error doing so shows in an alert ("Error creating first column").

## The column dialog

- Buttons down the side (OK, Cancel); resizable; Escape doesn't close it (the type editor uses Escape).
- For a new table, first "Table name" (blank for an automatic name: the placeholder says "Automatic"); its
  error if another table has the name ("Table "X" already exists"), and a warning if one differs only in
  case ("Similar name to existing table: "Foo""; Java bug, fixed: Java quoted the name twice). Enter in it
  goes to the column name.
- "All tables must have at least one column.  All columns must have a name and a type." (the first
  sentence only for a new table), then "Column name" (spaces collapsed; "Column name cannot be blank", or
  the invalid character), "Column type" (the type editor: a concrete type, not empty), and "Default value"
  (disabled until the type is valid; then the type's default value, which can be changed: what's typed is
  recognised when it loses the focus, with its errors shown). Each row has its help button.
- Focus starts on the table name, or for a new column on the column name; Tab goes on to the type, then the
  default value.
- OK shows the type's errors, and gives the first of "Invalid table name", "Invalid column name", "Invalid
  column type", "Invalid default value: <error>" under the fields, or closes the dialog.

## Adding columns and rows

- A data table has a column of "⟶" arrows to its right (beside the column names, types and data rows), and
  a row of "↓" arrows below its data (under each column); the table's area includes them. They are grey on
  the cell colour, white while hovered (Java whitened all of the table's arrows of that kind), with
  "Click to add column" and "Click to add row" tooltips.
- "⟶" opens the column dialog (no table name); OK adds the column at the right of the table, with the
  default value in each row ("Error adding column" if it fails). "↓" adds a row of default values.
- Selecting an arrow's cell and pressing Enter does the same.
- After a change, the tables that depend on the table are re-run, and the project is saved (so Undo goes back
  to before it). A Calculate's "⟶" opens the column expression dialog for a new column
  (`transformations.md`). Not yet: Aggregate's arrows (Phase 11).

## The table name

- The name row holds the table's name in a text field (Java: `TableNameTextField`), sized to its text (at
  least 30 px, at most the row), on the header's colour, with a border while hovered or focused. A click on
  it edits the name (it isn't reached by Tab); elsewhere on the row, a click selects the entire table, and a
  drag moves it.
- The name must be a table name not used by another table ("Table "X" already exists"; a warning if one
  differs only in case), and not blank ("Table name cannot be blank"). Enter selects the entire table
  (taking the focus from the field). When the field loses the focus, a valid new name renames the table
  (the tables using it are updated).
- A middle click on the row (not while the field is focused) cycles the columns shown: all (or custom) to
  altered (if some but not all columns are altered), to collapsed, to all.
- Selecting the entire table can flash its header (brightening and back twice, 300 ms each way).

## The table's menu

- Right-clicking the name row (not the field) selects the entire table and shows its menu; Enter on the
  name row shows it below the row. Items (`id-tableDisplay-menu-…`):
  - "Show columns..." ▸ Collapse table, All columns, Altered columns, Custom (checked for the current one).
    Collapsed, the table is just its name row; altered shows the columns a transformation changed or made.
    Which is shown is saved (`SHOWCOLUMNS`). Custom asks which columns to hide (the hide-columns panel,
    `transformations.md`); cancelled, the display stays as it was. The other items clear the list Custom
    hides (a middle click on the name row keeps it).
  - "Copy Values": all the table's columns' values (not just those shown) to the clipboard ("Error copying
    values" if they can't all be worked out).
  - "Export Data...": a dialog lists the exporters as "name (*.ext, …)", the first selected ("Pick
    Exporter"); double-click or OK picks one ("Pick an exporter" if none). The table is exported, and
    downloaded as `<table>.<ext>` (Java: a save dialog). Errors: "Error exporting".
  - "Delete table": deletes it (as Delete or Backspace on the entire table selected). If it was selected,
    the cell where it was is then selected (so the "New…" button shows there).
  - (separator) "Transform...": picks a transformation of the table, made to its right
    (`transformations.md`).
  - A Check's menu has only "Delete table".

## Column headers

- Column names (bold if the column is a transformation's own, Java's `column-title-overwritten`) and types
  show their whole text as a tooltip. A data table's column name or type can be clicked (underlined when
  hovered, a pointer cursor), as can Enter on it selected: the column dialog for the column (its name, its
  type, and its default value), focused on the name or the type. (Java bug, fixed: Java showed the type's
  default value, so OK reset a column's own default.) While the type is the column's, the default value
  field starts with the column's default; for another type, with that type's. OK changes the
  column: a new type or default value remakes the table, converting each value from its text (those that
  don't convert become invalid values); a new name updates the tables that use the column. Errors: "Error
  saving column". Clicking any of a Calculate's columns' names or types opens the column expression dialog
  for it (`transformations.md`). Not yet: Aggregate's columns (Phase 11).
- Right-clicking a column name or type shows the column's menu (`id-virtGrid-column-…`, `id-recipe-…`):
  - For a data table: "New column to left", "New column to right" (the column dialog, then the column is
    added there).
  - "Delete column", if the table can delete it (a data table's columns, a Calculate's own columns). Delete
    or Backspace on the column's name (or the name row above it, as Java has it) deletes it too.
  - "Recipes" (a heading), then, in the recipe style (Kalam font, a pale yellow background): "Calculate
    sum" and "Calculate average" (number columns), "Make frequency table", "Sort by": each makes a
    transformation (an Aggregate of `sum` or `average` of the column into "Sum <column>" or "Average
    <column>", a count by the column into "Freq <column>", or a Sort ascending), placed to the right of the
    other tables. "Transform type": not yet (its dialog is Phase 11's).
  - With nothing to show: "No operations" (disabled).

## Row labels

- Right-clicking a row label shows (for a data table) "New row above", "New row below" and "Delete row"
  (`id-virtGrid-row-…`); the tables that use it are re-run, and the change saved. Errors: "Error inserting
  rows", "Error removing rows" (Java logged them).

## Goto row

- View ▸ "Goto row..." asks, for the table selected, for a row number (from 1), then selects that row in the
  selected column. Its field's errors: "Number outside range of table rows (1-N)", "Not a number: For input
  string: "x"" (Java's message); OK does nothing until it's valid. With no table selected, nothing happens.

## A transformation's hat

- Above a transformation's table (if there's room: indented 20 px, as wide as the table less the indent but
  at least 200 px, and no wider than its text), else over the header right of the name, else over the
  name, a box describing it, in grey on light grey with a rounded border: e.g. "From T calculate Double",
  "Sort T by A↑, B↓", "Filter T, keeping rows where: <expression>" (at most 60 characters), "Aggregate T
  splitting by A", "Edit T to change N entries identified by row number". The source table's name and the
  editable parts are underlined (with tooltips: "Click to change source table", "Click to change"); a source
  that no longer exists has `broken-link`.
- "◄" at the end collapses it to the transformation's kind ("Calculate ►"), and back; a middle click on it
  does the same. A middle click on the source table's name selects that table.
- After the pointer has been over the source table's name for 300 ms, that table is highlighted (a green
  translucent rectangle with a 3 px outline) with a curved green arrow from its centre to where the pointer
  was (Java: `TableHighlights`, SOURCE), until the pointer leaves the name.
- Clicking the parts edits the transformation (`transformations.md`): the source table's name picks a new
  source; a Filter's or Check's expression, or a Calculate's column, opens its dialog. Not yet: the other
  parts' dialogs (Phase 11; R's, Phase 12).

## Hover text

- After the pointer has been over a data cell whose text is cut off (wider than the cell by more than 3 px,
  or a number shortened with "…") for a second, the whole text shows in a small box (at most 200 px wide)
  just below the cell's bottom right, until the pointer moves to another cell.

## Web differences

- One context menu serves the grid: what it shows depends on what was right-clicked, and it doesn't take
  the selection away (Java's menus were popups which left the window focused). A text field's right click
  shows the browser's own menu.
- The grid's layers (the hats, row labels, column names) stay under dialogs and menus (they're in their own
  stacking context).
- A table renamed or remade (a new version) is a new table on the grid, as in Java; if the old one was
  selected, the cell at its position is selected once the tables have all changed (Java did it before the
  new one was added, so the "New…" button could show over it).
- The dialogs and the type editor need the project's types and units as the user types, so they use a copy
  made on the main thread from the engine's (`typeInfo`) each time the column dialog opens. The column's
  type goes to the engine as its saved text, and the default value as its display text, which the engine
  recognises again.
- Not done: the blur over the grid while the new-table dialog shows, and Java's tooltip arrow hovering.
- Not yet: offering a Manual Edit when a transformation's cell is edited, and the guidance when a data
  cell's text starts with "=" (both need Phase 11's dialogs); a transformation's "Why?" cell menu item
  (Phase 11, with explanations); R's "Re-evaluate" in the name row (Phase 12).
