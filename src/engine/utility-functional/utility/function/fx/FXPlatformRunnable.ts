// Port of xyz.columnal.utility.function.fx.FXPlatformRunnable (utility-functional module), a Java functional interface.
// PORT-NOTE: functional interfaces become function types, so calls change from f.run(...) to f(...).
export type FXPlatformRunnable = () => void;

export const FXPlatformRunnable: { readonly EMPTY: FXPlatformRunnable } = { EMPTY: () => {} };
