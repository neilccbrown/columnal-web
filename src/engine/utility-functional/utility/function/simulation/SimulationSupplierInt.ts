// Port of xyz.columnal.utility.function.simulation.SimulationSupplierInt (utility-functional module), a Java functional interface.
// PORT-NOTE: functional interfaces become function types, so calls change from f.get(...) to f(...).
// Java: throws InternalException
export type SimulationSupplierInt<T> = () => T;
