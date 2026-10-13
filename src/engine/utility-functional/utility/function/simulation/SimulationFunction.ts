// Port of xyz.columnal.utility.function.simulation.SimulationFunction (utility-functional module), a Java functional interface.
// PORT-NOTE: functional interfaces become function types, so calls change from f.apply(...) to f(...).
// Java: throws InternalException, UserException
export type SimulationFunction<T, R> = (t: T) => R;
