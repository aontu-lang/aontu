type Ranges = [number, number][];
type Node = {
    k: 'alt';
    alts: Node[];
} | {
    k: 'cat';
    items: Node[];
} | {
    k: 'rep';
    min: number;
    max: number;
    node: Node;
} | {
    k: 'ref';
    name: string;
} | {
    k: 'str';
    cps: number[];
    ci: boolean;
} | {
    k: 'cls';
    set: Ranges;
};
type CpSet = {
    id: number;
    r: Ranges;
};
type Grammar = {
    start: string;
    empty: boolean;
    rules: Map<string, Node>;
    first: Map<Node, CpSet>;
    nullable: Map<Node, boolean>;
    one: Map<Node, boolean>;
};
type Read = [Grammar, undefined, undefined] | [undefined, string, string];
declare const FORMAT_STEP_MAX = 1000000;
declare function hex(cp: number): string;
declare function readGrammar(src: string, committed?: boolean): Read;
declare function recognise(g: Grammar, s: string): number | undefined;
declare function formatOf(src: string): [
    {
        name: string;
        gs?: Grammar[];
    },
    undefined,
    undefined
] | [undefined, string, string];
declare function isDefinedFormat(name: string): boolean;
export type { Grammar };
export { readGrammar, recognise, formatOf, isDefinedFormat, hex, FORMAT_STEP_MAX, };
