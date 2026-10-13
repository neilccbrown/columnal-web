// Port of xyz.columnal.utility.function.fx.FXPlatformBiConsumer (utility-functional module), a Java functional interface.
// PORT-NOTE: functional interfaces become function types, so calls change from f.consume(...) to f(...).
export type FXPlatformBiConsumer<S, T> = (s: S, t: T) => void;
