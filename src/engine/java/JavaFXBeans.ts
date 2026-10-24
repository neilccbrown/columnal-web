// Stand-ins for the few javafx.beans classes that engine code uses to hold a changeable value
// (javafx.beans.property.SimpleObjectProperty, and javafx.beans.binding.ObjectExpression as
// the read-only view of one).  The importers use them for the format the user is choosing.
//
// PORT-NOTE: only get, set and change listeners are provided: no bindings or invalidation
// listeners.  As in JavaFX, a change listener is called only if the new value is not equal
// (Java equals) to the old one.  The GUI tracks these through the store adapter, never by
// making them reactive.
import { javaEquals } from "./JavaObject.js";

export type ChangeListener<T> = (observable: ObjectExpression<T>, oldValue: T, newValue: T) => void;

/** Java: javaFX's ObjectExpression (as used: a value that can be read and listened to). */
export interface ObjectExpression<T>
{
    get(): T;
    addListener(listener: ChangeListener<T>): void;
    removeListener(listener: ChangeListener<T>): void;
}

/** Java: javafx.beans.property.SimpleObjectProperty. */
export class SimpleObjectProperty<T> implements ObjectExpression<T>
{
    private value: T;
    private readonly listeners: ChangeListener<T>[] = [];

    public constructor(initialValue: T)
    {
        this.value = initialValue;
    }

    public get(): T
    {
        return this.value;
    }

    public set(newValue: T): void
    {
        const oldValue = this.value;
        this.value = newValue;
        if (!javaEquals(oldValue, newValue))
        {
            for (const listener of [...this.listeners])
                listener(this, oldValue, newValue);
        }
    }

    public addListener(listener: ChangeListener<T>): void
    {
        this.listeners.push(listener);
    }

    public removeListener(listener: ChangeListener<T>): void
    {
        const index = this.listeners.indexOf(listener);
        if (index !== -1)
            this.listeners.splice(index, 1);
    }
}
