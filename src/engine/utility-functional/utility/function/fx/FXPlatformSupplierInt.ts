// Port of xyz.columnal.utility.function.fx.FXPlatformSupplierInt (utility-functional module), a Java functional interface.
// PORT-NOTE: functional interfaces become function types, so calls change from f.get(...) to f(...).
// Java: throws InternalException
export type FXPlatformSupplierInt<T> = () => T;
