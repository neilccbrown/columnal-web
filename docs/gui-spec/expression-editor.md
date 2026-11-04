# Expression editor

Java: `lex-editor/.../ExpressionEditor.java` (a `TopLevelEditor` on `ExpressionLexer`), `DocWindow.java`,
`transformations/.../MultipleTableLookup.java` (what the editor can refer to). Styles:
`expression-editor.scss`, `autocomplete.scss`. Web: `src/gui/lexeditor/ExpressionEditor.vue`,
`docWindows.ts` and `DocWindowHost.vue`; `src/gui/project/columnLookupCopy.ts` and
`src/gui/engine/columnLookupInfo.ts`. The editor itself is the lex editor (`lex-editor.md`). Tests:
`test/gui/lexeditor/ExpressionEditor.test.ts`, `test/gui/engine/ColumnLookupCopy.test.ts`,
`test/gui/expressions/` (the ports of `tests-gui-expression-editor*`).

## The editor

- 450 px wide, at least 130 px high (the other lex editors: 250 by 25).
- Made with the expression (saved for the editor), the column lookup, the expected type (if any), the
  type manager, the type state and the functions. Its value is the expression the lexer makes.
- The lexer checks the expression as it is edited: its errors, completions (columns, tables, functions,
  tags, variables, keywords, operators and guides), information and fixes are the lex editor's.

## What it can refer to (web)

The tables are in the engine's worker, but the lexer checks each edit as it is made, so the editor
checks against a copy: when it opens, the engine sends what it needs for the table being edited and its
source table (`columnLookup`: every table's columns and their types, and the tables available to the
table being edited), and `ColumnLookupCopy` answers the lexer as `MultipleTableLookup` does over the
`TableManager`, method by method. It has the types only (the editor never needs the values). Its column
being edited, and the action that moves the expression to a new Calculate, come from the dialog.

- Available: the source table's columns by name; other tables' columns with the table's name, from the
  tables which don't depend on the table being edited; those tables by name.
- A column of the table being edited which the table recalculates, used by name, has the note "Note:
  column X is re-calculated in this table, but this reference will use the value from the source table."
- `column\\X` for a column of the table being edited which its source doesn't have is an unknown name, with
  the fix "Make a new calculation that can use this table's X" (an action: the dialog closes, and the
  expression goes to a new Calculate from this table). A plain unknown name is an unknown variable, which
  has no fix.

## Documentation windows

- A window showing a page of the documentation (Java: a window of its own, always on top; here a panel
  over the page, over any dialog, which can be dragged by its title and closed). 400 px wide, the page
  300 px high. Clicking an example in it inserts it at the editor's caret.
- Opened by the fixes "Show guide for Optional type" and "Show units guide" (centred; they close when the
  editor goes), and by choosing a guide completion (Help: Expressions, Conversion, Units, Optional Type;
  centred, titled with the page's title; Java opened these in the system's browser, and so does not close
  them with the editor).
- A function call's parameter prompt (`abs(original)  show doc`, with the parameter being typed in bold;
  between the brackets, or in each argument) has "show doc", which opens the function's page 10 px right
  of the editor's dialog, level with its top. (Java bug, fixed: the prompt never showed, as it was only
  recorded if the call's function was known as the call was built, but function names are only resolved
  later, when the expression is checked.)

## Web differences

- Documentation windows are kept on screen.
