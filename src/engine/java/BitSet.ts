// java.util.BitSet: the operations that ported code uses.
export class BitSet
{
    // Bit i is bit (i % 32) of words[i >> 5]:
    private words: Uint32Array;

    public constructor(words: Uint32Array = new Uint32Array(1))
    {
        this.words = words;
    }

    private ensureWord(wordIndex: number): void
    {
        if (wordIndex >= this.words.length)
        {
            const bigger = new Uint32Array(Math.max(wordIndex + 1, this.words.length * 2));
            bigger.set(this.words);
            this.words = bigger;
        }
    }

    /** Java: set(int bitIndex) and set(int fromIndex, int toIndex) (toIndex exclusive) */
    public set(fromIndex: number, toIndex: number = fromIndex + 1): void
    {
        if (fromIndex < 0 || toIndex < fromIndex)
            throw new RangeError("fromIndex: " + fromIndex + ", toIndex: " + toIndex);
        if (toIndex > fromIndex)
            this.ensureWord((toIndex - 1) >> 5);
        for (let i = fromIndex; i < toIndex; i++)
            this.words[i >> 5]! |= 1 << (i & 31);
    }

    public get(bitIndex: number): boolean
    {
        const w = bitIndex >> 5;
        return w < this.words.length && (this.words[w]! & (1 << (bitIndex & 31))) !== 0;
    }

    public cardinality(): number
    {
        let count = 0;
        for (const word of this.words)
        {
            let w = word;
            while (w !== 0)
            {
                w &= w - 1;
                count++;
            }
        }
        return count;
    }

    /** The index of the first set bit at or after fromIndex, or -1 if there is none. */
    public nextSetBit(fromIndex: number): number
    {
        const total = this.words.length * 32;
        for (let i = fromIndex; i < total; i++)
        {
            if (this.get(i))
                return i;
        }
        return -1;
    }

    public isEmpty(): boolean
    {
        return this.words.every(w => w === 0);
    }

    /** Java: this.and(set), which clears every bit not set in the other set. */
    public and(other: BitSet): void
    {
        for (let i = 0; i < this.words.length; i++)
            this.words[i] = i < other.words.length ? (this.words[i]! & other.words[i]!) >>> 0 : 0;
    }

    public clone(): BitSet
    {
        return new BitSet(this.words.slice());
    }
}
