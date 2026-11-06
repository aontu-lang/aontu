import type { Val } from './type';
import { AontuContext } from './ctx';
import { Lang } from './lang';
declare const withDepth: (ctx: AontuContext, a: any, b: any, run: () => any) => any;
declare function ride(out: any, a: any, b: any): void;
declare function rideOn(ctx: AontuContext, out: any, a: any, b: any): any;
declare const unite: (ctx: AontuContext, a: any, b: any, whence: string) => any;
type LinkSite = {
    link: any;
    at: string[];
    put: (v: Val) => void;
};
declare function linksOf(root: Val): LinkSite[];
declare function holdsLink(v: any, seen?: Set<any>): boolean;
declare class Unify {
    root: Val;
    res: Val;
    err: any[];
    explain: any[] | null;
    cc: number;
    lang: Lang;
    constructor(root: Val | string, lang?: Lang, ctx?: AontuContext | any, src?: any);
}
declare const meetTemplate: (ctx: AontuContext, member: Val, tmpl: Val, whence: string) => Val;
export { Unify, holdsLink, linksOf, unite, meetTemplate, withDepth, ride, rideOn, };
