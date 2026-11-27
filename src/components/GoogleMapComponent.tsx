import React, { useEffect, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { Activity, MapBounds } from '../types';

interface GoogleMapComponentProps {
  activities: Activity[];
  selectedActivityId?: string | null;
  center?: { lat: number; lng: number };
  userLocation?: { lat: number; lng: number } | null;
  onMarkerClick: (activity: Activity) => void;
  onMapLoad: () => void;
  onMapDragEnd?: () => void;
  onBoundsChange: (bounds: MapBounds, center: { lat: number; lng: number }) => void;
}

const DEFAULT_CENTER = { lat: 48.8566, lng: 2.3522 };

const GoogleMapComponent: React.FC<GoogleMapComponentProps> = ({
  activities,
  selectedActivityId,
  center = DEFAULT_CENTER,
  userLocation,
  onMarkerClick,
  onMapLoad,
  onBoundsChange,
}) => {
  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<L.Map | null>(null);
  const markersLayerRef = useRef<L.LayerGroup | null>(null);
  const userMarkerRef = useRef<L.CircleMarker | null>(null);
  const onBoundsChangeRef = useRef(onBoundsChange);
  const onMapLoadRef = useRef(onMapLoad);

  onBoundsChangeRef.current = onBoundsChange;
  onMapLoadRef.current = onMapLoad;

  useEffect(() => {
    if (!mapContainerRef.current || mapRef.current) return;

    const map = L.map(mapContainerRef.current, {
      center: [center.lat, center.lng],
      zoom: 14,
      zoomControl: true,
    });

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; OpenStreetMap contributors',
      maxZoom: 19,
    }).addTo(map);

    const markersLayer = L.layerGroup().addTo(map);
    markersLayerRef.current = markersLayer;
    mapRef.current = map;

    const emitBounds = () => {
      const b = map.getBounds();
      const c = map.getCenter();
      onBoundsChangeRef.current(
        {
          north: b.getNorth(),
          south: b.getSouth(),
          east: b.getEast(),
          west: b.getWest(),
        },
        { lat: c.lat, lng: c.lng }
      );
    };

    map.on('moveend', emitBounds);
    map.on('zoomend', emitBounds);

    emitBounds();
    onMapLoadRef.current();

    return () => {
      map.remove();
      mapRef.current = null;
      markersLayerRef.current = null;
      userMarkerRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Update map center when center prop changes significantly
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const current = map.getCenter();
    const dist = Math.hypot(current.lat - center.lat, current.lng - center.lng);
    if (dist > 0.0005) {
      map.flyTo([center.lat, center.lng], Math.max(map.getZoom(), 14), { duration: 0.7 });
    }
  }, [center.lat, center.lng]);

  // Render user location marker
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    if (userMarkerRef.current) {
      userMarkerRef.current.remove();
      userMarkerRef.current = null;
    }

    if (userLocation) {
      userMarkerRef.current = L.circleMarker([userLocation.lat, userLocation.lng], {
        radius: 8,
        fillColor: '#2563eb',
        color: '#ffffff',
        weight: 3,
        opacity: 1,
        fillOpacity: 1,
      })
        .bindPopup('<strong>Votre position</strong>')
        .addTo(map);
    }
  }, [userLocation]);

  // Render activity markers
  useEffect(() => {
    const layer = markersLayerRef.current;
    if (!layer) return;

    layer.clearLayers();

    activities.forEach((activity, index) => {
      const isSelected = activity.id === selectedActivityId;
      const icon = L.divIcon({
        className: 'custom-map-pin-wrapper',
        html: `<div class="custom-map-pin ${isSelected ? 'selected' : ''}" aria-label="${activity.name}"><span>${index + 1}</span></div>`,
        iconSize: [32, 32],
        iconAnchor: [16, 32],
        popupAnchor: [0, -32],
      });

      const marker = L.marker([activity.lat, activity.lng], { icon });
      marker.bindTooltip(activity.name, { direction: 'top', offset: [0, -28] });
      marker.on('click', () => {
        onMarkerClick(activity);
      });
      marker.addTo(layer);
    });
  }, [activities, selectedActivityId, onMarkerClick]);

  return (
    <div
      ref={mapContainerRef}
      className="goodmaps-leaflet-container"
      role="region"
      aria-label="Carte interactive des activités accessibles"
    />
  );
};

export default GoogleMapComponent;
