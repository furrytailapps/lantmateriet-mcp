import { z } from 'zod';
import { lantmaterietClient } from '@/clients/lantmateriet-client';
import { withErrorHandling } from '@/lib/response';
import { normalizeToSweref99, CRS_SWEREF99TM, CRS_WGS84 } from '@/lib/coordinates';
import { ValidationError } from '@/lib/errors';

export const elevationInputSchema = {
  x: z.number().optional().describe('Easting in SWEREF99TM (EPSG:3006). Stockholm ~674000'),
  y: z.number().optional().describe('Northing in SWEREF99TM (EPSG:3006). Stockholm ~6580000'),
  latitude: z.number().optional().describe('WGS84 latitude (auto-converts to SWEREF99). Stockholm ~59.33'),
  longitude: z.number().optional().describe('WGS84 longitude (auto-converts to SWEREF99). Stockholm ~18.07'),
};

export const elevationTool = {
  name: 'lm_elevation',
  description:
    'Get terrain elevation (height above sea level) at a specific coordinate in Sweden. ' +
    'Returns height in meters using RH 2000 reference system. ' +
    'Accepts both SWEREF99TM (x,y) or WGS84 (lat,lon) coordinates. ' +
    'Requires Lantmäteriet API credentials for authenticated access.',
  inputSchema: elevationInputSchema,
};

type ElevationInput = {
  x?: number;
  y?: number;
  latitude?: number;
  longitude?: number;
};

export const elevationHandler = withErrorHandling(async (args: ElevationInput) => {
  // Validate that we have coordinates
  if ((args.x === undefined || args.y === undefined) && (args.latitude === undefined || args.longitude === undefined)) {
    throw new ValidationError('Provide either (x, y) SWEREF99TM or (latitude, longitude) WGS84 coordinates', 'coordinates');
  }

  const point = normalizeToSweref99({
    x: args.x,
    y: args.y,
    latitude: args.latitude,
    longitude: args.longitude,
  });

  const result = await lantmaterietClient.getElevation(point);

  return {
    elevation_meters: result.elevation,
    reference_system: result.referenceSystem,
    input_coordinate_system: args.x !== undefined ? CRS_SWEREF99TM : CRS_WGS84,
    coordinate: {
      sweref99tm: { x: point.x, y: point.y },
      ...(args.latitude !== undefined && {
        wgs84: { latitude: args.latitude, longitude: args.longitude },
      }),
    },
  };
});
