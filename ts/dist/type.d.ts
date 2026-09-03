import * as Fs from 'node:fs';
import { Resolver } from '@tabnas/multisource';
import { Val, DONE, SPREAD } from './val/Val';
import type { ValMark, ValSpec } from './val/Val';
type FST = typeof Fs;
type TrustInclude = 'none' | 'system' | {
    mem: Record<string, string>;
} | {
    root: string;
};
type TrustBudget = {
    passes?: number;
    depth?: number;
};
type TrustOptions = {
    include?: TrustInclude;
    budget?: TrustBudget;
};
type AontuOptions = {
    src?: string;
    print?: number;
    resolver?: Resolver;
    base?: string;
    path?: string;
    debug?: boolean;
    trace?: boolean;
    fs?: FST;
    deps?: any;
    log?: any;
    idcount?: number;
    collect?: boolean;
    err?: any[];
    explain?: any[];
    trust?: TrustOptions;
    textExt?: string[];
    trustWarn?: (kind: 'escape' | 'pkg', path: string) => void;
    trustWarnRoot?: string;
};
declare const DEFAULT_OPTS: () => AontuOptions;
type ValMap = {
    [key: string]: Val;
};
type ValList = Val[];
type ErrContext = {
    src?: string;
    fs?: FST;
};
export type { Val, ValMark, ValSpec, ValMap, ValList, AontuOptions, ErrContext, FST, TrustInclude, TrustBudget, TrustOptions, };
export { DONE, SPREAD, DEFAULT_OPTS, Resolver, };
