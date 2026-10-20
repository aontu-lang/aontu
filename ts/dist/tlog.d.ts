import type { Hash, Tile } from '@aontu/mod';
export declare const TLOG_HASH_SIZE = 32;
export type TlogTile = Tile;
export declare function tlogFormatHash(h: Hash): string;
export declare function tlogRecordHash(data: Uint8Array): string;
export declare function tlogNodeHash(left: string, right: string): string;
export declare function tlogStoredHashIndex(level: number, n: number): number;
export declare function tlogStoredHashCount(n: number): number;
export declare function tlogTreeHash(n: number, read: (indexes: number[]) => string[]): string;
export declare function tlogCheckRecord(p: string[], t: number, th: string, n: number, h: string): boolean;
export declare function tlogCheckTree(p: string[], t: number, th: string, n: number, h: string): boolean;
export declare function tlogTileForIndex(h: number, index: number): TlogTile;
export declare function tlogHashFromTile(t: TlogTile, data: Uint8Array, index: number): string;
export declare function tlogNewTiles(h: number, oldTreeSize: number, newTreeSize: number): TlogTile[];
export declare function tlogOpenNote(msg: string, verifierKeys: string[]): {
    text: string;
    signedBy: string[];
};
export declare function tlogParseTree(text: string, origin: string): {
    n: number;
    hash: string;
};
