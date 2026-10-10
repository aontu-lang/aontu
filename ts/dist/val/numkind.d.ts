declare function isIntegerKind(n: number, src?: string): boolean;
declare function isIntegerStorable(n: bigint): boolean;
declare function isExactInBinary64(n: bigint): boolean;
declare function isLossyIntegerLiteral(n: number, src?: string): boolean;
declare function integerDigits(peg: number): string;
type ExactNumber = {
    leaf: 'integer';
    int: number;
} | {
    leaf: 'biginteger';
    int: bigint;
} | {
    leaf: 'bigdecimal';
    unscaled: bigint;
    scale: number;
} | {
    leaf: 'error';
    code: string;
};
declare function readExactNumber(src: string): ExactNumber | undefined;
declare function exactNumberText(n: ExactNumber): string | undefined;
export { exactNumberText, integerDigits, isExactInBinary64, isIntegerKind, isIntegerStorable, isLossyIntegerLiteral, readExactNumber, };
export type { ExactNumber, };
