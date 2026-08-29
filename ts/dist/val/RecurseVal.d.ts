import type { Val, ValSpec } from '../type';
import { AontuContext } from '../ctx';
import { FeatureVal } from './FeatureVal';
declare class RecurseVal extends FeatureVal {
    isRecurse: boolean;
    isGenable: boolean;
    cjo: number;
    target: string[];
    xc: number;
    constructor(spec: ValSpec, ctx?: AontuContext);
    clone(ctx: AontuContext, spec?: ValSpec): Val;
    private body;
    unify(peer: Val, ctx: AontuContext): Val;
    get canon(): string;
    gen(ctx: AontuContext): undefined;
}
declare function bumpRecurse(v: any, xc: number): void;
declare function containsRecurseOf(v: any, target: string[], depth?: number): boolean;
export { RecurseVal, bumpRecurse, containsRecurseOf, };
