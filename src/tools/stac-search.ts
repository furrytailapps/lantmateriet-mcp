import { z } from 'zod';
import { withErrorHandling } from '@/lib/response';
import { ValidationError } from '@/lib/errors';
import { lantmaterietClient } from '@/clients/lantmateriet-client';
import { wgs84ToSweref99, wgs84BboxToSweref99, sweref99BboxToWgs84, validateBbox, type BoundingBox, CRS_WGS84 } from '@/lib/coordinates';

/**
 * Input schema for STAC search tool
 * Supports either bounding box OR center point + radius (all WGS84)
 */
export const stacSearchInputSchema = {
  // Option 1: Bounding box (WGS84)
  minLat: z.number().optional().describe('Min latitude (WGS84). e.g., 59.30'),
  minLon: z.number().optional().describe('Min longitude (WGS84). e.g., 18.00'),
  maxLat: z.number().optional().describe('Max latitude (WGS84). e.g., 59.35'),
  maxLon: z.number().optional().describe('Max longitude (WGS84). e.g., 18.10'),

  // Option 2: Center point + radius (WGS84)
  latitude: z.number().optional().describe('Center latitude (WGS84). e.g., 59.33'),
  longitude: z.number().optional().describe('Center longitude (WGS84). e.g., 18.07'),
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
    'Specify either a bounding box (minLat/minLon/maxLat/maxLon) or center point + radius (latitude/longitude + radius). ' +
    'All coordinates in WGS84. Example: latitude: 59.33, longitude: 18.07, radius: 500 for Stockholm area.',
  inputSchema: stacSearchInputSchema,
};

type StacSearchInput = {
  minLat?: number;
  minLon?: number;
  maxLat?: number;
  maxLon?: number;
  latitude?: number;
  longitude?: number;
  radius?: number;
  collection?: 'ortofoto' | 'hojd';
  maxResults?: number;
};

/**
 * Build bounding box from WGS84 input parameters, convert to SWEREF99TM
 */
function buildBbox(input: StacSearchInput): BoundingBox {
  // Option 1: Explicit bounding box (WGS84)
  if (input.minLat !== undefined && input.minLon !== undefined && input.maxLat !== undefined && input.maxLon !== undefined) {
    const bbox = wgs84BboxToSweref99({
      minLat: input.minLat,
      minLon: input.minLon,
      maxLat: input.maxLat,
      maxLon: input.maxLon,
    });
    validateBbox(bbox);
    return bbox;
  }

  // Option 2: Center point + radius (WGS84)
  if (input.latitude !== undefined && input.longitude !== undefined) {
    const center = wgs84ToSweref99({ latitude: input.latitude, longitude: input.longitude });
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
    'Either bounding box (minLat/minLon/maxLat/maxLon) or center point (latitude/longitude) is required. All coordinates in WGS84.',
    'search_area',
  );
}

export const stacSearchHandler = withErrorHandling(async (args: StacSearchInput) => {
  const bbox = buildBbox(args);
  const collection = args.collection || 'ortofoto';
  const maxResults = args.maxResults || 10;

  const items = await lantmaterietClient.searchStac(bbox, collection, maxResults);

  // Convert internal SWEREF99TM bbox to WGS84 for agent consumption
  const wgs84Bbox = sweref99BboxToWgs84(bbox);

  return {
    collection,
    coordinate_system: CRS_WGS84,
    searchArea: {
      minLat: wgs84Bbox.minLat,
      minLon: wgs84Bbox.minLon,
      maxLat: wgs84Bbox.maxLat,
      maxLon: wgs84Bbox.maxLon,
    },
    resultCount: items.length,
    items,
    notes: {
      format: 'COG (Cloud Optimized GeoTIFF) with Deflate compression',
      download_crs: 'SWEREF99 TM (EPSG:3006) - downloaded files use this CRS',
      license: 'CC-BY 4.0 - attribution required',
      nirBands:
        collection === 'ortofoto' ? 'Orthophotos may include NIR (near-infrared) band for vegetation analysis' : undefined,
      authentication: 'Download URLs require free Geotorget account authentication',
    },
  };
});
