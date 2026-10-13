// Port of xyz.columnal.utility.function.fx.FXPlatformSupplier (utility-functional module), a Java functional interface.
// PORT-NOTE: functional interfaces become function types, so calls change from f.get(...) to f(...).
export type FXPlatformSupplier<T> = () => T;
