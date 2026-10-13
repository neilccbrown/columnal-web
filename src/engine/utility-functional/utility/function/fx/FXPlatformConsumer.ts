// Port of xyz.columnal.utility.function.fx.FXPlatformConsumer (utility-functional module), a Java functional interface.
// PORT-NOTE: functional interfaces become function types, so calls change from f.consume(...) to f(...).
export type FXPlatformConsumer<T> = (t: T) => void;
