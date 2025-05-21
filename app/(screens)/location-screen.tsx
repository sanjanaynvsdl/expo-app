import React, { useEffect, useState, useRef } from 'react';
import { View, Text, ActivityIndicator, StyleSheet } from 'react-native';
import MapView, { Marker, Polyline, PROVIDER_GOOGLE } from 'react-native-maps';
import * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';
import { io, Socket } from 'socket.io-client';
import { fetchRoute, formatDistance, formatDuration, RouteResponse } from '../utils/mapboxUtils';
import { LatLng, RouteInfo } from '../types/map';

const LOCATION_TASK_NAME = 'background-location-task';
const DESTINATION: LatLng = { latitude: 16.2253, longitude: 77.8097 }; // Hardcoded destination

TaskManager.defineTask(LOCATION_TASK_NAME, async ({ data, error }: TaskManager.TaskManagerTaskBody<any>) => {
  if (error) {
    console.error('Error in background location task:', error);
    return;
  }
  
  if (data) {
    
    const { locations } = data as { locations: Location.LocationObject[] };
    const location = locations[0];
    console.log('Background location:', location.coords);
    
    // Send to WebSocket server
    await sendLocationToServer(location);
  }
});

// Function to send location to WebSocket server
const sendLocationToServer = async (location: Location.LocationObject): Promise<void> => {
  try {
    console.log('Sending location to server:', JSON.stringify(location.coords));
    
    //temporary socket connection
    const socket = io('http://192.168.1.7:3000');
    
    
    socket.on('connect', () => {
      socket.emit('location', {
        latitude: location.coords.latitude,
        longitude: location.coords.longitude,
        accuracy: location.coords.accuracy,
        timestamp: location.timestamp
      });
      
      // Disconnect after sending
      setTimeout(() => socket.disconnect(), 1000);
    });
    
    socket.on('connect_error', (error: Error) => {
      console.error('Socket connection error:', error);
    });
  } catch (error) {
    console.error('Failed to send location:', error);
  }
};

export default function LocationScreen() {
  const [location, setLocation] = useState<Location.LocationObject | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [route, setRoute] = useState<RouteResponse | null>(null);
  const [routeInfo, setRouteInfo] = useState<RouteInfo | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const socketRef = useRef<Socket | null>(null);
  const mapRef = useRef<MapView>(null);

  // Function to fetch and update route
  const updateRoute = async (currentLocation: Location.LocationObject) => {
    try {
      const origin: LatLng = {
        latitude: currentLocation.coords.latitude,
        longitude: currentLocation.coords.longitude
      };
      
      const routeData = await fetchRoute(origin, DESTINATION);
      setRoute(routeData);
      setRouteInfo({
        distance: formatDistance(routeData.distance),
        duration: formatDuration(routeData.duration)
      });
    } catch (error) {
      console.error('Error updating route:', error);
    }
  };

  // Function to fit map to show entire route
  const fitMapToRoute = () => {
    if (mapRef.current && route?.coordinates) {
      const coordinates = route.coordinates;
      mapRef.current.fitToCoordinates(coordinates, {
        edgePadding: { top: 50, right: 50, bottom: 50, left: 50 },
        animated: true
      });
    }
  };

  useEffect(() => {
    let locationSubscription: Location.LocationSubscription | null = null;

    (async () => {
      // Request both foreground and background permissions
      const { status: foregroundStatus } = await Location.requestForegroundPermissionsAsync();
      if (foregroundStatus !== 'granted') {
        setErrorMsg('Permission to access location was denied');
        return;
      }
      
      try {
        const { status: backgroundStatus } = await Location.requestBackgroundPermissionsAsync();
        if (backgroundStatus !== 'granted') {
          console.log('Background location permission denied');
          // Continue anyway as we can still do foreground tracking
        }
      } catch (error) {
        console.log('Error requesting background permission:', error);
        // Continue with foreground tracking
      }

      // Get initial location
      const loc = await Location.getCurrentPositionAsync({});
      setLocation(loc);
      console.log('Initial location:', loc.coords);
      
      // Send initial location to server
      await sendLocationToServer(loc);
      
      // Get initial route
      await updateRoute(loc);
      setIsLoading(false);
      
      // Start foreground location updates
      locationSubscription = await Location.watchPositionAsync(
        {
          accuracy: Location.Accuracy.Highest,
          timeInterval: 10000,
          distanceInterval: 5,
        },
        async (newLocation) => {
          setLocation(newLocation);
          console.log('Foreground location update:', newLocation.coords);
          await sendLocationToServer(newLocation);
          await updateRoute(newLocation);
        }
      );
      
      // Start background location updates if background permission was granted
      try {
        const hasStarted = await Location.hasStartedLocationUpdatesAsync(LOCATION_TASK_NAME);
        if (!hasStarted) {
          await Location.startLocationUpdatesAsync(LOCATION_TASK_NAME, {
            accuracy: Location.Accuracy.Balanced,
            timeInterval: 10000, // 10 seconds
            distanceInterval: 10, // 10 meters
            showsBackgroundLocationIndicator: true,
            foregroundService: {
              notificationTitle: "Location Tracking",
              notificationBody: "Your location is being tracked",
            },
          });
          console.log('Background location tracking started');
        }
      } catch (error) {
        console.error('Failed to start background location updates:', error);
      }
    })();
    
    // Cleanup function
    return () => {
      if (locationSubscription) {
        locationSubscription.remove();
      }
      
      (async () => {
        try {
          const hasStarted = await Location.hasStartedLocationUpdatesAsync(LOCATION_TASK_NAME);
          if (hasStarted) {
            await Location.stopLocationUpdatesAsync(LOCATION_TASK_NAME);
            console.log('Background location tracking stopped');
          }
        } catch (error) {
          console.error('Error stopping background location:', error);
        }
      })();
    };
  }, []);

  // Fit map to route when route is updated
  useEffect(() => {
    if (route) {
      fitMapToRoute();
    }
  }, [route]);

  if (!location || isLoading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#631235" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <MapView
        ref={mapRef}
        style={styles.map}
        provider={PROVIDER_GOOGLE}
        initialRegion={{
          latitude: location.coords.latitude,
          longitude: location.coords.longitude,
          latitudeDelta: 0.01,
          longitudeDelta: 0.01,
        }}
      >
        {/* Current location marker */}
        <Marker
          coordinate={{
            latitude: location.coords.latitude,
            longitude: location.coords.longitude
          }}
          pinColor="#447bd5"
        />
        
        {/* Destination marker */}
        <Marker
          coordinate={DESTINATION}
          pinColor="#b42121"
        />
        
        {/* Route polyline */}
        {route && (
          <Polyline
            coordinates={route.coordinates}
            strokeColor="#631235"
            strokeWidth={4}
          />
        )}
      </MapView>
      
      {/* Route info overlay */}
      {routeInfo && (
        <View style={styles.routeInfoContainer}>
          <View style={styles.routeInfoRow}>
            <Text style={styles.routeInfoLabel}>Distance:</Text>
            <Text style={styles.routeInfoValue}>{routeInfo.distance}</Text>
          </View>
          <View style={styles.routeInfoRow}>
            <Text style={styles.routeInfoLabel}>Duration:</Text>
            <Text style={styles.routeInfoValue}>{routeInfo.duration}</Text>
          </View>
        </View>
      )}
    </View>
  );
}
const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  map: {
    flex: 1,
  },
  routeInfoContainer: {
    position: 'absolute',
    bottom: 20,
    left: 20,
    right: 20,
    backgroundColor: 'white',
    padding: 15,
    borderRadius: 10,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
    elevation: 5,
  },
  routeInfoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  routeInfoLabel: {
    fontSize: 16,
    fontWeight: '500',
    color: '#631235',
  },
  routeInfoValue: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#631235',
  },
});
