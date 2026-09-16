import { Aontu } from './aontu';
import type { Served, PkgHttp } from './pkg-net';
import type { PkgToolOptions } from './pkg';
import type { VetFinding } from './vet';
import type { WhyRecord } from './provenance';
type Mode = 'json' | 'canon';
declare function evalSource(aontu: Aontu, src: string, mode: Mode): {
    ok: boolean;
    text: string;
    findings: VetFinding[];
};
type TrustArg = ({
    kind: 'system-warn';
} | {
    kind: 'system';
} | {
    kind: 'none';
} | {
    kind: 'root';
    dir?: string;
}) & {
    textExt: string[];
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
declare function runPkg(argv: string[], servers: Servers): number | Promise<number>;
declare function pkgToolOptions(trust: TrustArg, entryRoot: string): PkgToolOptions;
declare function runPackageVerb(verb: string, argv: string[], servers: Servers): Promise<number>;
declare function runModel(argv: string[]): number;
declare function runRelations(argv: string[]): number;
declare function runTrace(argv: string[]): number;
declare function runRender(argv: string[]): Promise<number>;
declare function runReaches(argv: string[]): number;
declare function runView(argv: string[]): number;
declare function runJsonSchema(argv: string[]): number;
declare function runTemplate(argv: string[]): number;
declare function runHash(argv: string[]): number;
declare function runGet(argv: string[]): number;
declare function runWhy(argv: string[]): number;
declare function renderWhyText(record: WhyRecord): string;
declare function runSet(argv: string[]): number;
declare function runAllow(argv: string[]): number;
declare function runAgentsMd(argv: string[]): number;
declare function runFmt(argv: string[]): number | Promise<number>;
type Io = {
    out: (s: string) => void;
    err: (s: string) => void;
};
type Servers = {
    lsp: () => void;
    mcp: (argv: string[]) => void;
    serve: (served: Served) => Promise<void>;
    http: () => PkgHttp;
    io?: Io;
};
declare function serveUntilInterrupted(): Promise<void>;
declare function runHelp(argv: string[]): number;
declare function runExplain(argv: string[]): number;
declare function runInit(argv: string[]): number;
declare const KNOWN_VERBS: string[];
declare function looksLikeVerb(arg: string): boolean;
declare function nearestVerb(word: string, verbs: string[]): string;
declare function main(argv: string[], servers?: Servers): void;
export { evalSource, main, runVet, runSubsume, runBreaking, runTrim, runRelations, runReaches, runView, runJsonSchema, runTemplate, runTrace, runRender, runPkg, runModel, runPackageVerb, pkgToolOptions, serveUntilInterrupted, runHash, runGet, runHelp, runExplain, runInit, nearestVerb, looksLikeVerb, KNOWN_VERBS, runWhy, renderWhyText, runSet, runAllow, runAgentsMd, runFmt, watchChange, watchSignature, vetWaiter, deprecatedAt, };
