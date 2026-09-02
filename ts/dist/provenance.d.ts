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
    rank?: number;
};
export type WhyRecord = {
    conjuncts: WhyConjunct[];
    path: string;
    value: string;
};
export declare const FROM_SPREAD = "_fromSpread";
export declare const WRITTEN = "_written";
export declare const INNER_OF = "_innerOf";
export declare function markSpread(v: any, seen?: Set<any>): void;
type Contribution = WhyConjunct & {
    id: number;
};
type PathRecord = {
    conjuncts: Contribution[];
    made: Set<number>;
    seen: Set<number>;
};
export declare class Provenance {
    paths: Map<string, PathRecord>;
    containers: Map<number, any>;
    writtenFrom(v: any): void;
    record(path: string[], a: any, b: any, out: any): void;
    private contribute;
    stands(path: string[], v: any): void;
    at(path: string[]): WhyConjunct[];
}
export {};
