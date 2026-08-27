import type { VetFinding } from './vet';
import type { TrustOptions } from './type';
export type TrimVerdict = 'clean' | 'redundant' | 'error';
export type TrimReport = {
    verdict: TrimVerdict;
    redundant: string[];
    errors?: VetFinding[];
};
export type TrimOptions = {
    path?: string;
    trust?: TrustOptions;
};
export declare function candidates(v: any, path: string[], out: string[][]): void;
export declare function deleteAt(root: any, path: string[]): boolean;
export declare function evalCanon(src: string, opts: TrimOptions, delPath?: string[], sink?: {
    ctx?: any;
}): string | undefined;
export declare function trimCheck(src: string, opts?: TrimOptions): TrimReport;
