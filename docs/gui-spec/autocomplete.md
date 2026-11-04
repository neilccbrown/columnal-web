# AutoComplete

Java: `dialogs-non-expression/.../AutoComplete.java` (on a `TextField`), with `autocomplete.scss`. Web: the
logic is `src/gui-logic/dialogs-non-expression/gui/dialog/AutoComplete.ts` (`AutoComplete.Model`), the
field `src/gui/components/autoComplete.ts` (`useAutoComplete`), `AutoCompleteList.vue`,
`AutoCompleteField.vue`, and an `autoComplete` model on `ErrorableTextField.vue`. Used by the table picker
and the column expression dialog's name (`transformations.md`). Tests:
`test/gui-logic/dialogs-non-expression/AutoComplete.test.ts`, `test/gui/expressions/CalculatePath.test.ts`.

- While the field is focused, its completions (from the text, trimmed) show below it: 30 px rows, each with
  its text and a description to its right (faint, 75 %), 400 px wide and at most 300 px high (2 px of
  border); none when there are no completions. They are sorted by their text. None is selected after the
  text changes.
- Up and Down move the selection (Up from the first clears it); Page Up and Page Down by nine. Enter or Tab
  chooses: the listener is given the text before and after the caret and the selected completion (or none),
  and its answer, if any, becomes the field's text (the caret at its end); the completions then hide until
  the text next changes. Escape hides them (and isn't used up: a dialog sees it too).
- A click on a row selects it; a double click chooses it. A middle click on the list hides it. The field
  keeps the focus.
- Whitespace: `DISALLOW` drops any typed (the other policies only trim the text the completions are
  calculated from).
- Not ported: Java's "autocomplete.instruction" popup, whose showing was commented out; a completion's
  further details page beside the list (no completion in the app has one).
