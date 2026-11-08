# Transformations: making them, and editing them (Calculate, Filter and Check)

Java: `dialogs-non-expression/.../PickTransformationDialog.java`, `app/.../PickTableDialog.java` and
`PickTablePane.java`, `View.java` (`createTable`'s TRANSFORM and CHECK, `createTransform`, the picking
modes), `TableHighlights.java` (SELECT), `EditColumnExpressionDialog.java`, `EditExpressionDialog.java`,
`EditCheckExpressionDialog.java`, `TableDisplay.java` (`editAfterCreation`, `addColumnBefore_Calc`),
`TransformationEdits.java` (`editColumn_Calc`), `TableHat.java` (its Clickables), `CheckDisplay.java`,
`CheckSummaryLabel.java`, `MainWindow.java` (`ChecksLeftPane`); the engine's `Calculate`, `Filter` and
`Check`. Web: `src/gui/windows/TransformationDialogs.vue` (the dialogs, for `MainWindow.vue`),
`PickTransformationDialog.vue`, `PickTableDialog.vue`, `EditColumnExpressionDialog.vue`,
`EditExpressionDialog.vue`, `EditCheckExpressionDialog.vue`, `ChecksPane.vue`, `src/gui/grid/picking.ts`
(and `TableGrid.vue`'s pick pane), `GridTable.vue` and `GridTableDisplay.ts` (a Check's display),
`src/gui/project/columnLookupCopy.ts` (`CheckLookupCopy`); the engine's `createTransformation`,
`calculateColumn`, `setCalculateColumn`, `moveCalculateColumn`, `expressionDetails`, `setFilterExpression`,
`setCheck`, `createCheck` and `setSource`. Tests: `test/gui/expressions/` (`CalculatePath.test.ts`, and the
ports of the expression editor tests), `test/gui/transformations/` (`FilterAndCheck.test.ts`, and the ports
of `TestCalculate` and `TestFilter`), `test/gui/engine/ColumnLookupCopy.test.ts`.

## Making a transformation

- The new-table dialog's Transform (with at least one table) shows the transformations: a button each (150
  by 165: its title, a preview image 100 px wide, and its short explanation), three to a row, scrolling,
  centred where Transform was clicked, with Cancel. Not yet: all but Calculate and Filter are disabled
  (Phase 11; R, Phase 12).
- The transformation then asks for its source table (the table picker), and is made of it at the empty
  cell. A table's menu's Transform instead makes it of that table, to its right (Java's
  `TableManager.getNextInsertPosition`: just past its add-column arrows, or past the next table that starts
  there).
- A Calculate is made empty; its first column's dialog then shows, with "Enter the details for the first
  column to calculate." above it, and OK names the table after the column ("Calc DestCol": Java's
  `RenameOnEdit.renameToSuggested`). Cancel leaves the empty Calculate.
- A Filter is made keeping all rows (`true`); its expression's dialog then shows, the expression selected,
  and OK names it after the expression's first column ("Filt A").
- The new-table dialog's Check asks for the source table, then the Check's dialog (For all rows, `true`,
  selected); OK makes it at the empty cell (error: "Error creating check"). Cancel makes nothing.

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
- Only tables can be picked in the grid, not Checks (Java picked only from a `TableDisplay`); typing can
  pick any. Picking a new source for a transformation can't pick the transformation itself.

## Clicking a hat's parts

- The source table's name: the table picker, centred on the click; the picked table becomes the source
  (the name is kept; error: "Error editing table").
- A Calculate's column: its column dialog (as clicking its header).
- A Filter's expression: its dialog. A Check's expression: its dialog, with its type. OK renames the table
  after the new expression if its name was the suggested one (`RenameOnEdit.ifOldAuto`; error: "Error
  editing column").

## The expression dialogs (Filter and Check)

- Filter's: "Keep rows where:" above the expression editor (expecting a Boolean; with the row number), Cancel
  and OK to the side. Check's: "Check" (a combo box: For all rows, At least one row, No rows, Once) and
  "Test" (the expression), each with its help box; what the expression can refer to, and whether it has a
  row, follow the type (Once: no columns, no row). In Check's, Enter and Escape don't press its buttons,
  and Tab from the expression goes to OK; in Filter's they do, as usual.
- Neither is modal: a column clicked in the grid goes into the expression, if it can refer to it. (A
  Check's can't, as in Java: its lookup's references have no table, so none matches the column clicked.)
- The expression is focused at first, at its start. OK: with errors, they show and a second OK saves
  anyway (`light-dialog.md`).
- A reference to a column by its name alone is saved by Check with the source table's name (`T\A`), as
  Java does.

## A Check on the grid

- Its name (the header, `check-table-title`, red while failing: `check-failing`) above its result: "OK",
  "Fail", "Error" (an error with an explanation, also failing), or "ERR:" and the message. No column
  headers or rows; nothing to copy; no Goto row.
- Not yet: clicking the result (or Enter on it) to show why it failed (`ExplanationDisplay`, Phase 11).
- While there are Checks, a status bar at the bottom of the window counts those that pass: "Checks: 1/2
  OK" ("?" for the count while any has no result), red if not all pass, underlined while hovered.
  Clicking it shows the checks pane.
- The checks pane, down the left of the window (150 to 250 px): "Checks", then "Failing" and "Succeeding"
  with the Checks' names, sorted (those with no result aren't listed). Clicking a name selects that
  Check. A button at its top right closes it (as does View ▸ "Close left pane").

## The column expression dialog

- For a new column of a Calculate (its add-column arrow, or a column's "New column to left" or "to right":
  the new column goes at the end either way, as Java's `addColumnBefore_Calc` ignored the column; Java
  names the table after its columns if it had its suggested name: `RenameOnEdit.ifOldAuto`), or a
  Calculate's column (clicking its name or type; a column the Calculate doesn't calculate starts with its
  name as the expression).
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
- Not yet: the side pane, with Aggregate's split-by and recipe buttons (Phase 11, with Aggregate).

## Web differences

- A Check's result, and the count, come with the tables from the engine, worked out once for each version
  of the Check (Java worked them out on a worker thread as each Check was added).

- The expression's names are resolved (as the Calculate had resolved them) before it shows: the dialog
  checks it against its copy of what it can refer to.
