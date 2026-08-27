import type { Val } from '../type';
import { AontuContext } from '../ctx';
type ArithOp = 'add' | 'sub' | 'mul' | 'div' | 'mod' | 'rem';
declare function arith(ctx: AontuContext | undefined, op: ArithOp, node: Val, a: Val, b: Val, attempt?: string): Val;
export type { ArithOp, };
export { arith, };
