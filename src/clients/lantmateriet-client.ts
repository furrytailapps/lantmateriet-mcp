import { getAccessToken, hasCredentials } from '@/lib/auth';
import { UpstreamApiError, NotFoundError } from '@/lib/errors';
import type { PropertyInfo, PropertySearchResult, ElevationResult, MapUrlResult, AddressResult } from '@/types/lantmateriet';
import { Sweref99Point, BoundingBox, CRS_SWEREF99TM } from '@/lib/coordinates';

/**
 * Lantmäteriet API base URLs
 */
const API_BASE_URL = process.env.LANTMATERIET_API_URL || 'https://api.lantmateriet.se';

// Open data WMTS endpoints (CC-BY, no auth required)
const OPEN_TOPOWEBB_WMTS = 'https://api.lantmateriet.se/open/topowebb-ccby/v1/wmts/1.0.0';
const OPEN_ORTOFOTO_WMTS = 'https://api.lantmateriet.se/open/ortofoto/v1/wmts/1.0.0';

// WMS endpoints for property boundaries
const PROPERTY_WMS = 'https://api.lantmateriet.se/open/fastighet/v1/wms';

/**
 * Make authenticated request to Lantmäteriet API
 */
async function authenticatedFetch<T>(url: string, options: RequestInit = {}): Promise<T> {
  const token = await getAccessToken();

  const response = await fetch(url, {
    ...options,
    headers: {
      ...options.headers,
      Authorization: `Bearer ${token}`,
      Accept: 'application/json',
    },
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new UpstreamApiError(`Lantmäteriet API error: ${errorText}`, response.status, 'Lantmäteriet');
  }

  return response.json() as Promise<T>;
}

/**
 * Lantmäteriet API client
 */
export const lantmaterietClient = {
  /**
   * Check if authenticated APIs are available
   */
  isAuthConfigured(): boolean {
    return hasCredentials();
  },

  /**
   * Find property by coordinate
   * Uses the Fastighetsindelning API
   */
  async findPropertyByPoint(point: Sweref99Point): Promise<PropertySearchResult> {
    if (!hasCredentials()) {
      // Return mock data for open usage without credentials
      return {
        properties: [],
        totalCount: 0,
      };
    }

    const url = `${API_BASE_URL}/fastighetsindelning/v1/hitta?geometri=POINT(${point.x} ${point.y})`;

    try {
      const response = await authenticatedFetch<{
        features?: Array<{
          properties: {
            objektidentitet: string;
            beteckning: string;
            kommun?: string;
            lan?: string;
          };
          geometry?: object;
        }>;
      }>(url);

      const properties: PropertyInfo[] = (response.features || []).map((f) => ({
        objektidentitet: f.properties.objektidentitet,
        beteckning: f.properties.beteckning,
        kommun: f.properties.kommun || '',
        lan: f.properties.lan || '',
      }));

      return {
        properties,
        totalCount: properties.length,
      };
    } catch (error) {
      if (error instanceof UpstreamApiError && error.statusCode === 404) {
        return { properties: [], totalCount: 0 };
      }
      throw error;
    }
  },

  /**
   * Find property by address
   * Uses the Adress API to geocode, then looks up property
   */
  async findPropertyByAddress(address: string): Promise<PropertySearchResult> {
    if (!hasCredentials()) {
      return { properties: [], totalCount: 0 };
    }

    // First, geocode the address
    const geocodeUrl = `${API_BASE_URL}/adress/v1/sok?adress=${encodeURIComponent(address)}`;

    try {
      const addressResults = await authenticatedFetch<{
        features?: Array<{
          properties: AddressResult;
          geometry?: {
            coordinates: number[];
          };
        }>;
      }>(geocodeUrl);

      if (!addressResults.features || addressResults.features.length === 0) {
        return { properties: [], totalCount: 0 };
      }

      // Get the first address match
      const firstMatch = addressResults.features[0];
      if (!firstMatch.geometry?.coordinates) {
        return { properties: [], totalCount: 0 };
      }

      // Use the coordinate to find the property
      const [x, y] = firstMatch.geometry.coordinates;
      return this.findPropertyByPoint({ x, y });
    } catch (error) {
      if (error instanceof UpstreamApiError && error.statusCode === 404) {
        return { properties: [], totalCount: 0 };
      }
      throw error;
    }
  },

  /**
   * Find property by designation (beteckning)
   */
  async findPropertyByDesignation(designation: string): Promise<PropertyInfo | null> {
    if (!hasCredentials()) {
      return null;
    }

    const url = `${API_BASE_URL}/fastighetsindelning/v1/sok?beteckning=${encodeURIComponent(designation)}`;

    try {
      const response = await authenticatedFetch<{
        features?: Array<{
          properties: {
            objektidentitet: string;
            beteckning: string;
            kommun?: string;
            lan?: string;
            area?: number;
          };
          geometry?: object;
        }>;
      }>(url);

      if (!response.features || response.features.length === 0) {
        return null;
      }

      const f = response.features[0];
      return {
        objektidentitet: f.properties.objektidentitet,
        beteckning: f.properties.beteckning,
        kommun: f.properties.kommun || '',
        lan: f.properties.lan || '',
        area: f.properties.area,
      };
    } catch (error) {
      if (error instanceof UpstreamApiError && error.statusCode === 404) {
        return null;
      }
      throw error;
    }
  },

  /**
   * Get elevation at a point
   * Uses the Höjddata API
   */
  async getElevation(point: Sweref99Point): Promise<ElevationResult> {
    if (!hasCredentials()) {
      // For demo purposes without credentials, return a simulated elevation
      // In production, this would require authentication
      throw new NotFoundError('Elevation service', 'requires authentication');
    }

    const url = `${API_BASE_URL}/hojd/v1/punkt?nord=${point.y}&ost=${point.x}&referenssystem=3006`;

    const response = await authenticatedFetch<{
      hojd: number;
      referenssystem?: string;
    }>(url);

    return {
      elevation: response.hojd,
      referenceSystem: response.referenssystem || 'RH 2000',
      coordinate: {
        x: point.x,
        y: point.y,
        crs: CRS_SWEREF99TM,
      },
    };
  },

  /**
   * Generate topographic map WMTS URL
   * Uses open CC-BY data (no auth required)
   */
  getTopographicMapUrl(point: Sweref99Point, options: { width?: number; height?: number; zoom?: number } = {}): MapUrlResult {
    const { width = 1000, height = 1000, zoom = 10 } = options;

    // Build WMTS GetTile URL template
    // Clients can use this with their preferred tiling scheme
    const url = `${OPEN_TOPOWEBB_WMTS}/topowebb/default/3006/{z}/{y}/{x}.png`;

    // Calculate approximate bbox for the given dimensions
    const halfWidth = width / 2;
    const halfHeight = height / 2;
    const bbox: BoundingBox = {
      minX: point.x - halfWidth,
      minY: point.y - halfHeight,
      maxX: point.x + halfWidth,
      maxY: point.y + halfHeight,
    };

    return {
      url,
      layers: ['topowebb'],
      crs: CRS_SWEREF99TM,
      bbox,
    };
  },

  /**
   * Generate orthophoto (aerial imagery) WMTS URL
   * Uses open CC-BY data (no auth required)
   */
  getOrthophotoMapUrl(point: Sweref99Point, options: { width?: number; height?: number } = {}): MapUrlResult {
    const { width = 1000, height = 1000 } = options;

    const url = `${OPEN_ORTOFOTO_WMTS}/orto/default/3006/{z}/{y}/{x}.png`;

    const halfWidth = width / 2;
    const halfHeight = height / 2;
    const bbox: BoundingBox = {
      minX: point.x - halfWidth,
      minY: point.y - halfHeight,
      maxX: point.x + halfWidth,
      maxY: point.y + halfHeight,
    };

    return {
      url,
      layers: ['orto'],
      crs: CRS_SWEREF99TM,
      bbox,
    };
  },

  /**
   * Generate property boundaries WMS URL
   */
  getPropertyMapUrl(
    bbox: BoundingBox,
    options: { width?: number; height?: number; format?: 'png' | 'jpeg' } = {},
  ): MapUrlResult {
    const { width = 800, height = 600, format = 'png' } = options;

    const params = new URLSearchParams({
      SERVICE: 'WMS',
      VERSION: '1.3.0',
      REQUEST: 'GetMap',
      LAYERS: 'Fastighetsindelning',
      CRS: CRS_SWEREF99TM,
      BBOX: `${bbox.minY},${bbox.minX},${bbox.maxY},${bbox.maxX}`, // WMS 1.3.0 axis order
      WIDTH: width.toString(),
      HEIGHT: height.toString(),
      FORMAT: format === 'jpeg' ? 'image/jpeg' : 'image/png',
      TRANSPARENT: 'true',
    });

    return {
      url: `${PROPERTY_WMS}?${params.toString()}`,
      layers: ['Fastighetsindelning'],
      crs: CRS_SWEREF99TM,
      bbox,
    };
  },
};
