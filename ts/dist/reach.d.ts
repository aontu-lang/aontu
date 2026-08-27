import type { VetFinding } from './vet';
import type { TrustOptions } from './type';
export type ReachVerdict = 'reaches' | 'unreachable' | 'error';
export type ReachReport = {
    verdict: ReachVerdict;
    path?: string[];
    errors?: VetFinding[];
};
export type ReachOptions = {
    path?: string;
    trust?: TrustOptions;
    relation?: string;
};
export declare function reachCheck(src: string, from: string, to: string, opts?: ReachOptions): ReachReport;
