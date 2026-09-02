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
};
export declare function graphOf(root: Val): Graph;
