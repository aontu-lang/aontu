import type { VetFinding } from './vet';
import type { TrustOptions } from './type';
import type { Graph, RelDecl } from './graph';
export type RelationVerdict = 'pass' | 'fail' | 'error';
export type RelationFinding = {
    code: string;
    relation: string;
    at: string;
    detail: string[];
};
export type RelationReport = {
    verdict: RelationVerdict;
    findings: RelationFinding[];
    errors?: VetFinding[];
    declared?: number;
};
export type RelationOptions = {
    path?: string;
    trust?: TrustOptions;
    textExt?: string[];
    count?: boolean;
};
export declare function relationFindings(decls: Map<string, RelDecl>, graph: Graph): RelationFinding[];
export declare function relationErrors(ctx: any, root: any): void;
export declare function relationCheck(src: string, opts?: RelationOptions): RelationReport;
