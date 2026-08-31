import type { Val, ValSpec } from '../type';
import { AontuContext } from '../ctx';
import { FuncBaseVal } from './FuncBaseVal';
import { Address } from './PathVal';
import { FeatureVal } from './FeatureVal';
export declare function addressPath(addr: Address, at: (string | number)[]): string[] | undefined;
export declare function findAt(root: Val | undefined, path: string[]): {
    parent?: any;
    key?: string;
    val: Val;
} | undefined;
declare class ReferVal extends FeatureVal {
    isRefer: boolean;
    isGenable: boolean;
    cjo: number;
    tval: Val;
    addr?: Address;
    addrsrc?: string;
    held?: Val;
    relkey?: string;
    addrcode: string;
    unresolvedcode: string;
    constructor(spec: ValSpec, ctx?: AontuContext);
    clone(ctx: AontuContext, spec?: ValSpec): Val;
    unify(peer: Val, ctx: AontuContext): Val;
    with(ctx: AontuContext, spec: any, site: Val): Val;
    settle(ctx: AontuContext, site: Val): Val;
    get canon(): string;
}
declare class RelVal extends FeatureVal {
    isRel: boolean;
    isGenable: boolean;
    cjo: number;
    tval: Val;
    held?: Val;
    constructor(spec: ValSpec, ctx?: AontuContext);
    clone(ctx: AontuContext, spec?: ValSpec): Val;
    fieldkey(ctx: AontuContext): string | undefined;
    leafRefer(ctx: AontuContext, relkey: string | undefined): ReferVal;
    rewrite(ctx: AontuContext, container: any): Val;
    rewriteUnder(ctx: AontuContext, container: any, relkey: string | undefined): Val;
    unify(peer: Val, ctx: AontuContext): Val;
    get canon(): string;
}
declare class RelFuncVal extends FuncBaseVal {
    isRelFunc: boolean;
    constructor(spec: ValSpec, ctx?: AontuContext);
    make(_ctx: AontuContext, spec: ValSpec): Val;
    funcname(): string;
    resolve(ctx: AontuContext, args: Val[]): RelVal;
}
declare class ReferFuncVal extends FuncBaseVal {
    isReferFunc: boolean;
    constructor(spec: ValSpec, ctx?: AontuContext);
    make(_ctx: AontuContext, spec: ValSpec): Val;
    funcname(): string;
    resolve(ctx: AontuContext, args: Val[]): ReferVal;
}
export { ReferFuncVal, ReferVal, RelFuncVal, RelVal, };
