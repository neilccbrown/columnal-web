// Port of xyz.columnal.utility.function.ExSupplier (utility-functional module), a Java functional interface.
// PORT-NOTE: functional interfaces become function types, so calls change from f.get(...) to f(...).
// Java: throws UserException, InternalException
export type ExSupplier<R> = () => R;
