import React, { useEffect, useState, useRef } from 'react';
import { View, Text, ActivityIndicator } from 'react-native';
import MapView, { Marker } from 'react-native-maps';
import * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';
import { io, Socket } from 'socket.io-client';

// Define background task name constant
const LOCATION_TASK_NAME = 'background-location-task';

// Define the background task - fixed to return Promise
TaskManager.defineTask(LOCATION_TASK_NAME, async ({ data, error }: TaskManager.TaskManagerTaskBody<any>) => {
  if (error) {
    console.error('Error in background location task:', error);
    return;
  }
  
  if (data) {
    // Properly type the locations data
    const { locations } = data as { locations: Location.LocationObject[] };
    const location = locations[0];
    console.log('Background location:', location.coords);
    
    // Send to WebSocket server
    await sendLocationToServer(location);
  }
});

// Function to send location to WebSocket server with proper typing
const sendLocationToServer = async (location: Location.LocationObject): Promise<void> => {
  try {
    // Using Socket.IO client instead of WebSocket
    console.log('Sending location to server:', JSON.stringify(location.coords));
    
    // Create a temporary socket connection
    const socket = io('http://192.168.1.4:3000');
    
    // Wait for connection and emit location data
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
  const socketRef = useRef<Socket | null>(null);

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
      
      // Start foreground location updates
      locationSubscription = await Location.watchPositionAsync(
        {
          accuracy: Location.Accuracy.Highest,
          timeInterval: 10000, // 10 seconds between updates
          distanceInterval: 5,
        },
        (newLocation) => {
          setLocation(newLocation);
          console.log('Foreground location update:', newLocation.coords);
          sendLocationToServer(newLocation);
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

  if (!location) return <ActivityIndicator size="large" color="#000" />;

  return (
    <MapView
      style={{ flex: 1 }}
      initialRegion={{
        latitude: location.coords.latitude,
        longitude: location.coords.longitude,
        latitudeDelta: 0.01,
        longitudeDelta: 0.01,
      }}
    >
      <Marker coordinate={{
        latitude: location.coords.latitude,
        longitude: location.coords.longitude
      }} />
    </MapView>
  );
}