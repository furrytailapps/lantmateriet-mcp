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
 * Point in SWEREF99TM coordinates
 */
export interface Sweref99Point {
  x: number; // Easting
  y: number; // Northing
}

/**
 * Point in WGS84 coordinates
 */
export interface Wgs84Point {
  latitude: number;
  longitude: number;
}

/**
 * Bounding box in SWEREF99TM coordinates
 */
export interface BoundingBox {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
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
      `WGS84 coordinates (${point.latitude}, ${point.longitude}) are outside valid range for Sweden`,
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
 * Validate a SWEREF99TM point
 */
export function validateSweref99Point(point: Sweref99Point): void {
  if (!isValidSweref99Coordinate(point.x, point.y)) {
    throw new ValidationError(`SWEREF99TM coordinates (${point.x}, ${point.y}) are outside valid range for Sweden`, 'point');
  }
}

/**
 * Validate a bounding box
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
 * Normalize input coordinates to SWEREF99TM
 * Accepts either SWEREF99 (x, y) or WGS84 (latitude, longitude)
 */
export function normalizeToSweref99(input: { x?: number; y?: number; latitude?: number; longitude?: number }): Sweref99Point {
  // If both SWEREF99 and WGS84 coordinates provided, prefer SWEREF99
  if (input.x !== undefined && input.y !== undefined) {
    const point = { x: input.x, y: input.y };
    validateSweref99Point(point);
    return point;
  }

  if (input.latitude !== undefined && input.longitude !== undefined) {
    return wgs84ToSweref99({ latitude: input.latitude, longitude: input.longitude });
  }

  throw new ValidationError(
    'Either (x, y) SWEREF99TM coordinates or (latitude, longitude) WGS84 coordinates are required',
    'coordinates',
  );
}
