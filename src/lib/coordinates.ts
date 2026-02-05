import proj4 from 'proj4';
import { ValidationError } from './errors';

/**
 * Coordinate Reference Systems
 */
export const CRS_SWEREF99TM = 'EPSG:3006';
export const CRS_WGS84 = 'EPSG:4326';

/**
 * Define SWEREF99 TM projection for proj4
 * Official definition from Lantmäteriet
 */
proj4.defs('EPSG:3006', '+proj=utm +zone=33 +ellps=GRS80 +towgs84=0,0,0,0,0,0,0 +units=m +no_defs +type=crs');

/**
 * Point in SWEREF99TM coordinates (internal format)
 */
export interface Sweref99Point {
  x: number; // Easting
  y: number; // Northing
}

/**
 * Point in WGS84 coordinates (input format)
 */
export interface Wgs84Point {
  latitude: number;
  longitude: number;
}

/**
 * Bounding box in SWEREF99TM coordinates (internal format)
 */
export interface BoundingBox {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

/**
 * Bounding box in WGS84 coordinates (input format)
 */
export interface Wgs84Bbox {
  minLat: number;
  minLon: number;
  maxLat: number;
  maxLon: number;
}

/**
 * SWEREF99TM coordinate bounds for Sweden
 */
const SWEREF99TM_BOUNDS = {
  minX: 200000,
  maxX: 1000000,
  minY: 6100000,
  maxY: 7700000,
};

/**
 * WGS84 coordinate bounds for Sweden
 */
const WGS84_BOUNDS = {
  minLat: 55.0,
  maxLat: 69.0,
  minLon: 11.0,
  maxLon: 24.0,
};

/**
 * Check if coordinates are within valid SWEREF99TM range for Sweden
 */
export function isValidSweref99Coordinate(x: number, y: number): boolean {
  return (
    x >= SWEREF99TM_BOUNDS.minX && x <= SWEREF99TM_BOUNDS.maxX && y >= SWEREF99TM_BOUNDS.minY && y <= SWEREF99TM_BOUNDS.maxY
  );
}

/**
 * Check if coordinates are within valid WGS84 range for Sweden
 */
export function isValidWgs84Coordinate(latitude: number, longitude: number): boolean {
  return (
    latitude >= WGS84_BOUNDS.minLat &&
    latitude <= WGS84_BOUNDS.maxLat &&
    longitude >= WGS84_BOUNDS.minLon &&
    longitude <= WGS84_BOUNDS.maxLon
  );
}

/**
 * Convert WGS84 coordinates to SWEREF99TM
 */
export function wgs84ToSweref99(point: Wgs84Point): Sweref99Point {
  if (!isValidWgs84Coordinate(point.latitude, point.longitude)) {
    throw new ValidationError(
      `WGS84 coordinates (${point.latitude}, ${point.longitude}) are outside valid range for Sweden (55-69°N, 11-24°E)`,
      'coordinates',
    );
  }

  // proj4 uses [x, y] = [longitude, latitude] order for WGS84
  const result = proj4('EPSG:4326', 'EPSG:3006', [point.longitude, point.latitude]);

  return {
    x: result[0],
    y: result[1],
  };
}

/**
 * Convert SWEREF99TM coordinates to WGS84
 */
export function sweref99ToWgs84(point: Sweref99Point): Wgs84Point {
  if (!isValidSweref99Coordinate(point.x, point.y)) {
    throw new ValidationError(
      `SWEREF99TM coordinates (${point.x}, ${point.y}) are outside valid range for Sweden`,
      'coordinates',
    );
  }

  // proj4 uses [x, y] = [easting, northing] order for projected CRS
  const result = proj4('EPSG:3006', 'EPSG:4326', [point.x, point.y]);

  return {
    longitude: result[0],
    latitude: result[1],
  };
}

/**
 * Validate a SWEREF99TM bounding box
 */
export function validateBbox(bbox: BoundingBox): void {
  if (bbox.minX >= bbox.maxX) {
    throw new ValidationError('minX must be less than maxX', 'bbox');
  }
  if (bbox.minY >= bbox.maxY) {
    throw new ValidationError('minY must be less than maxY', 'bbox');
  }
  if (!isValidSweref99Coordinate(bbox.minX, bbox.minY)) {
    throw new ValidationError(`Coordinates (${bbox.minX}, ${bbox.minY}) are outside valid SWEREF99TM range for Sweden`, 'bbox');
  }
  if (!isValidSweref99Coordinate(bbox.maxX, bbox.maxY)) {
    throw new ValidationError(`Coordinates (${bbox.maxX}, ${bbox.maxY}) are outside valid SWEREF99TM range for Sweden`, 'bbox');
  }
}

/**
 * Convert WGS84 bounding box to SWEREF99TM
 */
export function wgs84BboxToSweref99(bbox: Wgs84Bbox): BoundingBox {
  // Validate all corners
  if (!isValidWgs84Coordinate(bbox.minLat, bbox.minLon)) {
    throw new ValidationError(
      `WGS84 coordinates (${bbox.minLat}, ${bbox.minLon}) are outside valid range for Sweden (55-69°N, 11-24°E)`,
      'bbox',
    );
  }
  if (!isValidWgs84Coordinate(bbox.maxLat, bbox.maxLon)) {
    throw new ValidationError(
      `WGS84 coordinates (${bbox.maxLat}, ${bbox.maxLon}) are outside valid range for Sweden (55-69°N, 11-24°E)`,
      'bbox',
    );
  }
  if (bbox.minLat >= bbox.maxLat) {
    throw new ValidationError('minLat must be less than maxLat', 'bbox');
  }
  if (bbox.minLon >= bbox.maxLon) {
    throw new ValidationError('minLon must be less than maxLon', 'bbox');
  }

  // Convert corners
  const minCorner = wgs84ToSweref99({ latitude: bbox.minLat, longitude: bbox.minLon });
  const maxCorner = wgs84ToSweref99({ latitude: bbox.maxLat, longitude: bbox.maxLon });

  return {
    minX: minCorner.x,
    minY: minCorner.y,
    maxX: maxCorner.x,
    maxY: maxCorner.y,
  };
}

/**
 * Convert SWEREF99TM bounding box to WGS84
 */
export function sweref99BboxToWgs84(bbox: BoundingBox): Wgs84Bbox {
  // Convert corners
  const minCorner = sweref99ToWgs84({ x: bbox.minX, y: bbox.minY });
  const maxCorner = sweref99ToWgs84({ x: bbox.maxX, y: bbox.maxY });

  return {
    minLat: minCorner.latitude,
    minLon: minCorner.longitude,
    maxLat: maxCorner.latitude,
    maxLon: maxCorner.longitude,
  };
}
