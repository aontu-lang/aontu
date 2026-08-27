import type { VetFinding } from './vet';
import type { TrustOptions } from './type';
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
};
export declare function relationCheck(src: string, opts?: RelationOptions): RelationReport;
