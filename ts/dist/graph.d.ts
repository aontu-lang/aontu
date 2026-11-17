import type { Val } from './type';
export type Edge = {
    from: string;
    key: string;
    to: string;
    at: string;
    hidden?: true;
};
export type Graph = {
    edges: Edge[];
    disjunct?: string[];
};
export type RelDecl = {
    acyclic?: boolean;
    inverses: Set<string>;
};
export declare function graphOf(root: Val): Graph;
export declare function declsOf(root: Val): Map<string, RelDecl>;
