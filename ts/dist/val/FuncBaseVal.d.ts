import type { Val, ValSpec } from '../type';
import { AontuContext } from '../ctx';
import { FeatureVal } from '../val/FeatureVal';
declare function trialUnify(ctx: AontuContext, a: Val, b: Val): Val | undefined;
declare class FuncBaseVal extends FeatureVal {
    isFunc: boolean;
    isGenable: boolean;
    staged: boolean;
    constructor(spec: ValSpec, ctx?: AontuContext);
    validateArgs(args: Val[], min: number): void;
    make(ctx: AontuContext, _spec: ValSpec): Val;
    driveStagedArgs(ctx: AontuContext, count: number): boolean;
    clone(ctx: AontuContext, spec?: ValSpec): Val;
    residuate(peer: Val, ctx: AontuContext): Val;
    unify(peer: Val, ctx: AontuContext): Val;
    get canon(): string;
    funcname(): string;
    prepare(_ctx: AontuContext, args: Val[]): Val[] | null;
    resolve(ctx: AontuContext, _args: Val[]): Val;
}
export { trialUnify, FuncBaseVal, };
