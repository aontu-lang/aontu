import type { TrustOptions } from './type';
import type { VetFinding } from './vet';
import type { WhyRecord } from './provenance';
export type QueryView = 'json' | 'canon' | 'types' | 'keys';
export type QueryOptions = {
    view?: QueryView;
    depth?: number;
    path?: string;
    trust?: TrustOptions;
};
export type QueryReport = {
    ok: boolean;
    out: string;
    findings: VetFinding[];
};
export declare function nearestKey(want: string, have: string[]): string | undefined;
export declare function pathParts(path: string): string[];
export declare function projectFor(v: any, view: QueryView, depth: number): string;
export declare function evalFailure(ctx: any): VetFinding;
export declare function get(src: string, path: string, opts?: QueryOptions): QueryReport;
export type WhyReport = {
    ok: boolean;
    record?: WhyRecord;
    findings: VetFinding[];
};
export declare function why(src: string, path: string, opts?: QueryOptions): WhyReport;
