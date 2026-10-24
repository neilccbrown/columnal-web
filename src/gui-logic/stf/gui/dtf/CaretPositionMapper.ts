// Port of xyz.columnal.gui.dtf.CaretPositionMapper (stf module), a Java functional interface.
// PORT-NOTE: functional interfaces become function types, so calls change from m.mapCaretPosition(p) to m(p).

// Maps old caret position to new position
export type CaretPositionMapper = (oldPosition: number) => number;
