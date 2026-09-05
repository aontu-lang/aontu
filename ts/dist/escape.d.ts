declare const ESC_VARIANTS: string[];
declare function isEscVariant(v: string): boolean;
declare function escapeText(src: string, variant: string): string;
declare function unescapeText(src: string, variant: string): [string, boolean];
export { ESC_VARIANTS, isEscVariant, escapeText, unescapeText, };
