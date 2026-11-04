# Comments on the grid

Java: `app/.../GridCommentDisplay.java`, `data/.../GridComment.java`, `View.java` (`createTable`'s
COMMENT). Styles: `virtual-grid.scss` (`.grid-comment-field`). Web: `src/gui/grid/GridCommentDisplay.ts`,
`CommentView.vue`, the engine's comment requests (`protocol.ts`). Tests: `test/gui/tables/Comments.test.ts`.

- The new-table dialog's "Comment" makes an empty comment at the cell, two columns by two rows; it is
  saved with the project (`COMMENT`), and loaded.
- A comment is a text field over its cells, pale yellow (lighter while hovered), with the grid's dividers
  on its right and bottom; its text wraps. Clicking it edits it.
- Moving the selection into it selects the whole comment; leaving it up or down goes from its top or
  bottom, staying in the column it was entered from. Enter edits it. Delete or Backspace removes it (then
  the cell where it was is selected). Copy copies its text; paste sets its text (and the field shows it).
- Near its bottom right corner (8 px), while it isn't being edited, the cursor is a resize cursor; dragging
  sets its bottom right to the cell before the nearest cell corner (at least its top left cell).
- Leaving the field sets the comment's text to what was typed. (In Java typing changed only what the field
  showed: the comment's text, which is saved, was only set by pasting.)
- Changing a comment's text or size saves the project. (Java didn't: the change was saved with the next
  one.)
