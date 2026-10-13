// Port of xyz.columnal.utility.function.fx.FXPlatformBiFunctionInt (utility-functional module), a Java functional interface.
// PORT-NOTE: functional interfaces become function types, so calls change from f.apply(...) to f(...).
// Java: throws InternalException
export type FXPlatformBiFunctionInt<T, U, R> = (t: T, u: U) => R;
