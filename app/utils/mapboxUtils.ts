import { LatLng } from '../types/map';

const MAPBOX_ACCESS_TOKEN = process.env.EXPO_PUBLIC_MAPBOX_ACCESS_TOKEN;

export interface RouteResponse {
  coordinates: LatLng[];
  distance: number;
  duration: number;
}

export const fetchRoute = async (
  origin: LatLng,
  destination: LatLng
): Promise<RouteResponse> => {
  try {
    const originStr = `${origin.longitude},${origin.latitude}`;
    const destStr = `${destination.longitude},${destination.latitude}`;
    
    const url = `https://api.mapbox.com/directions/v5/mapbox/driving-traffic/${originStr};${destStr}?geometries=geojson&access_token=${MAPBOX_ACCESS_TOKEN}`;
    
    const response = await fetch(url);
    
    if (!response.ok) {
      throw new Error(`Failed to fetch route: ${response.status}`);
    }
    
    const data = await response.json();
    
    if (!data.routes || data.routes.length === 0) {
      throw new Error('No route found');
    }
    
    const route = data.routes[0];
    
    // Convert coordinates to LatLng format
    const coordinates: LatLng[] = route.geometry.coordinates.map(
      (coord: [number, number]) => ({
        latitude: coord[1],
        longitude: coord[0]
      })
    );
    
    return {
      coordinates,
      distance: route.distance, // in meters
      duration: route.duration // in seconds
    };
  } catch (error) {
    console.error('Error fetching route:', error);
    throw error;
  }
};

export const formatDistance = (meters: number): string => {
  const km = meters / 1000;
  return `${km.toFixed(1)} km`;
};

export const formatDuration = (seconds: number): string => {
  const minutes = Math.round(seconds / 60);
  return `${minutes} min`;
}; 