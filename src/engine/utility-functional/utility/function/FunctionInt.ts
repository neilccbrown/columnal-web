// Port of xyz.columnal.utility.function.FunctionInt (utility-functional module), a Java functional interface.
// PORT-NOTE: functional interfaces become function types, so calls change from f.apply(...) to f(...).
// Java: throws InternalException
export type FunctionInt<T, R> = (param: T) => R;
