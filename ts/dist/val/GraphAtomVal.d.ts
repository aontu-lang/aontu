import type { Val, ValSpec } from '../type';
import { AontuContext } from '../ctx';
import { FuncBaseVal } from './FuncBaseVal';
import { FeatureVal } from './FeatureVal';
export type RelDecl = {
    acyclic?: boolean;
    inverses: Set<string>;
};
export declare function relDecls(ctx: any): Map<string, RelDecl>;
declare class GraphAtomVal extends FeatureVal {
    isGraphAtom: boolean;
    isGenable: boolean;
    cjo: number;
    akind: 'acyclic' | 'inverse';
    invname?: string;
    held?: Val;
    constructor(spec: ValSpec, ctx?: AontuContext);
    clone(ctx: AontuContext, spec?: ValSpec): Val;
    private carry;
    register(ctx: AontuContext): void;
    unify(peer: Val, ctx: AontuContext): Val;
    get canon(): string;
    gen(ctx: AontuContext): any;
}
declare class AcyclicFuncVal extends FuncBaseVal {
    isAcyclicFunc: boolean;
    constructor(spec: ValSpec, ctx?: AontuContext);
    make(_ctx: AontuContext, spec: ValSpec): Val;
    funcname(): string;
    resolve(ctx: AontuContext, _args: Val[]): any;
}
declare class InverseFuncVal extends FuncBaseVal {
    isInverseFunc: boolean;
    constructor(spec: ValSpec, ctx?: AontuContext);
    make(_ctx: AontuContext, spec: ValSpec): Val;
    funcname(): string;
    resolve(ctx: AontuContext, args: Val[]): any;
}
export { GraphAtomVal, AcyclicFuncVal, InverseFuncVal, };
