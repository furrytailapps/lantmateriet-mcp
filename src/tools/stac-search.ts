import { z } from 'zod';
import { withErrorHandling } from '@/lib/response';
import { ValidationError } from '@/lib/errors';
import { lantmaterietClient } from '@/clients/lantmateriet-client';
import { normalizeToSweref99, validateBbox, type BoundingBox } from '@/lib/coordinates';

/**
 * Input schema for STAC search tool
 * Supports either bounding box OR center point + radius
 */
export const stacSearchInputSchema = {
  // Option 1: Bounding box (SWEREF99TM)
  minX: z.number().optional().describe('Min easting SWEREF99TM (e.g., 670000)'),
  minY: z.number().optional().describe('Min northing SWEREF99TM (e.g., 6575000)'),
  maxX: z.number().optional().describe('Max easting SWEREF99TM (e.g., 680000)'),
  maxY: z.number().optional().describe('Max northing SWEREF99TM (e.g., 6585000)'),

  // Option 2: Center point + radius
  x: z.number().optional().describe('Center easting SWEREF99TM (e.g., 674000)'),
  y: z.number().optional().describe('Center northing SWEREF99TM (e.g., 6580000)'),
  latitude: z.number().optional().describe('Center latitude WGS84 (e.g., 59.33)'),
  longitude: z.number().optional().describe('Center longitude WGS84 (e.g., 18.07)'),
  radius: z.number().optional().default(500).describe('Search radius in meters (default: 500)'),

  // Filters
  collection: z
    .enum(['ortofoto', 'hojd'])
    .optional()
    .default('ortofoto')
    .describe('Collection: "ortofoto" for aerial imagery with NIR bands, "hojd" for elevation data'),
  maxResults: z.number().optional().default(10).describe('Maximum results to return (default: 10)'),
};

export const stacSearchTool = {
  name: 'lm_stac_search',
  description:
    'Search Lantmäteriet STAC catalog for downloadable orthophoto or elevation data. ' +
    'Returns COG (Cloud Optimized GeoTIFF) download URLs. Orthophotos include NIR bands for vegetation analysis. ' +
    'Specify either a bounding box (minX/minY/maxX/maxY) or center point + radius (x/y or latitude/longitude + radius). ' +
    'Example: x: 674000, y: 6580000, radius: 500 for Stockholm area.',
  inputSchema: stacSearchInputSchema,
};

type StacSearchInput = {
  minX?: number;
  minY?: number;
  maxX?: number;
  maxY?: number;
  x?: number;
  y?: number;
  latitude?: number;
  longitude?: number;
  radius?: number;
  collection?: 'ortofoto' | 'hojd';
  maxResults?: number;
};

/**
 * Build bounding box from input parameters
 */
function buildBbox(input: StacSearchInput): BoundingBox {
  // Option 1: Explicit bounding box
  if (input.minX !== undefined && input.minY !== undefined && input.maxX !== undefined && input.maxY !== undefined) {
    const bbox: BoundingBox = {
      minX: input.minX,
      minY: input.minY,
      maxX: input.maxX,
      maxY: input.maxY,
    };
    validateBbox(bbox);
    return bbox;
  }

  // Option 2: Center point + radius
  if (input.x !== undefined || input.y !== undefined || input.latitude !== undefined || input.longitude !== undefined) {
    const center = normalizeToSweref99({
      x: input.x,
      y: input.y,
      latitude: input.latitude,
      longitude: input.longitude,
    });
    const radius = input.radius || 500;

    const bbox: BoundingBox = {
      minX: center.x - radius,
      minY: center.y - radius,
      maxX: center.x + radius,
      maxY: center.y + radius,
    };
    validateBbox(bbox);
    return bbox;
  }

  throw new ValidationError(
    'Either bounding box (minX/minY/maxX/maxY) or center point (x/y or latitude/longitude) is required',
    'search_area',
  );
}

export const stacSearchHandler = withErrorHandling(async (args: StacSearchInput) => {
  const bbox = buildBbox(args);
  const collection = args.collection || 'ortofoto';
  const maxResults = args.maxResults || 10;

  const items = await lantmaterietClient.searchStac(bbox, collection, maxResults);

  return {
    collection,
    searchArea: {
      minX: bbox.minX,
      minY: bbox.minY,
      maxX: bbox.maxX,
      maxY: bbox.maxY,
      crs: 'EPSG:3006 (SWEREF99TM)',
    },
    resultCount: items.length,
    items,
    notes: {
      format: 'COG (Cloud Optimized GeoTIFF) with Deflate compression',
      crs: 'SWEREF99 TM (EPSG:3006)',
      license: 'CC-BY 4.0 - attribution required',
      nirBands:
        collection === 'ortofoto' ? 'Orthophotos may include NIR (near-infrared) band for vegetation analysis' : undefined,
      authentication: 'Download URLs require free Geotorget account authentication',
    },
  };
});
