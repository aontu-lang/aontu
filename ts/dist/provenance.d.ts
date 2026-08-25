export type WhyRole = 'literal' | 'spread' | 'ref' | 'pref';
export type WhySite = {
    col: number;
    file: string;
    len: number;
    row: number;
};
export type WhyConjunct = {
    canon: string;
    role: WhyRole;
    site: WhySite;
    src: string;
};
export type WhyRecord = {
    conjuncts: WhyConjunct[];
    path: string;
    value: string;
};
export declare const FROM_SPREAD = "_fromSpread";
export declare function markSpread(v: any): void;
type Contribution = WhyConjunct & {
    id: number;
};
type PathRecord = {
    conjuncts: Contribution[];
    made: Set<number>;
    inside: Set<number>;
    seen: Set<number>;
};
export declare class Provenance {
    paths: Map<string, PathRecord>;
    written: Set<number>;
    writtenFrom(v: any): void;
    record(path: string[], a: any, b: any, out: any): void;
    private contribute;
    at(path: string[]): WhyConjunct[];
}
export {};
