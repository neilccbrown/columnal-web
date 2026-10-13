// Port of xyz.columnal.utility.function.fx.FXPlatformFunction (utility-functional module), a Java functional interface.
// PORT-NOTE: functional interfaces become function types, so calls change from f.apply(...) to f(...).
export type FXPlatformFunction<T, R> = (t: T) => R;
