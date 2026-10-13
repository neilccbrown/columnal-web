// Port of xyz.columnal.utility.StreamTreeBuilder (utility module).
// PORT-NOTE: Java streams become arrays.

/**
 * Builds a stream from a sequence of single items and nested streams.
 */
export class StreamTreeBuilder<T>
{
    private readonly items: (readonly T[])[] = [];

    public add(singleItem: T): void
    {
        this.items.push([singleItem]);
    }

    public addAll(multipleItems: readonly T[]): void
    {
        this.items.push(multipleItems);
    }

    public stream(): T[]
    {
        return this.items.flat() as T[];
    }
}
