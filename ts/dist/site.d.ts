import type { Val } from './type';
type SiteSpec = {
    row?: number;
    col?: number;
    url?: string;
    len?: number;
    src?: string;
};
type ViaSite = {
    row: number;
    col: number;
    url: string;
    src: string;
    name: string;
};
declare class Site {
    row: number;
    col: number;
    url: string;
    len: number;
    src: string;
    via?: ViaSite;
    constructor(val?: Val | SiteSpec);
}
export { Site, };
export type { ViaSite, };
