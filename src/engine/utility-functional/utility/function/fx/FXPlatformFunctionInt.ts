// Port of xyz.columnal.utility.function.fx.FXPlatformFunctionInt (utility-functional module), a Java functional interface.
// PORT-NOTE: functional interfaces become function types, so calls change from f.apply(...) to f(...).
// Java: throws InternalException
export type FXPlatformFunctionInt<T, R> = (t: T) => R;
