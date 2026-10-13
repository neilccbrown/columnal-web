// Port of xyz.columnal.utility.function.simulation.SimulationSupplier (utility-functional module), a Java functional interface.
// PORT-NOTE: functional interfaces become function types, so calls change from f.get(...) to f(...).
// Java: throws InternalException, UserException
export type SimulationSupplier<T> = () => T;
