// Port of xyz.columnal.utility.function.simulation.SimulationConsumerNoError (utility-functional module), a Java functional interface.
// PORT-NOTE: functional interfaces become function types, so calls change from f.consume(...) to f(...).
export type SimulationConsumerNoError<T> = (t: T) => void;
