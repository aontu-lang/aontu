import type { Val, ValSpec } from '../type';
import { AontuContext } from '../ctx';
import { ScalarVal } from './ScalarVal';
declare class StringVal extends ScalarVal {
    isString: boolean;
    needsNonEmpty: boolean;
    emptyOk: boolean;
    constructor(spec: ValSpec, ctx?: AontuContext);
    clone(ctx: AontuContext, spec?: ValSpec): Val;
    withEmpty(ctx: AontuContext): Val;
    withNonEmpty(ctx: AontuContext): Val;
    unify(peer: Val, ctx: AontuContext): Val;
    superior(): Val;
    get refused(): boolean;
    get canon(): string;
    gen(ctx: AontuContext): any;
}
export { StringVal, };
