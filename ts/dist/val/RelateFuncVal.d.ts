import type { Val, ValSpec } from '../type';
import { AontuContext } from '../ctx';
import { FuncBaseVal } from './FuncBaseVal';
import { Address, addressPath } from './PathVal';
import { FeatureVal } from './FeatureVal';
export declare function findAt(root: Val | undefined, path: string[]): {
    parent?: any;
    key?: string;
    val: Val;
} | undefined;
declare class PendingLinkVal extends FeatureVal {
    isPendingLink: boolean;
    isGenable: boolean;
    cjo: number;
    tval: Val;
    addr?: Address;
    addrsrc?: string;
    held?: Val;
    root: boolean;
    from?: Val;
    constructor(spec: ValSpec, ctx?: AontuContext);
    clone(ctx: AontuContext, spec?: ValSpec): Val;
    unify(peer: Val, ctx: AontuContext): Val;
    with(ctx: AontuContext, spec: any, site: Val): Val;
    settle(ctx: AontuContext, site: Val): Val;
    get canon(): string;
}
declare class RelateVal extends FeatureVal {
    isRelate: boolean;
    isGenable: boolean;
    cjo: number;
    tval: Val;
    held?: Val;
    constructor(spec: ValSpec, ctx?: AontuContext);
    clone(ctx: AontuContext, spec?: ValSpec): Val;
    leafLink(ctx: AontuContext, root: boolean): PendingLinkVal;
    rewrite(ctx: AontuContext, container: any): Val;
    rewriteUnder(ctx: AontuContext, container: any): Val;
    unify(peer: Val, ctx: AontuContext): Val;
    get canon(): string;
}
declare class RelateFuncVal extends FuncBaseVal {
    isRelateFunc: boolean;
    constructor(spec: ValSpec, ctx?: AontuContext);
    make(_ctx: AontuContext, spec: ValSpec): Val;
    funcname(): string;
    resolve(ctx: AontuContext, args: Val[]): RelateVal;
}
export { addressPath, PendingLinkVal, RelateFuncVal, RelateVal, };
