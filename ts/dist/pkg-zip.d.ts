export type ZipEntry = {
    path: string;
    data: Uint8Array;
};
export declare function cmpBytes(a: string, b: string): number;
export declare function sha256Hex(data: Uint8Array): string;
export declare function zipCanonical(entries: ZipEntry[]): Uint8Array;
export declare function unzipCanonical(zip: Uint8Array): ZipEntry[];
