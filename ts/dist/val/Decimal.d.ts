declare const DECIMAL_COEFFICIENT_BUDGET = 4096;
declare const DECIMAL_SCALE_BUDGET = 4096;
declare class Decimal {
    readonly unscaled: bigint;
    readonly scale: number;
    constructor(unscaled: bigint, scale: number);
    equals(peer: Decimal): boolean;
    compare(peer: Decimal): number;
    negate(): Decimal;
    add(peer: Decimal): Decimal;
    multiply(peer: Decimal): Decimal;
    ceil(): Decimal;
    floor(): Decimal;
    private intPart;
    isZero(): boolean;
    toString(): string;
    canon(): string;
    static fromString(src: string): Decimal;
}
declare function decimalOverBudget(d: Decimal): boolean;
declare const BIG_LITERAL_RE: RegExp;
type BigLiteral = {
    leaf: 'biginteger';
    int: bigint;
} | {
    leaf: 'bigdecimal';
    dec: Decimal;
} | {
    leaf: 'error';
    code: string;
};
declare function readBigLiteral(m: RegExpExecArray | (string | undefined)[]): BigLiteral;
export { BIG_LITERAL_RE, BigLiteral, DECIMAL_COEFFICIENT_BUDGET, DECIMAL_SCALE_BUDGET, Decimal, decimalOverBudget, readBigLiteral, };
