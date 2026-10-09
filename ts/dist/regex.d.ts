import type { Ranges } from './uniprop';
type Dialect = 'ecma' | 'aontu';
type Inst = {
    op: 'set';
    set: Ranges;
} | {
    op: 'split';
    x: number;
    y: number;
} | {
    op: 'jmp';
    x: number;
} | {
    op: 'match';
} | {
    op: 'bol';
} | {
    op: 'eol';
} | {
    op: 'wb';
} | {
    op: 'nwb';
};
declare const PROGRAM_MAX = 100000;
declare function compilePattern(src: string, dialect: Dialect): [Inst[], ''] | [undefined, string];
declare function patternMatches(prog: Inst[], text: string): boolean;
declare function exportForm(src: string): [string, string];
declare function importForm(src: string): [string, string];
declare function ecmaWhy(src: string): string;
export type { Dialect, Inst };
export { compilePattern, patternMatches, exportForm, importForm, ecmaWhy, PROGRAM_MAX, };
