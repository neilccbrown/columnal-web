// Port of xyz.columnal.utility.function.simulation.SimulationEx (utility-functional module), a Java functional interface.
// PORT-NOTE: functional interfaces become function types, so calls change from f.run(...) to f(...).
// Java: throws UserException, InternalException
export type SimulationEx = () => void;
