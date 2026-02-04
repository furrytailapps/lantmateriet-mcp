import { z } from 'zod';
import { withErrorHandling } from '@/lib/response';
import { lantmaterietClient } from '@/clients/lantmateriet-client';
import type { HvdDataset } from '@/types/lantmateriet';

/**
 * Categories for dataset filtering
 */
const CATEGORIES = ['hvd', 'property', 'elevation', 'imagery', 'all'] as const;
type Category = (typeof CATEGORIES)[number];

/**
 * High Value Dataset descriptions
 */
const HVD_DATASETS: HvdDataset[] = [
  {
    name: 'Fastighetsindelning',
    nameSwedish: 'Fastighetsindelning',
    description: 'Property boundaries and designations for all real estate in Sweden',
    access: 'authenticated',
    license: 'CC0 (public domain)',
    formats: ['GeoJSON', 'WFS', 'WMS'],
    apiType: 'OGC API Features',
  },
  {
    name: 'Byggnad',
    nameSwedish: 'Byggnad',
    description: 'Building footprints with attributes like type, height, and construction year',
    access: 'authenticated',
    license: 'CC0 (public domain)',
    formats: ['GeoJSON', 'WFS'],
    apiType: 'OGC API Features',
  },
  {
    name: 'Höjddata',
    nameSwedish: 'Höjddata',
    description: 'Digital elevation model (DEM) for Sweden. Point elevation queries and raster coverage.',
    access: 'authenticated',
    license: 'CC0 (public domain)',
    formats: ['JSON', 'GeoTIFF'],
    apiType: 'REST API / WCS',
  },
  {
    name: 'Ortofoto',
    nameSwedish: 'Ortofoto',
    description: 'Aerial imagery/orthophotos covering all of Sweden',
    access: 'open',
    license: 'CC-BY 4.0',
    formats: ['PNG', 'JPEG', 'WMTS'],
    apiType: 'WMTS',
  },
  {
    name: 'Ortnamn',
    nameSwedish: 'Ortnamn',
    description: 'Place names database with geographic locations',
    access: 'authenticated',
    license: 'CC0 (public domain)',
    formats: ['GeoJSON', 'WFS'],
    apiType: 'OGC API Features',
  },
  {
    name: 'Adress',
    nameSwedish: 'Adress',
    description: 'Swedish address register with geocoding',
    access: 'authenticated',
    license: 'CC0 (public domain)',
    formats: ['JSON', 'GeoJSON'],
    apiType: 'REST API',
  },
  {
    name: 'Marktäcke',
    nameSwedish: 'Marktäcke',
    description: 'Land cover classification (forest, water, urban, agricultural, etc.)',
    access: 'authenticated',
    license: 'CC0 (public domain)',
    formats: ['GeoJSON', 'GeoTIFF'],
    apiType: 'OGC API Features / WCS',
  },
  {
    name: 'Hydrografi',
    nameSwedish: 'Hydrografi',
    description: 'Water features: lakes, rivers, streams, coastline',
    access: 'authenticated',
    license: 'CC0 (public domain)',
    formats: ['GeoJSON', 'WFS'],
    apiType: 'OGC API Features',
  },
  {
    name: 'Administrativ indelning',
    nameSwedish: 'Administrativ indelning',
    description: 'Administrative boundaries: municipalities, counties, electoral districts',
    access: 'authenticated',
    license: 'CC0 (public domain)',
    formats: ['GeoJSON', 'WFS'],
    apiType: 'OGC API Features',
  },
  {
    name: 'Topowebb',
    nameSwedish: 'Topowebb',
    description: 'Pre-rendered topographic map tiles covering Sweden',
    access: 'open',
    license: 'CC-BY 4.0',
    formats: ['PNG', 'WMTS'],
    apiType: 'WMTS',
  },
];

export const describeInputSchema = {
  category: z
    .enum(CATEGORIES)
    .optional()
    .default('all')
    .describe(
      'Filter by category: "hvd" (all HVD datasets), "property" (property-related), "elevation" (height data), "imagery" (maps/photos), "all" (everything)',
    ),
};

export const describeTool = {
  name: 'lm_describe',
  description:
    'List available Lantmäteriet geodata datasets with descriptions, access requirements, and formats. ' +
    'Shows the 9 High Value Datasets (HVD) that became free in February 2025. ' +
    'Use to understand what data is available before querying.',
  inputSchema: describeInputSchema,
};

type DescribeInput = {
  category?: Category;
};

/**
 * Filter datasets by category
 */
function filterDatasets(category: Category): HvdDataset[] {
  switch (category) {
    case 'property':
      return HVD_DATASETS.filter((d) => ['Fastighetsindelning', 'Byggnad', 'Adress'].includes(d.name));
    case 'elevation':
      return HVD_DATASETS.filter((d) => d.name === 'Höjddata');
    case 'imagery':
      return HVD_DATASETS.filter((d) => ['Ortofoto', 'Topowebb'].includes(d.name));
    case 'hvd':
    case 'all':
    default:
      return HVD_DATASETS;
  }
}

export const describeHandler = withErrorHandling(async (args: DescribeInput) => {
  const category = args.category || 'all';
  const datasets = filterDatasets(category);
  const isAuthConfigured = lantmaterietClient.isAuthConfigured();

  return {
    category,
    auth_configured: isAuthConfigured,
    auth_note: isAuthConfigured
      ? 'API credentials configured. Authenticated datasets are accessible.'
      : 'API credentials not configured. Only open datasets (CC-BY) are accessible.',
    dataset_count: datasets.length,
    datasets,
    coordinate_systems: {
      native: 'SWEREF99 TM (EPSG:3006)',
      supported_input: ['SWEREF99 TM (EPSG:3006)', 'WGS84 (EPSG:4326)'],
      note: 'All tools accept both coordinate systems and auto-convert',
    },
    tools_summary: {
      lm_property_search: 'Find properties by coordinate, address, or designation',
      lm_elevation: 'Get terrain height at a point',
      lm_map_url: 'Generate map tile URLs (topographic, orthophoto, property)',
      lm_describe: 'This tool - lists available datasets',
    },
    registration_url: 'https://geotorget.lantmateriet.se',
    hvd_info: 'High Value Datasets became free in February 2025 under PSI directive',
  };
});
