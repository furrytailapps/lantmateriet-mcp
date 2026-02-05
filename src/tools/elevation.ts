import { z } from 'zod';
import { lantmaterietClient } from '@/clients/lantmateriet-client';
import { withErrorHandling } from '@/lib/response';
import { wgs84ToSweref99, CRS_WGS84 } from '@/lib/coordinates';

export const elevationInputSchema = {
  latitude: z.number().describe('Latitude (WGS84). Stockholm ~59.33, Gothenburg ~57.71, Malmo ~55.61'),
  longitude: z.number().describe('Longitude (WGS84). Stockholm ~18.07, Gothenburg ~11.97, Malmo ~13.00'),
};

export const elevationTool = {
  name: 'lm_elevation',
  description:
    'Get terrain elevation (height above sea level) at a specific coordinate in Sweden. ' +
    'Returns height in meters using RH 2000 reference system. ' +
    'Coordinates in WGS84 (latitude/longitude). ' +
    'Requires Lantmäteriet API credentials for authenticated access.',
  inputSchema: elevationInputSchema,
};

type ElevationInput = {
  latitude: number;
  longitude: number;
};

export const elevationHandler = withErrorHandling(async (args: ElevationInput) => {
  // Convert WGS84 to SWEREF99TM for upstream API
  const sweref99Point = wgs84ToSweref99({ latitude: args.latitude, longitude: args.longitude });

  const result = await lantmaterietClient.getElevation(sweref99Point);

  return {
    elevation_meters: result.elevation,
    reference_system: result.referenceSystem,
    coordinate_system: CRS_WGS84,
    coordinate: {
      latitude: args.latitude,
      longitude: args.longitude,
    },
  };
});
