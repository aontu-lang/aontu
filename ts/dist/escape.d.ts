declare const ESC_VARIANTS: string[];
declare function isEscVariant(v: string): boolean;
declare function hexDigit(ch: string): number;
declare function utf8Bytes(ch: string): number[];
declare function utf8Text(bytes: number[]): [string, boolean];
declare function escapeText(src: string, variant: string): string;
declare function unescapeText(src: string, variant: string): [string, boolean];
export { ESC_VARIANTS, isEscVariant, escapeText, unescapeText, hexDigit, utf8Bytes, utf8Text, };
