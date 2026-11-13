# Transformations: making them, and editing them (Calculate, Aggregate, Filter, Check, Sort, Join, Concatenate and Hide columns)

Java: `dialogs-non-expression/.../PickTransformationDialog.java`, `app/.../PickTableDialog.java` and
`PickTablePane.java`, `View.java` (`createTable`'s TRANSFORM and CHECK, `createTransform`, the picking
modes), `TableHighlights.java` (SELECT), `EditColumnExpressionDialog.java`, `EditExpressionDialog.java`,
`EditCheckExpressionDialog.java`, `TableDisplay.java` (`editAfterCreation`, `addColumnBefore_Calc`),
`TransformationEdits.java` (`editColumn_Calc`), `TableHat.java` (its Clickables), `CheckDisplay.java`,
`CheckSummaryLabel.java`, `MainWindow.java` (`ChecksLeftPane`), `EditSortDialog.java`, `EditJoinDialog.java`,
`TableListDialog.java`, `HideColumnsPanel.java`, `HideColumnsDialog.java`, `CustomColumnDisplayDialog.java`,
`AggregateSplitByPane.java`, `EditAggregateSplitByDialog.java`, `SelectColumnDialog.java`, `ExpressionRecipe.java`,
`PickTypeTransformDialog.java`, `EnterValueDialog.java` (and `TableDisplay.java`'s `transformType`,
`addColumnBefore_Agg`, `TransformationEdits.java`'s `editColumn_Agg` and `editAggregateSplitBy`);
the engine's transformations. Web: `src/gui/windows/TransformationDialogs.vue` (the dialogs, for `MainWindow.vue`),
`PickTransformationDialog.vue`, `PickTableDialog.vue`, `EditColumnExpressionDialog.vue`,
`EditExpressionDialog.vue`, `EditCheckExpressionDialog.vue`, `ChecksPane.vue`, `EditSortDialog.vue` (and
`SortPane.vue`, `sortDirection.ts`), `EditJoinDialog.vue`, `TableListDialog.vue`, `HideColumnsDialog.vue`,
`EditAggregateSplitByDialog.vue`, `SelectColumnDialog.vue`, `PickTypeTransformDialog.vue`, `EnterValueDialog.vue`,
`src/gui/components/AggregateSplitByPane.vue`, `src/gui/engine/typeTransforms.ts`,
`src/gui/components/PickTablePane.vue`, `HideColumnsPanel.vue`, `ListView.vue`, `src/gui/grid/picking.ts`
(and `TableGrid.vue`'s pick pane), `GridTable.vue` and `GridTableDisplay.ts` (a Check's display),
`src/gui/project/columnLookupCopy.ts` (`CheckLookupCopy`, `AggregateLookupCopy`); the engine's `createTransformation`,
`setAggregateColumn`, `setAggregateSplitBy`, `typeTransforms`, `createTypeTransform`,
`calculateColumn`, `setCalculateColumn`, `moveCalculateColumn`, `transformationDetails`,
`setFilterExpression`, `setCheck`, `createCheck`, `setSource`, `setSort`, `setJoin`, `setConcatenate`,
`toggleConcatenateMarker`, `setHiddenColumns` and `setDisplay`. Tests: `test/gui/expressions/` (`CalculatePath.test.ts`, and the
ports of the expression editor tests), `test/gui/transformations/` (`FilterAndCheck.test.ts`, and the ports
of `TestCalculate`, `TestFilter`, `TestSort`, `TestJoin`, `TestHideColumns` and `TestColumnRecipes`, and
`SortJoinConcatenateHide.test.ts`, `Aggregate.test.ts`), `test/gui/engine/ColumnLookupCopy.test.ts`.

## Making a transformation

- The new-table dialog's Transform (with at least one table) shows the transformations: a button each (150
  by 165: its title, a preview image 100 px wide, and its short explanation), three to a row, scrolling,
  centred where Transform was clicked, with Cancel. Not yet: Edit and R are disabled (Phase 11; R, Phase
  12).
- Calculate, Aggregate, Filter, Sort and Exclude columns then ask for their source table (the table picker), and are
  made of it at the empty cell; Join and Concatenate are made at once, of no tables. A table's menu's
  Transform instead makes it of that table (Join and Concatenate of none), to its right (Java's
  `TableManager.getNextInsertPosition`: just past its add-column arrows, or past the next table that starts
  there). Each then shows its dialog, and OK names it as suggested (Java's `RenameOnEdit.renameToSuggested`).
- A Calculate is made empty; its first column's dialog then shows, with "Enter the details for the first
  column to calculate." above it, and OK names the table after the column ("Calc DestCol": Java's
  `RenameOnEdit.renameToSuggested`). Cancel leaves the empty Calculate.
- An Aggregate is made with no columns, across the whole table; its first column's dialog (with the split)
  then shows, and OK names it after its split and columns ("Agg N", "Agg N by B"). Cancel removes it.
- A Filter is made keeping all rows (`true`); its expression's dialog then shows, the expression selected,
  and OK names it after the expression's first column ("Filt A").
- Sort's dialog starts with one column to edit; Concatenate's with one table to edit (Java centred it on
  the screen's top left: here, the window's centre).
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
- Sort's columns, Join's tables or columns, Concatenate's tables, Exclude columns' "(edit)": their dialogs
  (Sort's and Concatenate's centred on the click), renaming as above (errors: "Error editing sort", "Error
  editing join", "Error editing concatenate", "Error hiding column"). Concatenate's "with/without source
  column" toggles it, with no dialog and no rename. While Concatenate's tables are hovered, they are all
  highlighted (as a source table is).
- An Aggregate's split (its columns, or "across whole table"): the split dialog, renaming as above (error:
  "Error editing aggregate").
- Not yet: Edit's parts (Phase 11), R's (Phase 12).

## Sort's dialog

- "Choose the columns to sort by", then a list (`fancy-list.md`) of columns, each a field (completions of
  the source's columns containing the text; "Type column name or click on column" above it while focused)
  and a direction button: the column type's smallest and largest examples (1 and 99, A and Z, 1965 and
  2016, 00:00 and 11:21, false and true, a tag's name around its inner type's, a record's first field's,
  a list's...) in order, beside a triangle pointing the way, ascending at first; clicking it swaps. The
  buttons are all as wide as the widest. Then the error.
- It isn't modal: a column of the source or the Sort clicked in the grid goes into the field edited in the
  last 200 ms, else is added at the end (ascending).
- OK: a name that isn't a valid column name is an error ("Invalid column name"), and it stays.

## Join's dialog

- "Select two tables to join together" (help), the primary and secondary tables (table name fields, as the
  table picker's, not including the Join), "Select which columns to use to match the rows together" (help),
  a list of pairs of column fields ("="; not reordered), "Include unmatched primary rows" (a tick box, help),
  and the error. Escape doesn't close it. The primary table is focused at first; picking it focuses the
  secondary, which focuses the list's Add.
- It isn't modal: a table or column clicked in the grid goes into the field focused in the last 500 ms (a
  table field takes a table; a column field takes a column of its side's table). Of several, the one
  focused most recently wins (Java's, the one focused earliest, was a bug).
- OK: tables or columns that aren't valid names are errors ("Valid source table names required", "Valid
  match column names required").

## Concatenate's table list

- "Choose the tables to concatenate", then a list of table name fields (as the table picker's, not
  including the Concatenate), and the error. A table picked (a completion chosen, or Enter on its exact
  name) or typed is taken (Java took only a table picked, a bug: typed alone, it stayed as it was).
- It isn't modal: a table clicked in the grid goes into the field edited in the last 200 ms, else is added
  at the end.
- OK: a name that isn't valid is an error ("Invalid table name").

## The hide-columns panel (Exclude columns, and Custom columns)

- "Excluded columns" (left) and "Remaining columns" (right: the source's other columns; "None" if there are
  none; "Could not find source table." or "Error:" and the message if they can't be had), with a button
  between: "<< Hide" while remaining columns are selected, "Show >>" while excluded ones are, else
  "Transfer", disabled. Selecting in one list clears the other's selection.
- Several remaining columns can be selected (Shift, Ctrl/Cmd), and dragged to the excluded list; a double
  click (or Enter, in the remaining list) moves one across.
- The excluded columns are kept in the source's order (Java's put those excluded before first, by name, a
  bug).
- OK and Cancel.

## The expression dialogs (Filter and Check)

- Filter's: "Keep rows where:" above the expression editor (expecting a Boolean; with the row number), Cancel
  and OK to the side. Check's: "Check" (a combo box: For all rows, At least one row, No rows, Once) and
  "Test" (the expression), each with its help box; what the expression can refer to, and whether it has a
  row, follow the type (Once: no columns, no row). In Check's, Enter and Escape don't press its buttons,
  and Tab from the expression goes to OK; in Filter's they do, as usual.
- Neither is modal: a column clicked in the grid goes into the expression, if it can refer to it (for a
  Check, the source's columns, unless it is Once). (Java's Check took none: a bug fixed.)
- The expression is focused at first, at its start. OK: with errors, they show and a second OK saves
  anyway (`light-dialog.md`).
- A reference to one of a Check's source's columns is by its name alone, so it follows a new source.
  (Java's was resolved with the source's name, `T\A`: a bug fixed.)

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
- A column clicked in the grid goes into the field focused last (Java's, the one focused earliest in the
  last 250 ms, was a bug, as in Join's dialog).

## An Aggregate's column expression dialog

- For a new Aggregate's first column; a new column of an Aggregate (its add-column arrow, or a column's "New
  column to left" or "to right": at the end either way), or one of its calculated columns (clicking its name
  or type; not those it splits by). OK renames it after its columns and the split chosen if its name was
  the suggested one (Java named a new column's Aggregate after its old split, a bug).
- As the column expression dialog, with "Expression to calculate:" above it, the expression editor 300 px
  wide, and to its left the split: "Calculate each expression once per:", then radio buttons "Whole table"
  and "Each unique value of:" (each with its help box), and below them the list of columns (shown only for
  the second; choosing it with none adds one, focused). Each column has completions of the source's columns
  containing the text, and "Type column name or click on column" above it while focused. "Add column" adds
  one; columns can be deleted and reordered (`fancy-list.md`). The expression refers to the source's
  columns as lists of the group's values, and those split by as single values (and "group count"), as the
  Aggregate is (not as the split being chosen).
- Choosing "Whole table" hides the list, and the Aggregate isn't split (whatever the list holds; Java's
  list was still the split, a bug). Otherwise a column that isn't a valid name stops OK.
- A column of the source clicked in the grid, while a split column was focused last, goes into the column
  edited in the last 200 ms, else is added at the end.
- While the expression is empty, recipe buttons above it: "Count" (sets it to `group count`), "Sum…",
  "Lowest…" and "Highest…", which ask for columns in a dialog of their own, then set the expression
  (`sum(column)`; `minimum(column)`, or with a different result column, `element(result, minimum
  index(column))`; likewise `maximum`).
- The columns' dialog (not modal): a row per column asked for: "Source column:" (Sum's: completions only of
  number columns), or "Compare column:" and "Result column:" (with help boxes), each with completions of the
  source's columns containing the text and "Type column name or click on column" above it while focused.
  The first is focused. Choosing a column (a completion, or a column of the source clicked in the grid,
  which goes into the field focused last) focuses the next field with its text selected, and Result, if
  blank, is set to the column chosen for Compare (Java set it whatever it held, a bug). OK with a field that
  isn't a valid name: "Invalid column name".

## The split dialog

- From an Aggregate's hat: the split as in the column dialog, and the error. It isn't modal: a column of the
  source clicked in the grid goes into the column edited in the last 200 ms, else is added at the end. OK
  with a column that isn't a valid name: "Invalid column name".

## Transform type (the column menu)

- The types the column's values could become, judged from up to half a second's sample of its values:
  for a number, Text, and Boolean if the column has no unit and holds only 0s and 1s (some of each); for
  text (with some values; Text isn't offered), Number, Optional(Number), each date and time type and
  Boolean, each kept if it fails for at most a fifth of the sample; for a Boolean, Text and Number; for a
  date or time, Text and the smaller ones it can be cut to; for an Optional, its inner type, and Text;
  otherwise Text.
- The dialog: "Type to transform into:" and the list (the first selected and focused), with OK and Cancel to
  the side; with none, "No suitable destination types" and OK disabled. OK makes a Calculate of the table,
  to the right of the others, giving the column the expression (`to text`, `extract number`, `from text
  to`, ...; errors: "Error investigating type transformation", "Error making type transformation").
- For an Optional's inner type, a dialog first asks for the value for None (a field recognising the type,
  starting with its default value selected; an invalid value is the error), and the expression is `get
  optional or(column, value)`.

## Web differences

- A Check's result, and the count, come with the tables from the engine, worked out once for each version
  of the Check (Java worked them out on a worker thread as each Check was added).

- The expression's names are resolved (as the Calculate had resolved them) before it shows: the dialog
  checks it against its copy of what it can refer to.
