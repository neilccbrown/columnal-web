# Light dialogs

Java: `utility-gui/.../LightDialog.java`, `ErrorableLightDialog.java`, `DoubleOKLightDialog.java`,
`DialogPaneWithSideButtons.java`, `ErrorLabel.java`; the owner dims itself (`View.dimWhileShowing`).
Styles: `dialogs.scss` (`.light-dialog-pane`, `.side-button-bar`), `general.scss` (`.error-label`).
Covered by the Java GUI tests only through the dialogs that use them (they press `.ok-button`).
Web: `src/gui/components/dialogs/` (`LightDialog.vue`, `ErrorableLightDialog.vue`,
`DoubleOKLightDialog.vue`, `ErrorLabel.vue`, `dialogs.ts`).

## LightDialog

- Window-modal, with no title bar: a panel with a 1 px grey (40%) border, 5 px corners, the light dialog
  background and a drop shadow (5 px right and down). The grid under it is dimmed (brightness −0.2).
- Buttons along the bottom on the right (OK, Cancel, Close as the dialog has them), in JavaFX's
  ButtonBar order: OK first on Windows, Cancel/Close first elsewhere. With side buttons
  (`DialogPaneWithSideButtons`), they are down the right, full width, 20 px apart, so that completion
  popups don't cover them.
- Enter presses OK (the default button) unless the focused control uses Enter; Escape presses Cancel.
  Clicking outside does nothing (modal).
- Dragging the background moves it. If resizable, the pointer within 5 px of an edge or corner shows a
  resize cursor, and dragging there resizes it (not below its minimum size).
- A click on the background that doesn't move (still since the press) focuses OK, else Cancel, else
  Close.
- `showAndWaitCentredOn(point, width, height)`: centred on the point (usually the mouse), kept 20 px
  inside the screen.

## ErrorableLightDialog

- OK and Cancel, with `ok-button` and `cancel-button` classes. An error label, which the dialog places.
- OK calls `calculateResult()`: an error shows "Error: …" (`error.colon`) in the label and OK does
  nothing; a result closes the dialog with it. Subclasses clear the label when a field changes
  (`clearErrorLabelOnChange`).

## DoubleOKLightDialog

- OK calls `checkValidity()`:
  - impossible to save: `showAllErrors()`, and stays open;
  - errors but can save: if anything was modified since the last OK (`notifyModified()`), shows the
    errors and a popup by OK, "Errors found. Click OK / again to save anyway", and stays open;
    otherwise saves, unless this OK is within 300 ms of the last (a double-click);
  - no errors: saves.
- Saving hides the popup and closes with `calculateResult()`.

## Web differences

- The whole window is dimmed (an overlay), not just the grid.
- Placed within the browser window rather than the screen, and centred on a point by its real size
  (Java estimated it from the content size plus 40 px for the buttons).
- The minimum size when resizing is 150 × 100 px (JavaFX used the content's minimum size).
- JavaFX fired the buttons on mouse release, to work around missed clicks with popups showing; not
  needed here.
- The dialog has the `dialog` role, labelled for screen readers (`label`).
- The components are reused rather than made per use, so they reset their state (the error, the
  "modified" flag, the position) each time they open.
