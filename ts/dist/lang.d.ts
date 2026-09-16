import { Jsonic } from '@tabnas/jsonic';
import type { Val, AontuOptions } from './type';
import { Site } from './site';
export declare function includeFormat(ext: string, textExt?: string[]): string | undefined;
declare class Lang {
    jsonic: Jsonic;
    opts: AontuOptions;
    idcount: number | undefined;
    constructor(options?: Partial<AontuOptions>);
    parse(src: string, opts?: Partial<AontuOptions>): Val;
}
export { Lang, Site, };
