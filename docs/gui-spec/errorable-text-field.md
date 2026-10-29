# Errorable text field

Java: `utility-gui/.../ErrorableTextField.java` (and `FixList.java` for the fixes, `StyledString.toGUI()` for
the text). Styles: `general.scss` (`.errorable-text-field`, `.errorable-text-field-popup`,
`.fix-list-heading`, `.quick-fix-row`). Subclasses elsewhere (table and column names, …) use
`checkAlphabet`/`validate` for their converters. Covered by the Java GUI tests through those fields.
Web: `src/gui/components/ErrorableTextField.vue`, `StyledText.vue`, and the conversion in
`src/gui-logic/utility-gui/utility/gui/ErrorableTextField.ts`.

## Behaviour

- The text is converted by the converter on every change, and when a dependency changes, to a
  `ConversionResult`: a value (perhaps with warnings), or an error (a styled message) with quick fixes.
  The value is `null` when there is an error.
- Errors and warnings are hidden until the text changes or the field loses the focus.
- An error outlines the field (2 px, the error outline colour); warnings outline it in orange.
- While the field has the focus and there is an error or warnings, a popup (a PopOver, arrow at the
  bottom centre by default, so above the field) shows the error, then the warnings, then, if there are
  fixes, "Fixes:" and a row per fix (underlined, grey; classes `key-F1`, `key-F2`, …). Clicking a fix
  sets the text to the fixed value. A middle click hides the popup; so does a click elsewhere (PopOver
  auto-hide), until something changes.
- `checkAlphabet`: the first character that isn't allowed gives "Character not allowed: X" (or "… at
  start: X" if it is only not allowed first), then "Character code: \uXX" (small, grey), with the fix
  "Remove character" (none for the start case).
- `addOnFocusLoss`: gets the value when the focus leaves. `lastFocusedTime` (TimedFocusable).

## Web differences

- PopOver's title ("Error" / "Warning") is only shown when it is detached, which it never is; here it is
  the popup's accessible name.
- `aria-invalid` is set while there is an error.
- `sizeToFit` (the field's width following its text) is left for the phases whose fields use it.
- The fix rows don't take the focus from the field when clicked.
