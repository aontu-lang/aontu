import type { Val, ValSpec } from '../type';
import { AontuContext } from '../ctx';
import { FuncBaseVal } from './FuncBaseVal';
import { FeatureVal } from './FeatureVal';
declare class GraphAtomVal extends FeatureVal {
    isGraphAtom: boolean;
    isGenable: boolean;
    cjo: number;
    constructor(spec: ValSpec, ctx?: AontuContext);
    unify(peer: Val, ctx: AontuContext): Val;
    get canon(): string;
    gen(_ctx: AontuContext): undefined;
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
