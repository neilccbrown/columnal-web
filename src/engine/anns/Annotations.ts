// TypeScript stand-ins for the Checker Framework qualifiers in the Java anns module
// (annotation.*.qual).  In Java these were checked by custom checkers; here they are plain
// type aliases that document intent in ported signatures (see docs/CONVENTIONS.md).
// Some may become branded types later where the extra checking pays for itself.

/** A valid expression identifier (annotation.identifier.qual.ExpressionIdentifier). */
export type ExpressionIdentifier = string;

/** A valid unit identifier (annotation.identifier.qual.UnitIdentifier). */
export type UnitIdentifier = string;

/** A key into the translation (.properties) files (annotation.qual.LocalizableKey). */
export type LocalizableKey = string;

/** Text that is localized or does not need localizing (org.checkerframework...Localized). */
export type Localized = string;

/** Zero-based row index within a table's data (annotation.units.TableDataRowIndex). */
export type TableDataRowIndex = number;

/** Zero-based column index within a table's data (annotation.units.TableDataColIndex). */
export type TableDataColIndex = number;

/** Absolute row index in the grid (annotation.units.AbsRowIndex). */
export type AbsRowIndex = number;

/** Absolute column index in the grid (annotation.units.AbsColIndex). */
export type AbsColIndex = number;

/** A position in raw (unprocessed) input text (annotation.units.RawInputLocation). */
export type RawInputLocation = number;
export const RawInputLocation = { ZERO: 0, ONE: 1 } as const;

/** A one-based index, as entered by the user (annotation.units.UserIndex). */
export type UserIndex = number;
