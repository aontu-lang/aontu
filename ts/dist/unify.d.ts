import type { Val } from './type';
import { AontuContext } from './ctx';
import { Lang } from './lang';
declare const withDepth: (ctx: AontuContext, a: any, b: any, run: () => any) => any;
declare const unite: (ctx: AontuContext, a: any, b: any, whence: string) => any;
declare class Unify {
    root: Val;
    res: Val;
    err: any[];
    explain: any[] | null;
    cc: number;
    lang: Lang;
    constructor(root: Val | string, lang?: Lang, ctx?: AontuContext | any, src?: any);
}
export { Unify, unite, withDepth, };
