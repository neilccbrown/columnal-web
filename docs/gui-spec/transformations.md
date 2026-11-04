# Transformations: making them, and editing a Calculate's columns

Java: `dialogs-non-expression/.../PickTransformationDialog.java`, `app/.../PickTableDialog.java` and
`PickTablePane.java`, `View.java` (`createTable`'s TRANSFORM, the picking modes), `TableHighlights.java`
(SELECT), `EditColumnExpressionDialog.java`, `TableDisplay.java` (`editAfterCreation`,
`addColumnBefore_Calc`), `TransformationEdits.java` (`editColumn_Calc`); the engine's `Calculate`. Web:
`src/gui/windows/PickTransformationDialog.vue`, `PickTableDialog.vue`, `EditColumnExpressionDialog.vue`,
`src/gui/grid/picking.ts` (and `TableGrid.vue`'s pick pane), `MainWindow.vue`; the engine's
`createTransformation`, `calculateColumn`, `setCalculateColumn` and `moveCalculateColumn`. Tests:
`test/gui/expressions/` (`CalculatePath.test.ts`, and the ports of the expression editor tests).

## Making a transformation

- The new-table dialog's Transform (with at least one table) shows the transformations: a button each (150
  by 165: its title, a preview image 100 px wide, and its short explanation), three to a row, scrolling,
  centred where Transform was clicked, with Cancel. Not yet: all but Calculate are disabled (Phase 11; R,
  Phase 12).
- Calculate then asks for its source table (the table picker), and makes an empty Calculate of it at the
  empty cell; its first column's dialog then shows, with "Enter the details for the first column to
  calculate." above it, and OK names the table after the column ("Calc DestCol": Java's
  `RenameOnEdit.renameToSuggested`). Cancel leaves the empty Calculate.

## The table picker

- A dialog with a field (400 px; "Click on a table or type table name" above it while focused) and Cancel
  to its right. It isn't modal: while it shows, the grid is covered by a picking pane.
- The field's completions are the tables' names containing the text (`autocomplete.md`). Enter or Tab picks
  the selected one, or the table whose name is exactly the text; a double click picks one.
- Over the grid, the table under the pointer is highlighted (a rectangle around it, with an arrow from its
  centre to the nearest point of the dialog: `TableHighlights`' SELECT), with a pointer cursor; clicking
  picks it. At first the table where Transform was clicked is highlighted. The wheel still scrolls the
  grid.
- Picking a table closes the dialog.

## The column expression dialog

- For a new column of a Calculate (its add-column arrow, or a column's "New column to left" or "to right":
  the new column goes at the end either way, as Java's `addColumnBefore_Calc` ignored the column; Java
  names the table after its columns if it had its suggested name: `RenameOnEdit.ifOldAuto`), or a Calculate's column (clicking its name or type; a
  column the Calculate doesn't calculate starts with its name as the expression).
- The column's name (with the help box; completions of the source table's columns starting with the text,
  ignoring case, once the text has changed from the column's) and its expression (`expression-editor.md`;
  with the help box). Tab in the name goes to the expression. The name is focused at first. Cancel and OK
  are to the side. Enter and Escape don't press them.
- It isn't modal: a column clicked in the grid goes into whichever of the expression and the name was
  focused last: into the expression (at its selection) if the expression can refer to it (by name for the
  source's columns, else with its table's name; not the column being edited, nor one the Calculate
  overwrites, which is highlighted only then), or as the name if the source has a column of that name. Not
  in the 400 ms after a completion was chosen by clicking.
- OK: with no valid name, the errors show and it stays; with errors in the expression, they show and a
  second OK saves anyway (`light-dialog.md`'s double OK). The Calculate is remade with the column (replacing
  the one edited, if renamed); errors: "Error adding column", "Error saving column".
- The expression editor's fix "Make a new calculation that can use this table's X" closes the dialog and
  makes a new Calculate of this one with the column, which leaves this one.
- A fix declaring a unit sends the project's types and units to the engine.

## Web differences

- The expression's names are resolved (as the Calculate had resolved them) before it shows: the dialog
  checks it against its copy of what it can refer to.
