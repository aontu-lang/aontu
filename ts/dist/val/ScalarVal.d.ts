import type { ValSpec } from '../type';
import { AontuContext } from '../ctx';
import { Val } from './Val';
declare class ScalarVal extends Val {
    kind: any;
    isScalar: boolean;
    isGenable: boolean;
    src: string;
    constructor(spec: ValSpec, ctx?: AontuContext);
    clone(ctx: AontuContext, spec?: ValSpec): Val;
    unify(peer: Val, ctx: AontuContext): Val;
    get canon(): any;
    same(peer: any): boolean;
    samePeg(peg: any): boolean;
    gen(ctx?: AontuContext): any;
    superior(): Val;
}
export { ScalarVal, };
