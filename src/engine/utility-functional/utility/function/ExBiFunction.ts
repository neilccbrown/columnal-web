// Port of xyz.columnal.utility.function.ExBiFunction (utility-functional module), a Java functional interface.
// PORT-NOTE: functional interfaces become function types, so calls change from f.apply(...) to f(...).
// Java: throws UserException, InternalException
export type ExBiFunction<S, T, R> = (s: S, t: T) => R;
