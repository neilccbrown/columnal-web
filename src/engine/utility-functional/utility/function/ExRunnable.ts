// Port of xyz.columnal.utility.function.ExRunnable (utility-functional module), a Java functional interface.
// PORT-NOTE: functional interfaces become function types, so calls change from f.run(...) to f(...).
// Java: throws InternalException, UserException
export type ExRunnable = () => void;
