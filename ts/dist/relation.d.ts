import type { VetFinding } from './vet';
import type { TrustOptions } from './type';
import type { Graph } from './graph';
import type { RelDecl } from './val/GraphAtomVal';
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
};
export type RelationOptions = {
    path?: string;
    trust?: TrustOptions;
    textExt?: string[];
};
export declare function relationFindings(decls: Map<string, RelDecl>, graph: Graph): RelationFinding[];
export declare function relationErrors(ctx: any, root: any): void;
export declare function relationCheck(src: string, opts?: RelationOptions): RelationReport;
