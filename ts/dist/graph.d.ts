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
export declare function graphOf(root: Val): Graph;
