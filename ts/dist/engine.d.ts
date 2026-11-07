import type { AontuOptions } from './type';
import { Aontu } from './aontu';
declare const MAX_ENGINES = 8;
declare function sharedEngine(opts: Partial<AontuOptions>): Aontu;
export { sharedEngine, MAX_ENGINES, };
