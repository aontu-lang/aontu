import type { Val } from './type';
import { AontuContext } from './ctx';
declare function genOn(ctx: AontuContext, out: any, a: any, b: any): Val;
declare function genHeld(ctx: AontuContext | undefined, pref: any): any;
export { genHeld, genOn, };
