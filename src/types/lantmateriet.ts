/**
 * Types for Lantmäteriet API responses
 */

/**
 * Property (Fastighet) information
 */
export interface PropertyInfo {
  objektidentitet: string;
  beteckning: string; // Property designation e.g. "STOCKHOLM VASASTADEN 1:1"
  kommun: string;
  lan: string;
  area?: number; // Area in square meters
  geometry?: GeoJsonGeometry;
}

/**
 * Property search result
 */
export interface PropertySearchResult {
  properties: PropertyInfo[];
  totalCount: number;
}

/**
 * Elevation point result
 */
export interface ElevationResult {
  elevation: number; // Height in meters (RH 2000)
  referenceSystem: string;
  coordinate: {
    x: number;
    y: number;
    crs: string;
  };
}

/**
 * Map URL result
 */
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

/**
 * HVD Dataset description
 */
export interface HvdDataset {
  name: string;
  nameSwedish: string;
  description: string;
  access: 'open' | 'authenticated';
  license: string;
  formats: string[];
  apiType: string;
}

/**
 * GeoJSON geometry (simplified)
 */
export interface GeoJsonGeometry {
  type: 'Point' | 'Polygon' | 'MultiPolygon' | 'LineString';
  coordinates: number[] | number[][] | number[][][] | number[][][][];
}

/**
 * Address search result
 */
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

/**
 * Lantmäteriet API error response
 */
export interface LantmaterietApiError {
  error: string;
  error_description?: string;
  status?: number;
}
