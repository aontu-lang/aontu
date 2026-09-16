import type { Server } from 'node:http';
import { relPathError } from './pkg';
import type { PkgToolOptions, LockEntry, Dependency, PkgManifest, PkgMismatch } from './pkg';
export type HttpResponse = {
    status: number;
    body: Uint8Array;
};
export type PublishParts = {
    manifest: Uint8Array;
    proof: Uint8Array;
    archive: Uint8Array;
};
export type PkgHttp = {
    get: (url: string) => Promise<HttpResponse>;
    post: (url: string, parts: PublishParts, token: string) => Promise<HttpResponse>;
};
export declare const DEFAULT_BASE = "https://pkg.aontu.dev";
export declare const DEFAULT_WRITE = "https://publish.aontu.dev";
export declare const PUBLISH_PATH = "/v1/publish";
export declare const COOLDOWN_HOURS = 72;
export declare const CLOSURE_MAX = 1024;
export declare const LIMITS: {
    depth: number;
    closure: number;
};
export declare const ARCHIVE_MAX_BYTES: number;
export declare const ARCHIVE_MAX_UNPACKED: number;
export declare const ARCHIVE_MAX_FILES: number;
export declare const ARCHIVE_MAX_FILE_BYTES: number;
export declare const SIGNATURE_ENCODING = "aontu-signature/v1";
export type TrustEntry = {
    signer: string;
    inclusion: 'required' | 'none';
};
export type RepoConfig = {
    base: string[];
    write: string;
    private: string[];
    privateBase: string[];
    trust: Record<string, TrustEntry>;
};
export type PkgEvent = {
    code: string;
    message: string;
};
export type PkgRefusalReport = {
    code: string;
    message: string;
    pkg?: string;
};
export declare class PkgRefusal extends Error {
    code: string;
    pkg?: string;
    constructor(code: string, message: string, pkg?: string);
}
export declare function isLoopback(url: string): boolean;
export declare function baseAdmitted(url: string): boolean;
export type RepoOverrides = {
    base?: string[];
    write?: string;
};
export declare function repoConfig(root: string, options: PkgToolOptions, overrides?: RepoOverrides): RepoConfig;
export declare function patternMatches(pattern: string, pkg: string): boolean;
export declare function trustEntryFor(config: RepoConfig, pkg: string): TrustEntry;
export declare function isPrivateName(config: RepoConfig, pkg: string): boolean;
export declare function pkgUrlPath(pkg: string): string;
export declare function objectPath(kind: string, pkg: string, version?: string): string;
export declare function timestamp(d: Date): string;
export declare function keyIdOf(publicKeyDer: Uint8Array): string;
export declare function keyIdFromPem(pem: string): string;
export declare function keygen(file: string): {
    signer?: string;
    refused?: string;
};
export type KeyProof = {
    kind: 'key';
    encoding: typeof SIGNATURE_ENCODING;
    over: string;
    signer: string;
    signature: string;
};
export declare function signDigest(pem: string, over: string): KeyProof;
export declare function smallOrderKey(raw: Uint8Array): boolean;
export declare function verifyKeyProof(proof: any, over: string, signer: string): string | undefined;
export declare function packagePath(s: any): boolean;
export declare function manifestError(m: any): string | undefined;
export { relPathError };
type Acquired = {
    pkg: string;
    version: string;
    canon: string;
    archive: string;
    manifestDigest: string;
    deps: Record<string, Dependency>;
    dir: string;
    closure: LockEntry[];
};
type AcquireCtx = {
    options: PkgToolOptions;
    http: PkgHttp;
    config: RepoConfig;
    cache: string;
    now: () => Date;
    events: PkgEvent[];
    fetched: string[];
    acquired: Record<string, Acquired>;
    count: number;
};
export declare function acquire(ctx: AcquireCtx, pkg: string, asked: string | undefined, depth: number): Promise<Acquired>;
export type PkgSyncReport = {
    verdict: 'ok' | 'frozen' | 'refused' | 'missing' | 'error' | 'mismatch' | 'unlocked';
    fetched: string[];
    lock: LockEntry[];
    vendored: string[];
    missing: string[];
    unevaluable: string[];
    forbidden: string[];
    mismatched: PkgMismatch[];
    unlocked: string[];
    changes: string[];
    events: PkgEvent[];
    refusal?: PkgRefusalReport;
};
export type SyncArgs = RepoOverrides & {
    frozen?: boolean;
    now?: () => Date;
};
export declare function pkgSync(root: string, options: PkgToolOptions, http: PkgHttp, args?: SyncArgs): Promise<PkgSyncReport>;
export type DepEdit = {
    op: 'add';
    key: string;
    v: string;
} | {
    op: 'raise';
    key: string;
    v: string;
} | {
    op: 'remove';
    key: string;
};
export declare function editDeps(root: string, edit: DepEdit, options: PkgToolOptions): string | undefined;
export type PkgChangeReport = PkgSyncReport & {
    change: string;
};
export type ChangeArgs = SyncArgs & {
    mode: 'add' | 'get';
};
export declare function parsePkgSpec(spec: string): {
    pkg: string;
    version?: string;
} | string;
export declare function pkgGet(root: string, options: PkgToolOptions, http: PkgHttp, spec: string, args: ChangeArgs): Promise<PkgChangeReport | string>;
export declare function pkgRemove(root: string, options: PkgToolOptions, http: PkgHttp, pkg: string, args: SyncArgs): Promise<PkgChangeReport | string>;
export type PkgWhyReport = {
    verdict: 'ok' | 'missing';
    pkg: string;
    paths: string[][];
};
export declare function pkgWhy(root: string, options: PkgToolOptions, pkg: string): PkgWhyReport;
export type LayoutWrite = {
    manifest: any;
    manifestBytes: Uint8Array;
    proofBytes: Uint8Array;
    archive: Uint8Array;
};
export declare function writeLayout(dir: string, w: LayoutWrite, options: PkgToolOptions, now: Date): void;
export declare function dirHttp(dir: string): PkgHttp;
export type PkgPublishReport = {
    verdict: 'dry-run' | 'sent' | 'refused' | 'breaking' | 'undecided' | 'error';
    manifest?: PkgManifest;
    digest?: string;
    signer?: string;
    against?: string;
    to?: string;
    write?: string;
    missing: string[];
    forbidden: string[];
    findings: any[];
    refusal?: PkgRefusalReport;
};
export type PublishArgs = RepoOverrides & {
    yes?: boolean;
    to?: string;
    key?: string;
    token?: string;
    against?: string;
    now?: () => Date;
};
export declare function publisherFromToken(token: string): any | undefined;
export declare function pkgPublish(root: string, options: PkgToolOptions, http: PkgHttp, args: PublishArgs): Promise<PkgPublishReport>;
export type PkgOutdatedEntry = {
    key: string;
    v: string;
    newest: string;
    retracted?: string;
    moves: string[];
};
export type PkgOutdatedReport = {
    verdict: 'current' | 'outdated' | 'refused';
    locked: PkgOutdatedEntry[];
    events: PkgEvent[];
    refusal?: PkgRefusalReport;
};
export declare function pkgOutdated(root: string, options: PkgToolOptions, http: PkgHttp, args?: SyncArgs): Promise<PkgOutdatedReport>;
export declare function objectShape(p: string): boolean;
export declare function objectMutable(p: string): boolean;
export type ServeOptions = {
    dir: string;
    upstream: string[];
    listen: string;
    http: PkgHttp;
};
export type Served = {
    url: string;
    close: () => Promise<void>;
    server: Server;
};
export declare function serveObject(opts: ServeOptions, p: string): Promise<{
    status: number;
    body: Uint8Array;
    stale?: boolean;
}>;
export declare function startServe(opts: ServeOptions): Promise<Served>;
export declare function servedUrl(address: string, port: number): string;
export declare function splitListen(listen: string): [string, number];
export declare function readBounded(r: Response, max: number): Promise<Uint8Array>;
export declare function defaultHttp(): PkgHttp;
