// Port of xyz.columnal.utility.function.BiFunctionInt (utility-functional module), a Java functional interface.
// PORT-NOTE: functional interfaces become function types, so calls change from f.apply(...) to f(...).
// Java: throws InternalException
export type BiFunctionInt<S, T, R> = (s: S, t: T) => R;
