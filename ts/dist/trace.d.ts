import type { Val } from './type';
import type { IncludeOptions } from './utility';
import type { VetFinding } from './vet';
export type TraceOptions = IncludeOptions & {
    path?: string;
    at?: string;
};
export type TraceReport = {
    verdict: 'ok' | 'error';
    trace: TraceEntry[];
    errors?: VetFinding[];
};
export type TraceEntry = {
    at: string;
    file: string;
    node: string;
    rule: string;
};
declare function traceTree(root: Val): TraceEntry[];
declare function traceRun(src: string, options?: TraceOptions): TraceReport;
export { traceTree, traceRun, };
