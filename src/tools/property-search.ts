import { z } from 'zod';
import { lantmaterietClient } from '@/clients/lantmateriet-client';
import { withErrorHandling } from '@/lib/response';
import { normalizeToSweref99, CRS_SWEREF99TM, CRS_WGS84 } from '@/lib/coordinates';
import { ValidationError } from '@/lib/errors';

/**
 * Query types for property search
 */
const QUERY_TYPES = ['coordinate', 'address', 'designation'] as const;
type QueryType = (typeof QUERY_TYPES)[number];

export const propertySearchInputSchema = {
  queryType: z
    .enum(QUERY_TYPES)
    .describe(
      'Search method: "coordinate" (find by location), "address" (find by street address), "designation" (find by property name like "STOCKHOLM VASASTADEN 1:1")',
    ),
  // For coordinate queries
  x: z.number().optional().describe('Easting in SWEREF99TM (EPSG:3006). Stockholm ~674000. Use with queryType="coordinate"'),
  y: z.number().optional().describe('Northing in SWEREF99TM (EPSG:3006). Stockholm ~6580000. Use with queryType="coordinate"'),
  latitude: z
    .number()
    .optional()
    .describe('WGS84 latitude (auto-converts to SWEREF99). Stockholm ~59.33. Use with queryType="coordinate"'),
  longitude: z
    .number()
    .optional()
    .describe('WGS84 longitude (auto-converts to SWEREF99). Stockholm ~18.07. Use with queryType="coordinate"'),
  // For address queries
  address: z
    .string()
    .optional()
    .describe('Street address to search, e.g. "Drottninggatan 1, Stockholm". Use with queryType="address"'),
  // For designation queries
  designation: z
    .string()
    .optional()
    .describe('Property designation, e.g. "STOCKHOLM VASASTADEN 1:1". Use with queryType="designation"'),
};

export const propertySearchTool = {
  name: 'lm_property_search',
  description:
    'Find Swedish properties by coordinate, address, or official designation. ' +
    'Returns property boundaries, designation, municipality, and county. ' +
    'For coordinate queries, accepts both SWEREF99TM (x,y) or WGS84 (lat,lon). ' +
    'Requires Lantmäteriet API credentials for authenticated access.',
  inputSchema: propertySearchInputSchema,
};

type PropertySearchInput = {
  queryType: QueryType;
  x?: number;
  y?: number;
  latitude?: number;
  longitude?: number;
  address?: string;
  designation?: string;
};

export const propertySearchHandler = withErrorHandling(async (args: PropertySearchInput) => {
  const { queryType } = args;

  switch (queryType) {
    case 'coordinate': {
      // Validate that we have coordinates
      if ((args.x === undefined || args.y === undefined) && (args.latitude === undefined || args.longitude === undefined)) {
        throw new ValidationError(
          'For coordinate query, provide either (x, y) SWEREF99TM or (latitude, longitude) WGS84 coordinates',
          'coordinates',
        );
      }

      const point = normalizeToSweref99({
        x: args.x,
        y: args.y,
        latitude: args.latitude,
        longitude: args.longitude,
      });

      const result = await lantmaterietClient.findPropertyByPoint(point);

      return {
        query_type: 'coordinate',
        input_coordinate_system: args.x !== undefined ? CRS_SWEREF99TM : CRS_WGS84,
        search_coordinate: {
          sweref99tm: point,
          ...(args.latitude !== undefined && {
            wgs84: { latitude: args.latitude, longitude: args.longitude },
          }),
        },
        result,
        note:
          result.totalCount === 0 ? 'No property found at this location. Check if coordinates are within Sweden.' : undefined,
      };
    }

    case 'address': {
      if (!args.address) {
        throw new ValidationError('Address is required for address query', 'address');
      }

      const result = await lantmaterietClient.findPropertyByAddress(args.address);

      return {
        query_type: 'address',
        search_address: args.address,
        result,
        note: result.totalCount === 0 ? 'No property found for this address. Try a more specific address.' : undefined,
      };
    }

    case 'designation': {
      if (!args.designation) {
        throw new ValidationError('Designation is required for designation query', 'designation');
      }

      const property = await lantmaterietClient.findPropertyByDesignation(args.designation);

      return {
        query_type: 'designation',
        search_designation: args.designation,
        found: property !== null,
        property,
        note:
          property === null
            ? 'No property found with this designation. Format should be "KOMMUN TRAKT BLOCK:ENHET".'
            : undefined,
      };
    }

    default:
      throw new ValidationError(`Unknown query type: ${queryType}`, 'queryType');
  }
});
