import type { TrustOptions } from './type';
import type { VetFinding } from './vet';
export declare const AGENTSMD_BEGIN = "<!-- aontu:begin -->";
export declare const AGENTSMD_END = "<!-- aontu:end -->";
export type AgentsMdReport = {
    findings: VetFinding[];
    ok: boolean;
    stanza: string;
};
export type AgentsMdOptions = {
    name?: string;
    path?: string;
    trust?: TrustOptions;
};
export declare function agentsMd(src: string, opts?: AgentsMdOptions): AgentsMdReport;
export declare function agentsMdSplice(existing: string, stanza: string): string;
