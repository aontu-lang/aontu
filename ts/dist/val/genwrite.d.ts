import { AontuContext } from '../ctx';
declare const genHooks: {
    custom?: (ctx: AontuContext | undefined, v: any, custom: string, given: string) => any;
};
declare function genWrites(ctx: AontuContext | undefined, v: any): boolean;
declare function genPlain(v: any, ctx: any): any;
declare function genRefuse(ctx: AontuContext | undefined, code: string, v: any, details?: Record<string, any>): undefined;
declare function genFinish(ctx: AontuContext | undefined, v: any, w: any): any;
declare function genWrite(ctx: AontuContext | undefined, v: any, native: any): any;
declare function genWriteBag(ctx: AontuContext, bag: any, out: any): any;
export { genFinish, genHooks, genPlain, genRefuse, genWrite, genWriteBag, genWrites, };
