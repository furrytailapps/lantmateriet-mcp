import { z } from 'zod';
import { lantmaterietClient } from '@/clients/lantmateriet-client';
import { withErrorHandling } from '@/lib/response';
import { normalizeToSweref99, validateBbox, CRS_SWEREF99TM, CRS_WGS84 } from '@/lib/coordinates';
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
  // Center point for topographic/orthophoto
  x: z.number().optional().describe('Center easting in SWEREF99TM. For topographic/orthophoto maps'),
  y: z.number().optional().describe('Center northing in SWEREF99TM. For topographic/orthophoto maps'),
  latitude: z.number().optional().describe('Center latitude in WGS84. For topographic/orthophoto maps'),
  longitude: z.number().optional().describe('Center longitude in WGS84. For topographic/orthophoto maps'),
  // Bounding box for property maps
  minX: z.number().optional().describe('Bbox minimum easting. For property maps'),
  minY: z.number().optional().describe('Bbox minimum northing. For property maps'),
  maxX: z.number().optional().describe('Bbox maximum easting. For property maps'),
  maxY: z.number().optional().describe('Bbox maximum northing. For property maps'),
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
    'For topographic/orthophoto: provide center point and dimensions. ' +
    'For property: provide bounding box.',
  inputSchema: mapUrlInputSchema,
};

type MapUrlInput = {
  mapType: MapType;
  x?: number;
  y?: number;
  latitude?: number;
  longitude?: number;
  minX?: number;
  minY?: number;
  maxX?: number;
  maxY?: number;
  width?: number;
  height?: number;
};

export const mapUrlHandler = withErrorHandling(async (args: MapUrlInput) => {
  const { mapType, width = 1000, height = 1000 } = args;

  switch (mapType) {
    case 'topographic': {
      if ((args.x === undefined || args.y === undefined) && (args.latitude === undefined || args.longitude === undefined)) {
        throw new ValidationError(
          'For topographic map, provide center point as (x, y) or (latitude, longitude)',
          'coordinates',
        );
      }

      const point = normalizeToSweref99({
        x: args.x,
        y: args.y,
        latitude: args.latitude,
        longitude: args.longitude,
      });

      const result = lantmaterietClient.getTopographicMapUrl(point, { width, height });

      return {
        map_type: 'topographic',
        url: result.url,
        url_template_note: 'WMTS URL template - replace {z}/{y}/{x} with tile coordinates',
        layers: result.layers,
        crs: result.crs,
        center: { x: point.x, y: point.y },
        bbox: result.bbox,
        license: 'CC-BY 4.0 Lantmäteriet',
        auth_required: false,
      };
    }

    case 'orthophoto': {
      if ((args.x === undefined || args.y === undefined) && (args.latitude === undefined || args.longitude === undefined)) {
        throw new ValidationError('For orthophoto map, provide center point as (x, y) or (latitude, longitude)', 'coordinates');
      }

      const point = normalizeToSweref99({
        x: args.x,
        y: args.y,
        latitude: args.latitude,
        longitude: args.longitude,
      });

      const result = lantmaterietClient.getOrthophotoMapUrl(point, { width, height });

      return {
        map_type: 'orthophoto',
        url: result.url,
        url_template_note: 'WMTS URL template - replace {z}/{y}/{x} with tile coordinates',
        layers: result.layers,
        crs: result.crs,
        center: { x: point.x, y: point.y },
        bbox: result.bbox,
        license: 'CC-BY 4.0 Lantmäteriet',
        auth_required: false,
      };
    }

    case 'property': {
      if (args.minX === undefined || args.minY === undefined || args.maxX === undefined || args.maxY === undefined) {
        throw new ValidationError('For property map, provide bounding box as minX, minY, maxX, maxY in SWEREF99TM', 'bbox');
      }

      const bbox = {
        minX: args.minX,
        minY: args.minY,
        maxX: args.maxX,
        maxY: args.maxY,
      };

      validateBbox(bbox);

      const result = lantmaterietClient.getPropertyMapUrl(bbox, {
        width: Math.min(width, 2048), // Limit max size
        height: Math.min(height, 2048),
      });

      return {
        map_type: 'property',
        url: result.url,
        layers: result.layers,
        crs: result.crs,
        bbox: result.bbox,
        image_size: { width: Math.min(width, 2048), height: Math.min(height, 2048) },
        format: 'image/png',
        auth_required: false,
      };
    }

    default:
      throw new ValidationError(`Unknown map type: ${mapType}`, 'mapType');
  }
});
