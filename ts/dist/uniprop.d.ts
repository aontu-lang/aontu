type Ranges = [number, number][];
declare function union(sets: Ranges[]): Ranges;
declare function complement(rs: Ranges): Ranges;
declare function unicodeProperty(name: string, value?: string): Ranges | undefined;
export type { Ranges };
export { unicodeProperty, union, complement, };
