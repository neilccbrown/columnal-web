# Making data tables, columns and rows

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

## Making a table

- A selected empty cell shows a "New…" button over it (at least the cell's width). Clicking it, or
  activating the cell (Enter), offers to make a table there.
- The new-table dialog (380 × 290, centred on the click, or on the cell's centre from the keyboard; Cancel):
  "Tables are either plain data (left) or transformations of other tables (right)", then two columns of
  buttons, each with its title and a small grey explanation: Data Entry ("Type in data directly."), Import
  File..., Import URL..., Comment on the left; Transform and Check on the right, which need a table to
  exist. Data Entry has the focus. Not yet: everything but Data Entry is disabled (importing and
  transformations in Phase 11, comments in step 6).
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
  to before it). Not yet: the arrows of Calculate and Aggregate tables (whose columns need the expression
  editor, Phases 10 and 11).

## Web differences

- The dialogs and the type editor need the project's types and units as the user types, so they use a copy
  made on the main thread from the engine's (`typeInfo`) each time the column dialog opens. The column's
  type goes to the engine as its saved text, and the default value as its display text, which the engine
  recognises again.
- Not done: the blur over the grid while the new-table dialog shows, and Java's tooltip arrow hovering.
