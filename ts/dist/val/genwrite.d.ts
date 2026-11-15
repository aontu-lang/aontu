import { AontuContext } from '../ctx';
declare function genWrites(ctx: AontuContext | undefined, v: any): boolean;
declare function genPlain(v: any, ctx: any): any;
declare function genRefuse(ctx: AontuContext | undefined, code: string, v: any, details?: Record<string, any>): undefined;
declare function genWrite(ctx: AontuContext | undefined, v: any, native: any): any;
declare function genWriteBag(ctx: AontuContext, bag: any, out: any): any;
export { genPlain, genRefuse, genWrite, genWriteBag, genWrites, };
