import { GeoPoint } from '../types.js';

const EARTH_RADIUS_KM = 6371;

/**
 * Computes distance between two GeoPoints using the Haversine formula.
 */
export function calculateHaversineDistance(p1: GeoPoint, p2: GeoPoint): number {
  const dLat = ((p2.lat - p1.lat) * Math.PI) / 180;
  const dLon = ((p2.lon - p1.lon) * Math.PI) / 180;

  const lat1Rad = (p1.lat * Math.PI) / 180;
  const lat2Rad = (p2.lat * Math.PI) / 180;

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.sin(dLon / 2) * Math.sin(dLon / 2) * Math.cos(lat1Rad) * Math.cos(lat2Rad);
  
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return EARTH_RADIUS_KM * c;
}

/**
 * Checks if a GeoPoint is inside a bounding box.
 */
export function isPointInBoundingBox(
  point: GeoPoint,
  box: { minLat: number; maxLat: number; minLon: number; maxLon: number }
): boolean {
  return (
    point.lat >= box.minLat &&
    point.lat <= box.maxLat &&
    point.lon >= box.minLon &&
    point.lon <= box.maxLon
  );
}

/**
 * Helper to filter and sort documents based on proximity.
 */
export class GeoSearchManager {
  /**
   * Returns distance if point is within criteria, else null.
   */
  public verifyAndCalculateDistance(
    point: GeoPoint,
    centerLat: number,
    centerLon: number,
    radiusKm?: number,
    boundingBox?: { minLat: number; maxLat: number; minLon: number; maxLon: number }
  ): number | null {
    const center: GeoPoint = { lat: centerLat, lon: centerLon };
    
    if (boundingBox) {
      if (!isPointInBoundingBox(point, boundingBox)) {
        return null;
      }
    }

    const dist = calculateHaversineDistance(point, center);
    
    if (radiusKm !== undefined && dist > radiusKm) {
      return null;
    }

    return dist;
  }
}
