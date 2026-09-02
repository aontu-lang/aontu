import type { VetFinding } from './vet';
import type { TrustOptions } from './type';
export type ViewVerdict = 'rendered' | 'error';
export type ViewKind = 'tree';
export type ViewReport = {
    verdict: ViewVerdict;
    kind: ViewKind;
    text?: string;
    errors?: VetFinding[];
};
export type ViewOptions = {
    path?: string;
    trust?: TrustOptions;
    relation?: string;
    roots?: string[];
};
export declare function viewTree(src: string, opts?: ViewOptions): ViewReport;
