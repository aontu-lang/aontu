import type { AontuOptions } from './type';
declare function varNamesIn(src: string, opts: AontuOptions, read: Set<string>): boolean;
declare function bindingFailure(src: string): string | undefined;
export { varNamesIn, bindingFailure, };
