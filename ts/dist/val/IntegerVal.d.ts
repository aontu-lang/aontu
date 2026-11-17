import type { Val, ValSpec } from '../type';
import { AontuContext } from '../ctx';
import { ScalarVal } from './ScalarVal';
declare class IntegerVal extends ScalarVal {
    isInteger: boolean;
    get canon(): string;
    gen(ctx?: AontuContext): any;
    constructor(spec: ValSpec, ctx?: AontuContext);
    unify(peer: any, ctx: AontuContext): Val;
}
export { IntegerVal, };
