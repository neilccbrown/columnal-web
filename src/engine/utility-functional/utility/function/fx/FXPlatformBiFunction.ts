// Port of xyz.columnal.utility.function.fx.FXPlatformBiFunction (utility-functional module), a Java functional interface.
// PORT-NOTE: functional interfaces become function types, so calls change from f.apply(...) to f(...).
export type FXPlatformBiFunction<S, T, R> = (s: S, t: T) => R;
