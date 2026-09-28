import type { Val, ValSpec } from '../type';
import { AontuContext } from '../ctx';
import { FeatureVal } from './FeatureVal';
declare class ConstraintKindVal extends FeatureVal {
    isConstraintKind: boolean;
    held?: Val;
    constructor(spec: ValSpec, ctx?: AontuContext);
    unify(peer: Val, ctx: AontuContext): Val;
    hold(v: Val, ctx: AontuContext): Val;
    clone(ctx: AontuContext, spec?: ValSpec): Val;
    get canon(): string;
    same(peer: any): boolean;
}
export { ConstraintKindVal, };
