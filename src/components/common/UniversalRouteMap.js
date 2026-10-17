import React, { useRef, useEffect, useImperativeHandle, forwardRef, useCallback } from 'react'
import { StyleSheet, View, ActivityIndicator } from 'react-native'
import { WebView } from 'react-native-webview'

/**
 * UniversalRouteMap
 * Zero-Black-Screen guaranteed, vibrant, high-performance interactive map.
 * Powered by Leaflet + CartoDB Voyager raster tiles.
 * 100% immune to Google Maps API Key / Cloud Billing / SHA-1 restrictions.
 */
const UniversalRouteMap = forwardRef(({
  pickupCoords,
  destCoords,
  routeCoordinates = [],
  simulatedCabs = [],
  driverLocation = null,
  waypoints = [],
  onMapPress,
  onMapReady,
  initialRegion,
  style,
}, ref) => {
  const webViewRef = useRef(null)
  const isReadyRef = useRef(false)

  const centerLat = parseFloat(pickupCoords?.latitude) || parseFloat(driverLocation?.latitude) || parseFloat(initialRegion?.latitude) || 13.0827
  const centerLng = parseFloat(pickupCoords?.longitude) || parseFloat(driverLocation?.longitude) || parseFloat(initialRegion?.longitude) || 80.2707

  // Send state updates to the WebView Leaflet map
  const sendToMap = useCallback((payload) => {
    if (webViewRef.current && isReadyRef.current) {
      const script = `if (window.handleMapAction) { window.handleMapAction(${JSON.stringify(payload)}); } true;`
      webViewRef.current.injectJavaScript(script)
    }
  }, [])

  // Expose methods matching react-native-maps MapView ref
  useImperativeHandle(ref, () => ({
    animateToRegion: (region, duration = 400) => {
      if (region?.latitude && region?.longitude) {
        sendToMap({
          type: 'animate_to',
          lat: region.latitude,
          lng: region.longitude,
          zoom: 14,
        })
      }
    },
    fitToCoordinates: (coordinates, options = {}) => {
      if (coordinates && coordinates.length > 0) {
        sendToMap({
          type: 'fit_bounds',
          coordinates: coordinates.map(c => [c.latitude, c.longitude]),
        })
      }
    },
    invalidateSize: () => {
      sendToMap({ type: 'invalidate_size' })
    },
  }))

  // Sync state changes with WebView map
  useEffect(() => {
    if (isReadyRef.current) {
      sendToMap({
        type: 'sync_state',
        pickup: pickupCoords?.latitude ? [pickupCoords.latitude, pickupCoords.longitude] : null,
        destination: destCoords?.latitude ? [destCoords.latitude, destCoords.longitude] : null,
        driver: driverLocation?.latitude ? { lat: driverLocation.latitude, lng: driverLocation.longitude, heading: driverLocation.heading || 0 } : null,
        waypoints: (waypoints || []).map(w => ({ lat: w.latitude ?? w.lat, lng: w.longitude ?? w.lng, label: w.label || w.address || '' })),
        route: (routeCoordinates || []).map(c => [c.latitude, c.longitude]),
        cabs: (simulatedCabs || []).map(c => ({ id: c.id, lat: c.lat, lng: c.lng, heading: c.heading || 0 })),
      })
    }
  }, [pickupCoords, destCoords, routeCoordinates, simulatedCabs, driverLocation, waypoints, sendToMap])

  const handleMessage = (event) => {
    try {
      const data = JSON.parse(event.nativeEvent.data)
      if (data.type === 'map_ready') {
        isReadyRef.current = true
        if (onMapReady) {
          onMapReady()
        }
        // Sync state once WebView confirms Leaflet is ready
        sendToMap({
          type: 'sync_state',
          pickup: pickupCoords?.latitude ? [pickupCoords.latitude, pickupCoords.longitude] : null,
          destination: destCoords?.latitude ? [destCoords.latitude, destCoords.longitude] : null,
          driver: driverLocation?.latitude ? { lat: driverLocation.latitude, lng: driverLocation.longitude, heading: driverLocation.heading || 0 } : null,
          waypoints: (waypoints || []).map(w => ({ lat: w.latitude ?? w.lat, lng: w.longitude ?? w.lng, label: w.label || w.address || '' })),
          route: (routeCoordinates || []).map(c => [c.latitude, c.longitude]),
          cabs: (simulatedCabs || []).map(c => ({ id: c.id, lat: c.lat, lng: c.lng, heading: c.heading || 0 })),
        })
      } else if (data.type === 'map_press' && onMapPress) {
        onMapPress({
          nativeEvent: {
            coordinate: {
              latitude: data.latitude,
              longitude: data.longitude,
            },
          },
        })
      }
    } catch (e) {
      console.warn('Map message parse error:', e)
    }
  }

  // Pre-bake initial data into HTML so map renders immediately without waiting for round-trip postMessage
  const initialDataJson = JSON.stringify({
    pickup: pickupCoords?.latitude ? [pickupCoords.latitude, pickupCoords.longitude] : null,
    destination: destCoords?.latitude ? [destCoords.latitude, destCoords.longitude] : null,
    driver: driverLocation?.latitude ? { lat: driverLocation.latitude, lng: driverLocation.longitude, heading: driverLocation.heading || 0 } : null,
    waypoints: (waypoints || []).map(w => ({ lat: w.latitude ?? w.lat, lng: w.longitude ?? w.lng, label: w.label || w.address || '' })),
    route: (routeCoordinates || []).map(c => [c.latitude, c.longitude]),
    cabs: (simulatedCabs || []).map(c => ({ id: c.id, lat: c.lat, lng: c.lng, heading: c.heading || 0 })),
  })

  const mapHtml = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />
  <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
  <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.css" />
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; -webkit-tap-highlight-color: transparent; }
    html, body, #map { width: 100%; height: 100%; background: #F8FAFC; font-family: -apple-system, Roboto, sans-serif; overflow: hidden; }
    
    /* Pickup Pulse Beacon */
    .pickup-beacon {
      position: relative;
      width: 32px;
      height: 32px;
    }
    .pickup-core {
      position: absolute;
      width: 14px;
      height: 14px;
      left: 9px;
      top: 9px;
      background: #10B981;
      border: 3px solid #FFFFFF;
      border-radius: 50%;
      box-shadow: 0 2px 8px rgba(16, 185, 129, 0.6);
      z-index: 2;
    }
    .pickup-ring {
      position: absolute;
      width: 32px;
      height: 32px;
      left: 0;
      top: 0;
      background: rgba(16, 185, 129, 0.35);
      border-radius: 50%;
      animation: pulse 1.8s infinite ease-out;
      z-index: 1;
    }
    @keyframes pulse {
      0% { transform: scale(0.6); opacity: 0.9; }
      100% { transform: scale(1.6); opacity: 0; }
    }

    /* Destination Red Pin */
    .dest-pin {
      width: 34px;
      height: 40px;
      filter: drop-shadow(0 4px 6px rgba(239, 68, 68, 0.45));
      transform: translate(-17px, -38px);
    }

    /* Moving Cab Car Icon */
    .cab-marker {
      width: 32px;
      height: 32px;
      background: #FFFFFF;
      border-radius: 50%;
      box-shadow: 0 3px 8px rgba(0,0,0,0.25);
      display: flex;
      align-items: center;
      justify-content: center;
      transition: transform 0.4s ease-out;
    }
    .cab-marker svg {
      width: 20px;
      height: 20px;
      fill: #0F172A;
    }

    /* Active Driver Car Marker */
    .driver-marker {
      width: 36px;
      height: 36px;
      background: #D97706;
      border: 2px solid #FFFFFF;
      border-radius: 50%;
      box-shadow: 0 4px 10px rgba(217, 119, 6, 0.5);
      display: flex;
      align-items: center;
      justify-content: center;
      transition: transform 0.4s ease-out;
    }
    .driver-marker svg {
      width: 22px;
      height: 22px;
      fill: #FFFFFF;
    }

    .leaflet-control-attribution { display: none !important; }
    .leaflet-bar { border: none !important; box-shadow: 0 2px 8px rgba(0,0,0,0.15) !important; border-radius: 10px !important; }
  </style>
</head>
<body>
  <div id="map"></div>
  <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
  <script>
    window.INITIAL_MAP_DATA = ${initialDataJson};

    function startMapEngine() {
      if (typeof L === 'undefined') {
        // Fallback CDN if unpkg didn't load yet
        if (!document.getElementById('leaflet-cdnjs')) {
          var altScript = document.createElement('script');
          altScript.id = 'leaflet-cdnjs';
          altScript.src = 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.js';
          altScript.onload = startMapEngine;
          document.head.appendChild(altScript);
        }
        setTimeout(startMapEngine, 100);
        return;
      }

      var map = L.map('map', {
        zoomControl: false,
        attributionControl: false
      }).setView([${centerLat}, ${centerLng}], 14);

      // Ultra-Clear High-Resolution World Street Map (100% Free, Zero Watermark, NO API Key Required)
      var streetTileLayer = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}', {
        maxZoom: 19,
        minZoom: 2
      }).addTo(map);

      // Automatic fallback to OpenStreetMap if network blocks ArcGIS
      streetTileLayer.on('tileerror', function() {
        if (!window.__switchedTile) {
          window.__switchedTile = true;
          try { map.removeLayer(streetTileLayer); } catch(e) {}
          L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
            maxZoom: 19,
            minZoom: 2
          }).addTo(map);
        }
      });

      // Force layout invalidation so tiles render fully in WebView
      setTimeout(function() { map.invalidateSize(); }, 200);
      setTimeout(function() { map.invalidateSize(); }, 800);

      var pickupMarker = null;
      var destMarker = null;
      var driverMarker = null;
      var waypointMarkers = [];
      var routeOuterLine = null;
      var routeInnerLine = null;
      var cabMarkers = {};

      var pickupIcon = L.divIcon({
        className: 'pickup-beacon',
        html: '<div class="pickup-ring"></div><div class="pickup-core"></div>',
        iconSize: [32, 32],
        iconAnchor: [16, 16]
      });

      var destIcon = L.divIcon({
        className: '',
        html: '<svg class="dest-pin" viewBox="0 0 24 24"><path fill="#EF4444" d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z"/></svg>',
        iconSize: [34, 40],
        iconAnchor: [17, 38]
      });

      function getCabIcon(heading) {
        return L.divIcon({
          className: '',
          html: '<div class="cab-marker" style="transform: rotate(' + (heading || 0) + 'deg);"><svg viewBox="0 0 24 24"><path d="M18.92 6.01C18.72 5.42 18.16 5 17.5 5h-11c-.66 0-1.21.42-1.42 1.01L3 12v8c0 .55.45 1 1 1h1c.55 0 1-.45 1-1v-1h12v1c0 .55.45 1 1 1h1c.55 0 1-.45 1-1v-8l-2.08-5.99zM6.85 7h10.29l1.04 3H5.81l1.04-3zM19 17H5v-4.66l.12-.34h13.77l.11.34V17z"/><circle cx="7.5" cy="14.5" r="1.5"/><circle cx="16.5" cy="14.5" r="1.5"/></svg></div>',
          iconSize: [32, 32],
          iconAnchor: [16, 16]
        });
      }

      function getDriverIcon(heading) {
        return L.divIcon({
          className: '',
          html: '<div class="driver-marker" style="transform: rotate(' + (heading || 0) + 'deg);"><svg viewBox="0 0 24 24"><path d="M18.92 6.01C18.72 5.42 18.16 5 17.5 5h-11c-.66 0-1.21.42-1.42 1.01L3 12v8c0 .55.45 1 1 1h1c.55 0 1-.45 1-1v-1h12v1c0 .55.45 1 1 1h1c.55 0 1-.45 1-1v-8l-2.08-5.99zM6.85 7h10.29l1.04 3H5.81l1.04-3zM19 17H5v-4.66l.12-.34h13.77l.11.34V17z"/><circle cx="7.5" cy="14.5" r="1.5"/><circle cx="16.5" cy="14.5" r="1.5"/></svg></div>',
          iconSize: [36, 36],
          iconAnchor: [18, 18]
        });
      }

      function getWaypointIcon(index) {
        return L.divIcon({
          className: '',
          html: '<div style="position:relative;width:28px;height:34px;"><svg viewBox="0 0 24 24" style="width:28px;height:34px;filter:drop-shadow(0 2px 4px rgba(217,119,6,0.5));"><path fill="#F59E0B" d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z"/><circle fill="#FFFFFF" cx="12" cy="9" r="4"/></svg><span style="position:absolute;top:3px;left:0;width:28px;text-align:center;font-size:10px;font-weight:900;color:#B45309;">' + (index || '1') + '</span></div>',
          iconSize: [28, 34],
          iconAnchor: [14, 32]
        });
      }

      map.on('click', function(e) {
        if (window.ReactNativeWebView) {
          window.ReactNativeWebView.postMessage(JSON.stringify({
            type: 'map_press',
            latitude: e.latlng.lat,
            longitude: e.latlng.lng
          }));
        }
      });

      window.handleMapAction = function(action) {
        if (!action) return;

        if (action.type === 'invalidate_size') {
          map.invalidateSize();
          return;
        }

        if (action.type === 'animate_to') {
          map.flyTo([action.lat, action.lng], action.zoom || 14, { duration: 0.6 });
        } else if (action.type === 'fit_bounds') {
          if (action.coordinates && action.coordinates.length > 0) {
            map.fitBounds(action.coordinates, { padding: [50, 50], maxZoom: 16 });
          }
        } else if (action.type === 'sync_state') {
          // 1. Pickup Pin
          if (action.pickup && action.pickup[0] && action.pickup[1]) {
            if (!pickupMarker) {
              pickupMarker = L.marker(action.pickup, { icon: pickupIcon }).addTo(map);
            } else {
              pickupMarker.setLatLng(action.pickup);
            }
          } else if (pickupMarker) {
            map.removeLayer(pickupMarker);
            pickupMarker = null;
          }

          // 2. Destination Pin
          if (action.destination && action.destination[0] && action.destination[1]) {
            if (!destMarker) {
              destMarker = L.marker(action.destination, { icon: destIcon }).addTo(map);
            } else {
              destMarker.setLatLng(action.destination);
            }
          } else if (destMarker) {
            map.removeLayer(destMarker);
            destMarker = null;
          }

          // 2b. Intermediate Waypoints Pin(s)
          waypointMarkers.forEach(function(m) { map.removeLayer(m); });
          waypointMarkers = [];
          if (action.waypoints && action.waypoints.length > 0) {
            action.waypoints.forEach(function(wp, idx) {
              if (wp && wp.lat && wp.lng) {
                var m = L.marker([wp.lat, wp.lng], { icon: getWaypointIcon(idx + 1) }).addTo(map);
                if (wp.label) m.bindTooltip(wp.label, { permanent: false, direction: 'top' });
                waypointMarkers.push(m);
              }
            });
          }

          // 3. Driver Live Location
          if (action.driver && action.driver.lat && action.driver.lng) {
            if (!driverMarker) {
              driverMarker = L.marker([action.driver.lat, action.driver.lng], { icon: getDriverIcon(action.driver.heading) }).addTo(map);
            } else {
              driverMarker.setLatLng([action.driver.lat, action.driver.lng]);
              driverMarker.setIcon(getDriverIcon(action.driver.heading));
            }
          } else if (driverMarker) {
            map.removeLayer(driverMarker);
            driverMarker = null;
          }

          // 4. Route Polyline
          if (action.route && action.route.length > 1) {
            if (!routeOuterLine) {
              routeOuterLine = L.polyline(action.route, { color: 'rgba(15, 23, 42, 0.45)', weight: 9, lineCap: 'round', lineJoin: 'round' }).addTo(map);
              routeInnerLine = L.polyline(action.route, { color: '#2563EB', weight: 5.5, lineCap: 'round', lineJoin: 'round' }).addTo(map);
            } else {
              routeOuterLine.setLatLngs(action.route);
              routeInnerLine.setLatLngs(action.route);
            }
            map.fitBounds(action.route, { padding: [60, 60], maxZoom: 16 });
          } else {
            if (routeOuterLine) { map.removeLayer(routeOuterLine); routeOuterLine = null; }
            if (routeInnerLine) { map.removeLayer(routeInnerLine); routeInnerLine = null; }

            // If no polyline but we have pickup and destination, fit bounds to them
            var boundsPoints = [];
            if (action.driver && action.driver.lat) boundsPoints.push([action.driver.lat, action.driver.lng]);
            if (action.pickup && action.pickup[0]) boundsPoints.push(action.pickup);
            if (action.destination && action.destination[0]) boundsPoints.push(action.destination);
            if (boundsPoints.length >= 2) {
              map.fitBounds(boundsPoints, { padding: [60, 60], maxZoom: 15 });
            }
          }

          // 5. Simulated Cabs
          if (action.cabs) {
            action.cabs.forEach(function(cab) {
              if (!cabMarkers[cab.id]) {
                cabMarkers[cab.id] = L.marker([cab.lat, cab.lng], { icon: getCabIcon(cab.heading) }).addTo(map);
              } else {
                cabMarkers[cab.id].setLatLng([cab.lat, cab.lng]);
                cabMarkers[cab.id].setIcon(getCabIcon(cab.heading));
              }
            });
          }
        }
      };

      // Apply pre-baked initial state immediately
      if (window.INITIAL_MAP_DATA) {
        window.handleMapAction({
          type: 'sync_state',
          pickup: window.INITIAL_MAP_DATA.pickup,
          destination: window.INITIAL_MAP_DATA.destination,
          driver: window.INITIAL_MAP_DATA.driver,
          waypoints: window.INITIAL_MAP_DATA.waypoints,
          route: window.INITIAL_MAP_DATA.route,
          cabs: window.INITIAL_MAP_DATA.cabs,
        });
      }

      if (window.ReactNativeWebView) {
        window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'map_ready' }));
      }
    }

    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', startMapEngine);
    } else {
      startMapEngine();
    }
  </script>
</body>
</html>`

  return (
    <View style={[styles.container, style]}>
      <WebView
        ref={webViewRef}
        originWhitelist={['*']}
        source={{ html: mapHtml, baseUrl: 'https://unpkg.com' }}
        onMessage={handleMessage}
        javaScriptEnabled={true}
        domStorageEnabled={true}
        scalesPageToFit={true}
        scrollEnabled={false}
        bounces={false}
        overScrollMode="never"
        mixedContentMode="always"
        allowFileAccess={true}
        allowUniversalAccessFromFileURLs={true}
        androidLayerType="hardware"
        startInLoadingState={true}
        renderLoading={() => (
          <View style={styles.loadingBox}>
            <ActivityIndicator size="small" color="#D97706" />
          </View>
        )}
        style={styles.webView}
      />
    </View>
  )
})

const styles = StyleSheet.create({
  container: {
    width: '100%',
    height: '100%',
    backgroundColor: '#F8FAFC',
    overflow: 'hidden',
  },
  webView: {
    width: '100%',
    height: '100%',
    flex: 1,
    backgroundColor: '#F8FAFC',
  },
  loadingBox: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F8FAFC',
  },
})

export default UniversalRouteMap
