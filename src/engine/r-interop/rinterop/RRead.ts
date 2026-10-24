// Port of xyz.columnal.rinterop.RRead (r-interop module).
import { gunzipSync } from "fflate";
import { DataInputStream } from "../../java/DataStreams.js";
import { javaDoubleToInt } from "../../java/JavaDouble.js";
import type { JavaFile } from "../../java/JavaFile.js";
import { UserException } from "../../utility-error/error/UserException.js";
import { Utility } from "../../utility/utility/Utility.js";
import { DefaultRVisitor } from "./DefaultRVisitor.js";
import { RUtility } from "./RUtility.js";
import type { RValue } from "./RValue.js";
import { RVisitor } from "./RVisitor.js";
import { SpecificRVisitor } from "./SpecificRVisitor.js";
import { TypeHeader } from "./TypeHeader.js";
import { V2Header } from "./V2Header.js";

import PairListEntry = RVisitor.PairListEntry;

type RClassLoad = (state: RValue, attr: RValue) => RValue;

export class RRead
{
    private static addAtom(atoms: Map<number, string>, atom: string): number
    {
        const newKey = atoms.size + 1;
        atoms.set(newKey, atom);
        return newKey;
    }

    private static getAtom(atoms: Map<number, string>, key: number): string
    {
        const atom = atoms.get(key);
        if (atom !== undefined)
            return atom;
        throw new UserException("Could not find atom: " + key + " in atoms sized: " + atoms.size);
    }

    public static readRData(rFilePath: JavaFile): RValue
    {
        const d = new DataInputStream(RRead.openInputStream(rFilePath));
        const header = new Uint8Array(5);
        d.mark(10);
        d.readFully(header);
        if (header[0] === 0x52 /* R */ && header[1] === 0x44 /* D */ && header[2] === 0x58 /* X */ && header[4] === 0x0A /* \n */)
        {
            // An .RData file
        }
        else
        {
            d.reset();
        }

        const v2Header = new V2Header(d);

        if (v2Header.formatVersion === 3)
        {
            RRead.readLenString(d); // The encoding
        }

        const result = RRead.readItem(d, new Map());
        const after = d.read();
        if (after !== -1)
            throw new UserException("Unexpected data at end of file: " + after);
        return result;
    }

    public static readItem(d: DataInputStream, atoms: Map<number, string>): RValue
    {
        const objHeader = new TypeHeader(d, atoms);

        switch (objHeader.getType())
        {
            case 242: // Empty environment; not sure how to handle:
            case 253: // GLOBALENV_SXP; not sure how to handle:
            case RUtility.NIL: // Nil
                return {
                    visit<T>(visitor: RVisitor<T>): T
                    {
                        return visitor.visitNil();
                    },
                };
            case 255: // Ref
            {
                const ref = objHeader.getReference(d);
                const atom = RRead.getAtom(atoms, ref);
                return RUtility.string(atom, false);
            }
            case RUtility.SYMBOL: // Symbol
            {
                const symbol = RRead.readItem(d, atoms);
                symbol.visit(new class extends SpecificRVisitor<string | null>
                {
                    public override visitString(s: string | null, _isSymbol: boolean): string | null
                    {
                        if (s !== null)
                            RRead.addAtom(atoms, s);
                        return s;
                    }
                }());
                return RUtility.string(RUtility.getString(symbol), true);
            }
            case 6:
            case RUtility.PAIR_LIST: // Pair list
            {
                const attr = objHeader.readAttributes(d, atoms);
                const tag = objHeader.readTag(d, atoms);
                const head = RRead.readItem(d, atoms);
                const tail = RRead.readItem(d, atoms);
                const items = RRead.flattenPairList(head, tail, attr, tag);
                return {
                    visit<T>(visitor: RVisitor<T>): T
                    {
                        return visitor.visitPairList(items);
                    },
                };
            }
            case RUtility.STRING_SINGLE: // String
            {
                const s = RRead.readLenString(d);
                return RUtility.string(s, false);
            }
            case RUtility.INT_VECTOR: // Integer vector
            {
                const vecLen = d.readInt();
                const values: number[] = new Array<number>(vecLen);
                for (let i = 0; i < vecLen; i++)
                {
                    values[i] = d.readInt();
                }
                const attr = objHeader.readAttributes(d, atoms);
                const factorNames: readonly string[] | null = attr === null ? null : attr.visit(new class extends DefaultRVisitor<readonly string[] | null>
                {
                    public override visitPairList(items: readonly PairListEntry[]): readonly string[] | null
                    {
                        if (items.length >= 1 && items[0]!.tag !== null && items[0]!.tag.visit(new class extends DefaultRVisitor<boolean>
                        {
                            public override visitString(s: string | null, _isSymbol: boolean): boolean
                            {
                                return "levels" === s;
                            }
                        }(false)))
                            return items[0]!.item.visit(new class extends SpecificRVisitor<readonly string[]>
                            {
                                public override visitStringList(values: readonly (string | null)[], _attributes: RValue | null): readonly string[]
                                {
                                    return Utility.mapListExI(values, v => {
                                        if (v === null)
                                            throw new UserException("Unexpected NA in factors");
                                        return v;
                                    });
                                }

                                public override visitGenericList(values: readonly RValue[], _attributes: RValue | null, _isObject: boolean): readonly string[]
                                {
                                    return Utility.mapListExI(values, v => RUtility.getStringNN(v));
                                }
                            }());
                        return null;
                    }
                }(null));

                if (factorNames !== null)
                {
                    return {
                        visit<T>(visitor: RVisitor<T>): T
                        {
                            return visitor.visitFactorList(values, factorNames);
                        },
                    };
                }
                else
                    return RUtility.intVector(values, attr);
            }
            case RUtility.LOGICAL_VECTOR:
            {
                const vecLen = d.readInt();
                const values: boolean[] = new Array<boolean>(vecLen);
                let isNA: boolean[] | null = null;
                for (let i = 0; i < vecLen; i++)
                {
                    const n = d.readInt();
                    values[i] = n !== 0;
                    if (n === RUtility.NA_AS_INTEGER)
                    {
                        if (isNA === null)
                            isNA = new Array<boolean>(vecLen).fill(false);
                        isNA[i] = true;
                    }
                }
                const attr = objHeader.readAttributes(d, atoms);
                return RUtility.logicalVector(values, isNA, attr);
            }
            case RUtility.DOUBLE_VECTOR: // Floating point vector
            {
                const vecLen = d.readInt();
                const values: number[] = new Array<number>(vecLen);
                for (let i = 0; i < vecLen; i++)
                {
                    values[i] = d.readDouble();
                }
                const attr = objHeader.readAttributes(d, atoms);
                const attrMap = RUtility.pairListToMap(attr);
                if (RUtility.isClass(attrMap, "Date"))
                    return RUtility.dateVector(values, attr);
                else if (RUtility.isClass(attrMap, "POSIXct"))
                    return RUtility.dateTimeZonedVector(values, attr);
                else
                    return RUtility.doubleVector(values, attr);
            }
            case RUtility.STRING_VECTOR: // Character vector
            {
                const vecLen = d.readInt();
                const values: (string | null)[] = [];
                for (let i = 0; i < vecLen; i++)
                {
                    values.push(RUtility.getString(RRead.readItem(d, atoms)));
                }
                const attr = objHeader.readAttributes(d, atoms);
                return RUtility.stringVector(values, attr);
            }
            case RUtility.GENERIC_VECTOR: // Generic vector
            {
                const vecLen = d.readInt();
                const values: RValue[] = [];
                for (let i = 0; i < vecLen; i++)
                {
                    values.push(RRead.readItem(d, atoms));
                }
                const attr = objHeader.readAttributes(d, atoms);
                return RUtility.genericVector(values, attr, objHeader.isObject());
            }
            case 238: // ALTREP_SXP
            {
                const info = RRead.readItem(d, atoms);
                const state = RRead.readItem(d, atoms);
                const attr = RRead.readItem(d, atoms);
                return RRead.lookupClass(RUtility.getStringNN(RUtility.getListItem(info, 0)), RUtility.getStringNN(RUtility.getListItem(info, 1)))(state, attr);
            }
            default:
                throw new UserException("Unsupported R object type (identifier: " + objHeader.getType() + ")");
        }
    }

    private static flattenPairList(head: RValue, tail: RValue, attr: RValue | null, tag: RValue | null): readonly PairListEntry[]
    {
        return [new PairListEntry(attr, tag, head), ...tail.visit(new class extends DefaultRVisitor<readonly PairListEntry[]>
        {
            public override visitNil(): readonly PairListEntry[]
            {
                // No need to add to list
                return [];
            }

            public override visitPairList(items: readonly PairListEntry[]): readonly PairListEntry[]
            {
                return items;
            }
        }([new PairListEntry(null, null, tail)]))];
    }

    private static lookupClass(c: string, p: string): RClassLoad
    {
        switch (p + "#" + c)
        {
            case "base#wrap_integer":
                return (state, _attr) => {
                    return state;
                };
            case "base#compact_intseq":
                return (state, _attr) => {
                    // It's a triple: number of steps, the start value, and the step increment
                    return state.visit(new class extends SpecificRVisitor<RValue>
                    {
                        public override visitDoubleList(values: readonly number[], _attributes: RValue | null): RValue
                        {
                            const expanded: number[] = new Array<number>(javaArrayLength(values[0]!)).fill(0);
                            let x = values[1]!;
                            for (let i = 0; i < expanded.length; i++)
                            {
                                expanded[i] = x;
                                x += values[2]!;
                            }
                            return RUtility.doubleVector(expanded, null);
                        }
                    }());
                };
            case "base#deferred_string":
                return (_state, _attr) => {
                    return RUtility.string("Unsupported base#deferred_string", false);
                };
            case "base#wrap_real":
                return (state, _attr) => RUtility.getListItem(state, 0);

        }
        throw new UserException("Unsupported R class: " + p + " " + c);
    }

    private static readLenString(d: DataInputStream): string | null
    {
        const len = d.readInt();
        if (len < 0)
            return null;
        const chars = new Uint8Array(len);
        d.readFully(chars);
        return new TextDecoder("utf-8").decode(chars);
    }

    // PORT-NOTE: Java reads the file through a (possibly gzip) stream; here the whole file is
    // decompressed into memory.
    private static openInputStream(rFilePath: JavaFile): Uint8Array
    {
        const bytes = rFilePath.readAllBytes();
        const firstBytes = new DataInputStream(bytes);
        firstBytes.readFully(new Uint8Array(10));
        if (bytes[0] === 0x1F && bytes[1] === 0x8B)
        {
            return gunzipSync(bytes);
        }
        //throw new UserException("Unrecognised file format");
        return bytes;
    }
}

// Java: new double[(int)d], which throws NegativeArraySizeException for a negative size
function javaArrayLength(d: number): number
{
    const n = javaDoubleToInt(d);
    if (n < 0)
        throw new RangeError("NegativeArraySizeException: " + n);
    return n;
}
