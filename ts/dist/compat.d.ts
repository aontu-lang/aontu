import type { SubsumeOptions } from './subsume';
import type { VetFinding } from './vet';
export type OutcomeReport = {
    verdict: 'ok' | 'breaking' | 'error';
    findings: VetFinding[];
};
export declare function compatOutcome(nextSrc: string, priorSrc: string, opts?: SubsumeOptions): OutcomeReport;
