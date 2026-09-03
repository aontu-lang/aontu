import type { Val, AontuOptions } from './type';
import { Lang } from './lang';
import { AontuContext, AontuContextConfig } from './ctx';
import { Decimal } from './val/Decimal';
import { exactJSON } from './exactjson';
import { formatExplain } from './utility';
import { AontuError, setColor, colorActive } from './err';
import { vet } from './vet';
import { sarifReport } from './report-sarif';
import { subsume } from './subsume';
import { trimCheck } from './trim';
import { hcanon, canonHash } from './hcanon';
import { get, why } from './query';
import { patch } from './patch';
import { diff } from './diff';
import { agentsMd } from './agentsmd';
import { graphOf } from './graph';
import { relationCheck } from './relation';
import { view, viewSet, viewTree } from './view';
import { format, unifiedDiff } from './format';
export type { LintFinding, FormatReport, FormatOptions } from './format';
declare const VERSION = "0.56.0";
declare class Aontu {
    opts: AontuOptions;
    lang: Lang;
    constructor(popts?: AontuOptions);
    ctx(cfg?: AontuContextConfig): AontuContext;
    parse(src: string, opts?: AontuOptions, ac?: AontuContext): Val | undefined;
    unify(src: string | Val, opts?: AontuOptions, ac?: AontuContext | any): Val;
    generate(src: string, opts?: any, ac?: AontuContext): any;
}
declare function runparse(src: string, lang: Lang, ctx: AontuContext): Val;
declare const util: {
    runparse: typeof runparse;
};
export { VERSION, Aontu, AontuOptions, AontuContext, AontuError, setColor, colorActive, Val, Lang, runparse, util, formatExplain, exactJSON, Decimal, vet, sarifReport, subsume, trimCheck, hcanon, canonHash, get, why, patch, diff, agentsMd, graphOf, relationCheck, view, viewSet, viewTree, format, unifiedDiff, };
export default Aontu;
