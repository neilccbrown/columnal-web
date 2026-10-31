# Lex editor (type and unit editors)

Java: `lex-editor/.../TopLevelEditor.java` (with its `InformationPopup`), `EditorDisplay.java` (on
`TextEditorBase`), `TypeEditor.java`, `UnitEditor.java`, `lex-editor-completion/.../LexAutoComplete.java`,
`LexAutoCompleteWindow.java` and `LexCompletionList.java`'s view, and `utility-gui/.../FixList.java`.
Styles: `expression-editor.scss`, `autocomplete.scss`, `general.scss` (`.text-editor`, `.quick-fix-row`).
Tests: the screen checks of `tests-gui-type-editor` (with the new-column dialog, Phase 9 step 4), and
`EnterTypeTrait`. Web: `src/gui/lexeditor/` (`TopLevelEditor.vue`, `LexAutoCompleteWindow.vue`,
`TypeEditor.vue`, `UnitEditor.vue`), `src/gui/components/FixList.vue`; the model is the ported
`EditorContent`, `EditorDisplay` and `LexAutoComplete` (`src/gui-logic/lex-editor*/`). Tests:
`test/gui/lexeditor/`, and `test/gui/base/enterType.ts`.

## Content and display

- The editor holds the content (what was typed, as the lexer adjusts it); it shows the lexer's display
  text, which can differ: spaces around operators and after commas (`1+2` shows as `1 + 2`), line breaks
  and indents in `@if`, and spaces typed are dropped from the content.
- The caret only goes to the lexer's caret positions (not inside a keyword such as `@if`); a position in
  the display is mapped to the nearest caret position in the text.
- The display's styles (style classes) are shown; the type and unit lexers add none.
- Width 250 px; at least 25 px high, growing with the text, which wraps. 12 pt main font. A focused
  editor has an outline in the focus colour. Disabled: 40 % opacity, and it can't be edited.

## Keys

- Typing replaces the selection. An opening bracket or quote also adds its closing one after the caret
  (unless in a string, or with a selection); typing a closing bracket or quote that is already after the
  caret goes over it (if the brackets are balanced).
- Left and Right move to the previous or next caret position (to the start or end of a selection,
  without Shift); with the word-skip modifier (Alt on macOS, Ctrl elsewhere) by words; Home and End to the
  ends. Shift extends the selection.
- Up and Down: with completions showing, move in the list (Page Up and Page Down by pages); otherwise to
  the caret position nearest the point 8 px below the caret's bottom (or above its top), as a click there
  would. Shift extends the selection.
- Backspace and Delete delete the selection, else a character.
- Ctrl/Cmd+A selects everything; Ctrl/Cmd+Z undoes, Ctrl/Cmd+Shift+Z and Ctrl/Cmd+Y redo; Ctrl/Cmd+X, C
  and V cut, copy and paste the content's text (not the display's).
- Escape hides the completions. Enter and Tab choose the selected completion; without completions, Enter
  goes to the dialog (its default button) and Tab does nothing (Java: `parentFocusRightOfThis`, which
  does nothing for these editors).
- Shift+F1, F2, … apply the error popup's fixes.
- Every key stays in the editor (Java consumed them all), except Enter without completions.

## Mouse

- A press puts the caret (and the anchor) at the caret position nearest the point (in the text; on a
  draw, the earlier one if the point is on a character's right half); dragging extends the selection; a
  double click selects the word; a triple click, everything. (Java bug, not yet fixed: the nearest in the
  text can be on another line: on an `@if` over several lines, a click in a line's indent goes to the end
  of the line above, and Down from after `@if` stays on the first line.)
- Text can't be dragged and dropped.

## Errors

- An error is shown (its span with the error background and an outline, without the outline when it
  contains the caret) once the caret has left it since it was made, the editor has lost the focus, or the
  content was saved with `save(true)` (as a dialog's OK does). A new item's editor (no original content)
  shows none until it has been focused; with original content, they show at once.
- With the caret in an error the caret has left, the information popup shows above the editor: the
  errors' messages, then "Fixes:" and a row per fix (underlined; classes `key-F1`, `key-F2`, … and the
  fix's own), which applies it when clicked. Otherwise it shows the information or prompt for the caret's
  position, if any (errors first, then warnings, information and prompts), each with its colours. Only
  while the editor is focused.

## Completions

- The lexer's completions for the caret position show below it, while the editor is focused and there
  are some: in groups, each with its header (grey) if it has one, a row per completion (24 px; its text,
  and its side text on the right), 300 px wide and at most 400 px high (scrolling to keep the selected row
  in view). They line up with the start of the earliest completion's text.
- The first is selected if the lexer says so (only completion, or the top one). Clicking a row selects
  it; clicking the selected row, or double-clicking, chooses it. Choosing replaces the text from the
  completion's start to the caret.
- The selected completion's further details show beside the list (500 px wide, 350 px on a screen less
  than 1200 px wide; at most 400 px high): a function documentation page (`FuncdocView`), or HTML.
  Clicking an example there inserts it at the completion's start.

## Saving

- `change` is emitted with the saved value when the editor is made (a forced save) and after each change.
- `save(true)` lexes the content without a caret (dropping trailing spaces) and shows all errors.

## Web differences

- CodeMirror shows the display text, with the selection and caret drawn by the browser; Java drew its
  own. The content is the model: every edit and caret move goes to it, and its display replaces
  CodeMirror's.
- Input methods work: while composing, CodeMirror's text differs from the display; when the composition
  ends, the text is given to the content (Java's `KEY_TYPED` got the committed text).
- The popups are Reka popovers, so they show over a modal dialog and can be clicked.
- Not done: the information popup's fade over 2 s when the mouse leaves it with nothing to show, and the
  middle click that hides the popups (Java's scene filters); clicks being ignored for 400 ms after the
  completions hide; Java's completion list layout keeping each group's first rows (its `minCollapsed`) on
  screen as the list scrolls (Phase 10, for the expression editor's groups); the error popup's fixes that
  are actions (Phase 10).
