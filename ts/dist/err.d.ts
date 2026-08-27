import { Val, ErrContext } from './type';
import { AontuContext } from './ctx';
import { NilVal } from './val/NilVal';
declare function setColor(on: boolean | undefined): void;
declare function colorActive(): boolean;
declare function getHint(why: any, details?: Record<string, any>): string | undefined;
declare function makeNilErr(ctx?: AontuContext, why?: any, av?: Val, bv?: Val, attempt?: string, details?: Record<string, any>): NilVal;
declare function descErr<NILS extends NilVal | NilVal[]>(err: NILS | any, errctx?: ErrContext): any;
declare class AontuError extends Error {
    aontu: boolean;
    constructor(msg: string, errs?: NilVal[]);
    errs: () => NilVal[];
}
export { getHint, makeNilErr, descErr, AontuError, setColor, colorActive, };
