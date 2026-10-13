// Port of xyz.columnal.utility.function.simulation.SimulationConsumer (utility-functional module), a Java functional interface.
// PORT-NOTE: functional interfaces become function types, so calls change from f.consume(...) to f(...).
// Java: throws InternalException, UserException
export type SimulationConsumer<T> = (t: T) => void;
