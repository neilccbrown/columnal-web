// Port of xyz.columnal.utility.function.ExFunction (utility-functional module), a Java functional interface.
// PORT-NOTE: functional interfaces become function types, so calls change from f.apply(...) to f(...).
// Java: throws UserException, InternalException
export type ExFunction<T, R> = (t: T) => R;
