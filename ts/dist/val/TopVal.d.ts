import type { ValSpec } from '../type';
import { AontuContext } from '../ctx';
import { Val } from './Val';
declare class TopVal extends Val {
    isTop: boolean;
    id: number;
    dc: number;
    constructor(spec: ValSpec, ctx?: AontuContext);
    same(peer: Val): boolean;
    unify(peer: Val, ctx: AontuContext): Val;
    get canon(): string;
    superior(): Val;
    clone(_ctx: AontuContext, _spec?: ValSpec): Val;
    gen(_ctx?: AontuContext): undefined;
}
export { TopVal, };
