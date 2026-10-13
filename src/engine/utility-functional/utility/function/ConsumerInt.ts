// Port of xyz.columnal.utility.function.ConsumerInt (utility-functional module), a Java functional interface.
// PORT-NOTE: functional interfaces become function types, so calls change from f.accept(...) to f(...).
// Java: throws InternalException
export type ConsumerInt<A> = (a: A) => void;
