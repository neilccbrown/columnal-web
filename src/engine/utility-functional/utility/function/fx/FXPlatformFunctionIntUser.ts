// Port of xyz.columnal.utility.function.fx.FXPlatformFunctionIntUser (utility-functional module), a Java functional interface.
// PORT-NOTE: functional interfaces become function types, so calls change from f.apply(...) to f(...).
// Java: throws InternalException, UserException
export type FXPlatformFunctionIntUser<T, R> = (t: T) => R;
