import { Aontu } from './aontu';
import type { WhyRecord } from './provenance';
type Mode = 'json' | 'canon';
declare function evalSource(aontu: Aontu, src: string, mode: Mode): {
    ok: boolean;
    text: string;
};
type TrustArg = {
    kind: 'system-warn';
} | {
    kind: 'system';
} | {
    kind: 'none';
} | {
    kind: 'root';
    dir?: string;
};
export type ReplState = {
    mode: Mode;
    jsonl: boolean;
    name?: string;
    src?: string;
    trust?: TrustArg;
};
export type ReplAnswer = {
    close: boolean;
    out: string;
    state: ReplState;
};
export declare function replCommand(state: ReplState, line: string, read: (file: string) => string): ReplAnswer;
declare function watchSignature(files: string[]): string;
declare function watchChange(files: string[], before: string, pollMs: number): Promise<boolean>;
type VetWaiter = (files: string[], before: string) => Promise<boolean>;
declare const vetWaiter: VetWaiter;
declare function runVet(argv: string[], wait?: VetWaiter): number | Promise<number>;
declare function runSubsume(argv: string[]): number;
declare function deprecatedAt(oldSrc: string, path: string, filePath: string): boolean;
declare function runBreaking(argv: string[]): number;
declare function runTrim(argv: string[]): number;
declare function runMod(argv: string[]): number;
declare function runRelations(argv: string[]): number;
declare function runJsonSchema(argv: string[]): number;
declare function runHash(argv: string[]): number;
declare function runGet(argv: string[]): number;
declare function runWhy(argv: string[]): number;
declare function renderWhyText(record: WhyRecord): string;
declare function runSet(argv: string[]): number;
declare function runAgentsMd(argv: string[]): number;
declare function main(argv: string[]): void;
export { evalSource, main, runVet, runSubsume, runBreaking, runTrim, runRelations, runJsonSchema, runMod, runHash, runGet, runWhy, renderWhyText, runSet, runAgentsMd, watchChange, watchSignature, vetWaiter, deprecatedAt, };
