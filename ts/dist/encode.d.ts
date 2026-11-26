declare const ENCODE_NAMES: string[];
declare function isEncodeName(v: string): boolean;
declare function encodeText(src: string, name: string): string;
declare function decodeText(src: string, name: string): [string, boolean];
export { ENCODE_NAMES, isEncodeName, encodeText, decodeText, };
