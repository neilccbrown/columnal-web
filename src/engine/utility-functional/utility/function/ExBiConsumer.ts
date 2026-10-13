// Port of xyz.columnal.utility.function.ExBiConsumer (utility-functional module), a Java functional interface.
// PORT-NOTE: functional interfaces become function types, so calls change from f.accept(...) to f(...).
// Java: throws UserException, InternalException
export type ExBiConsumer<A, B> = (a: A, b: B) => void;
