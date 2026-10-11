import type { ValSpec } from '../type';
import { AontuContext } from '../ctx';
import { Val } from './Val';
import { FeatureVal } from './FeatureVal';
declare class ExpectVal extends FeatureVal {
    isExpect: boolean;
    peer?: Val;
    parent?: Val;
    key?: string;
    get canon(): string;
    constructor(spec: ValSpec, ctx?: AontuContext);
    unify(peer: Val, ctx: AontuContext): Val;
    gen(ctx: AontuContext): undefined;
    inspection(d?: number): string;
}
export { ExpectVal, };
