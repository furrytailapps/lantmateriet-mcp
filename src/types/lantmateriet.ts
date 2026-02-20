export interface PropertyInfo {
  objektidentitet: string;
  beteckning: string; // Property designation e.g. "STOCKHOLM VASASTADEN 1:1"
  kommun: string;
  lan: string;
  area?: number; // Area in square meters
  geometry?: GeoJsonGeometry;
}

export interface PropertySearchResult {
  properties: PropertyInfo[];
  totalCount: number;
}

export interface ElevationResult {
  elevation: number; // Height in meters (RH 2000)
  referenceSystem: string;
  coordinate: {
    x: number;
    y: number;
    crs: string;
  };
}

export interface MapUrlResult {
  url: string;
  layers: string[];
  crs: string;
  bbox?: {
    minX: number;
    minY: number;
    maxX: number;
    maxY: number;
  };
}

export interface GeoJsonGeometry {
  type: 'Point' | 'Polygon' | 'MultiPolygon' | 'LineString';
  coordinates: number[] | number[][] | number[][][] | number[][][][];
}

export interface AddressResult {
  adress: string;
  postnummer: string;
  postort: string;
  kommun: string;
  lan: string;
  koordinat?: {
    x: number;
    y: number;
    crs: string;
  };
}

export interface LantmaterietApiError {
  error: string;
  error_description?: string;
  status?: number;
}

export interface StacAsset {
  href: string;
  type?: string;
  title?: string;
  roles?: string[];
}

export interface StacItem {
  id: string;
  type: 'Feature';
  stac_version: string;
  geometry: GeoJsonGeometry;
  bbox: number[];
  properties: {
    'datetime': string;
    'proj:epsg'?: number;
    'resolution'?: number;
    'eo:bands'?: Array<{
      name: string;
      common_name?: string;
    }>;
    [key: string]: unknown;
  };
  assets: Record<string, StacAsset>;
  links: Array<{
    rel: string;
    href: string;
    type?: string;
  }>;
}

export interface StacSearchResponse {
  type: 'FeatureCollection';
  features: StacItem[];
  numberMatched?: number;
  numberReturned?: number;
  links?: Array<{
    rel: string;
    href: string;
    type?: string;
  }>;
}

export interface StacSearchResultItem {
  id: string;
  datetime: string;
  bbox: number[];
  resolution?: number;
  bands?: string[];
  downloadUrl?: string;
  thumbnailUrl?: string;
}
