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
type LoadSite = {
    row: number;
    col: number;
    url?: string;
};
declare class Site {
    row: number;
    col: number;
    url: string;
    len: number;
    src: string;
    via?: ViaSite;
    load?: LoadSite;
    constructor(val?: Val | SiteSpec);
}
export { Site, };
export type { LoadSite, ViaSite, };
