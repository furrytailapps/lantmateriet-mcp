import { getAccessToken, hasCredentials } from '@/lib/auth';
import { UpstreamApiError, NotFoundError, ConfigurationError } from '@/lib/errors';
import type {
  PropertyInfo,
  PropertySearchResult,
  ElevationResult,
  MapUrlResult,
  AddressResult,
  StacSearchResponse,
  StacSearchResultItem,
} from '@/types/lantmateriet';
import { Sweref99Point, BoundingBox, CRS_SWEREF99TM } from '@/lib/coordinates';

const API_BASE_URL = process.env.LANTMATERIET_API_URL || 'https://api.lantmateriet.se';

// Open data WMTS endpoints (CC-BY, no auth required)
const OPEN_TOPOWEBB_WMTS = 'https://api.lantmateriet.se/open/topowebb-ccby/v1/wmts/1.0.0';
const OPEN_ORTOFOTO_WMTS = 'https://api.lantmateriet.se/open/ortofoto/v1/wmts/1.0.0';

// WMS endpoints for property boundaries
const PROPERTY_WMS = 'https://api.lantmateriet.se/open/fastighet/v1/wms';

// STAC API endpoints (free, CC-BY 4.0)
const STAC_ORTO_URL = 'https://api.lantmateriet.se/stac-orto/v1';
const STAC_HOJD_URL = 'https://api.lantmateriet.se/stac-hojd/v1';

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
    const msg =
      response.status >= 500
        ? `The data service returned an error (HTTP ${response.status}). This is usually temporary — try again.`
        : response.status === 401 || response.status === 403
          ? 'Authentication with the data service failed. This may be a temporary issue — try again.'
          : `The data service rejected the request (HTTP ${response.status}). The query parameters may be invalid.`;
    throw new UpstreamApiError(msg, response.status, 'Lantmäteriet');
  }

  return response.json() as Promise<T>;
}

export const lantmaterietClient = {
  isAuthConfigured(): boolean {
    return hasCredentials();
  },

  async findPropertyByPoint(point: Sweref99Point): Promise<PropertySearchResult> {
    if (!hasCredentials()) {
      throw new ConfigurationError(
        'Lantmäteriet API credentials required. Set LANTMATERIET_CONSUMER_KEY and ' +
          'LANTMATERIET_CONSUMER_SECRET environment variables. Register at https://geotorget.lantmateriet.se/',
        'LANTMATERIET_CONSUMER_KEY, LANTMATERIET_CONSUMER_SECRET',
      );
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

  // Geocodes via Adress API, then looks up property by resulting coordinate
  async findPropertyByAddress(address: string): Promise<PropertySearchResult> {
    if (!hasCredentials()) {
      throw new ConfigurationError(
        'Lantmäteriet API credentials required. Set LANTMATERIET_CONSUMER_KEY and ' +
          'LANTMATERIET_CONSUMER_SECRET environment variables. Register at https://geotorget.lantmateriet.se/',
        'LANTMATERIET_CONSUMER_KEY, LANTMATERIET_CONSUMER_SECRET',
      );
    }

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

      const firstMatch = addressResults.features[0];
      if (!firstMatch.geometry?.coordinates) {
        return { properties: [], totalCount: 0 };
      }

      const [x, y] = firstMatch.geometry.coordinates;
      return this.findPropertyByPoint({ x, y });
    } catch (error) {
      if (error instanceof UpstreamApiError && error.statusCode === 404) {
        return { properties: [], totalCount: 0 };
      }
      throw error;
    }
  },

  async findPropertyByDesignation(designation: string): Promise<PropertyInfo | null> {
    if (!hasCredentials()) {
      throw new ConfigurationError(
        'Lantmäteriet API credentials required. Set LANTMATERIET_CONSUMER_KEY and ' +
          'LANTMATERIET_CONSUMER_SECRET environment variables. Register at https://geotorget.lantmateriet.se/',
        'LANTMATERIET_CONSUMER_KEY, LANTMATERIET_CONSUMER_SECRET',
      );
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

  async getElevation(point: Sweref99Point): Promise<ElevationResult> {
    if (!hasCredentials()) {
      throw new ConfigurationError(
        'Lantmäteriet API credentials required. Set LANTMATERIET_CONSUMER_KEY and ' +
          'LANTMATERIET_CONSUMER_SECRET environment variables. Register at https://geotorget.lantmateriet.se/',
        'LANTMATERIET_CONSUMER_KEY, LANTMATERIET_CONSUMER_SECRET',
      );
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

  // Open CC-BY data (no auth required)
  getTopographicMapUrl(point: Sweref99Point, options: { width?: number; height?: number; zoom?: number } = {}): MapUrlResult {
    const { width = 1000, height = 1000, zoom = 10 } = options;

    // Build WMTS GetTile URL template
    // Clients can use this with their preferred tiling scheme
    const url = `${OPEN_TOPOWEBB_WMTS}/topowebb/default/3006/{z}/{y}/{x}.png`;

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

  // Open CC-BY data (no auth required)
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

  async searchStac(
    bbox: BoundingBox,
    collection: 'ortofoto' | 'hojd',
    maxResults: number = 10,
  ): Promise<StacSearchResultItem[]> {
    const stacUrl = collection === 'ortofoto' ? STAC_ORTO_URL : STAC_HOJD_URL;

    // STAC API expects bbox in [minX, minY, maxX, maxY] order (SWEREF99TM)
    const bboxArray = [bbox.minX, bbox.minY, bbox.maxX, bbox.maxY];

    const searchBody = {
      bbox: bboxArray,
      limit: maxResults,
    };

    // STAC API may require authentication for some endpoints
    let response: Response;
    if (hasCredentials()) {
      const token = await getAccessToken();
      response = await fetch(`${stacUrl}/search`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
          'Accept': 'application/geo+json',
        },
        body: JSON.stringify(searchBody),
      });
    } else {
      // Try without auth for open STAC endpoints
      response = await fetch(`${stacUrl}/search`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/geo+json',
        },
        body: JSON.stringify(searchBody),
      });
    }

    if (!response.ok) {
      const msg =
        response.status >= 500
          ? `The data service returned an error (HTTP ${response.status}). This is usually temporary — try again.`
          : `The data service rejected the request (HTTP ${response.status}). The query parameters may be invalid.`;
      throw new UpstreamApiError(msg, response.status, 'Lantmäteriet STAC');
    }

    const data = (await response.json()) as StacSearchResponse;

    return data.features.map((item) => {
      const bands = item.properties['eo:bands']?.map((b) => b.common_name || b.name) || [];

      const dataAsset = item.assets['data'] || item.assets['visual'] || Object.values(item.assets)[0];
      const downloadUrl = dataAsset?.href;

      const thumbnailAsset = item.assets['thumbnail'] || item.assets['preview'];
      const thumbnailUrl = thumbnailAsset?.href;

      return {
        id: item.id,
        datetime: item.properties.datetime,
        bbox: item.bbox,
        resolution: item.properties.resolution,
        bands: bands.length > 0 ? bands : undefined,
        downloadUrl,
        thumbnailUrl,
      };
    });
  },
};
