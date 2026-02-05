import { z } from 'zod';
import { lantmaterietClient } from '@/clients/lantmateriet-client';
import { withErrorHandling } from '@/lib/response';
import { wgs84ToSweref99, wgs84BboxToSweref99, validateBbox, CRS_WGS84 } from '@/lib/coordinates';
import { ValidationError } from '@/lib/errors';

/**
 * Map types available
 */
const MAP_TYPES = ['topographic', 'orthophoto', 'property'] as const;
type MapType = (typeof MAP_TYPES)[number];

export const mapUrlInputSchema = {
  mapType: z
    .enum(MAP_TYPES)
    .describe(
      'Map type: "topographic" (terrain with roads/labels), "orthophoto" (aerial imagery), "property" (property boundaries)',
    ),
  // Center point for topographic/orthophoto (WGS84)
  latitude: z.number().optional().describe('Center latitude (WGS84). Stockholm ~59.33. For topographic/orthophoto maps'),
  longitude: z.number().optional().describe('Center longitude (WGS84). Stockholm ~18.07. For topographic/orthophoto maps'),
  // Bounding box for property maps (WGS84)
  minLat: z.number().optional().describe('Bbox minimum latitude (WGS84). For property maps'),
  minLon: z.number().optional().describe('Bbox minimum longitude (WGS84). For property maps'),
  maxLat: z.number().optional().describe('Bbox maximum latitude (WGS84). For property maps'),
  maxLon: z.number().optional().describe('Bbox maximum longitude (WGS84). For property maps'),
  // Size options
  width: z
    .number()
    .optional()
    .default(1000)
    .describe('Width in meters (topographic/orthophoto) or pixels (property). Default 1000'),
  height: z
    .number()
    .optional()
    .default(1000)
    .describe('Height in meters (topographic/orthophoto) or pixels (property). Default 1000'),
};

export const mapUrlTool = {
  name: 'lm_map_url',
  description:
    'Generate map URLs for Swedish geodata. ' +
    'Topographic and orthophoto maps use open CC-BY WMTS (no auth). ' +
    'Property boundaries use WMS. ' +
    'For topographic/orthophoto: provide center point (latitude, longitude) and dimensions. ' +
    'For property: provide bounding box (minLat, minLon, maxLat, maxLon). ' +
    'All coordinates in WGS84.',
  inputSchema: mapUrlInputSchema,
};

type MapUrlInput = {
  mapType: MapType;
  latitude?: number;
  longitude?: number;
  minLat?: number;
  minLon?: number;
  maxLat?: number;
  maxLon?: number;
  width?: number;
  height?: number;
};

export const mapUrlHandler = withErrorHandling(async (args: MapUrlInput) => {
  const { mapType, width = 1000, height = 1000 } = args;

  switch (mapType) {
    case 'topographic': {
      if (args.latitude === undefined || args.longitude === undefined) {
        throw new ValidationError('For topographic map, provide center point as latitude and longitude (WGS84)', 'coordinates');
      }

      const sweref99Point = wgs84ToSweref99({ latitude: args.latitude, longitude: args.longitude });
      const result = lantmaterietClient.getTopographicMapUrl(sweref99Point, { width, height });

      return {
        map_type: 'topographic',
        url: result.url,
        url_template_note: 'WMTS URL template - replace {z}/{y}/{x} with tile coordinates',
        layers: result.layers,
        crs: result.crs,
        center: { latitude: args.latitude, longitude: args.longitude },
        bbox: result.bbox,
        license: 'CC-BY 4.0 Lantmäteriet',
        auth_required: false,
      };
    }

    case 'orthophoto': {
      if (args.latitude === undefined || args.longitude === undefined) {
        throw new ValidationError('For orthophoto map, provide center point as latitude and longitude (WGS84)', 'coordinates');
      }

      const sweref99Point = wgs84ToSweref99({ latitude: args.latitude, longitude: args.longitude });
      const result = lantmaterietClient.getOrthophotoMapUrl(sweref99Point, { width, height });

      return {
        map_type: 'orthophoto',
        url: result.url,
        url_template_note: 'WMTS URL template - replace {z}/{y}/{x} with tile coordinates',
        layers: result.layers,
        crs: result.crs,
        center: { latitude: args.latitude, longitude: args.longitude },
        bbox: result.bbox,
        license: 'CC-BY 4.0 Lantmäteriet',
        auth_required: false,
      };
    }

    case 'property': {
      if (args.minLat === undefined || args.minLon === undefined || args.maxLat === undefined || args.maxLon === undefined) {
        throw new ValidationError('For property map, provide bounding box as minLat, minLon, maxLat, maxLon (WGS84)', 'bbox');
      }

      const sweref99Bbox = wgs84BboxToSweref99({
        minLat: args.minLat,
        minLon: args.minLon,
        maxLat: args.maxLat,
        maxLon: args.maxLon,
      });

      validateBbox(sweref99Bbox);

      const result = lantmaterietClient.getPropertyMapUrl(sweref99Bbox, {
        width: Math.min(width, 2048), // Limit max size
        height: Math.min(height, 2048),
      });

      return {
        map_type: 'property',
        url: result.url,
        layers: result.layers,
        crs: result.crs,
        input_bbox: { minLat: args.minLat, minLon: args.minLon, maxLat: args.maxLat, maxLon: args.maxLon },
        internal_bbox: result.bbox,
        image_size: { width: Math.min(width, 2048), height: Math.min(height, 2048) },
        format: 'image/png',
        auth_required: false,
      };
    }

    default:
      throw new ValidationError(`Unknown map type: ${mapType}`, 'mapType');
  }
});
