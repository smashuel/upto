import React, { useEffect, useRef } from 'react';
import { MapContainer, TileLayer, Marker, Popup, useMapEvents } from 'react-leaflet';
import { Button } from 'react-bootstrap';
import { MapPin, Plus, Navigation } from 'lucide-react';
import L from 'leaflet';

// Fix for default markers in React Leaflet
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png',
});

interface MapSelectorProps {
  height?: string;
  center?: [number, number];
  zoom?: number;
  onLocationSelect?: (lat: number, lng: number, address?: string) => void;
  markers?: Array<{
    id: string;
    position: [number, number];
    title: string;
    description?: string;
  }>;
}

export const MapSelector: React.FC<MapSelectorProps> = ({
  height = '400px',
  center = [44.2619, -71.8011], // White Mountains, NH - good default for outdoor adventures
  zoom = 10,
  onLocationSelect,
  markers = []
}) => {
  const mapRef = useRef<L.Map | null>(null);

  useEffect(() => {
    // Any additional map setup can go here
  }, []);

  const handleMapClick = async (e: L.LeafletMouseEvent) => {
    if (onLocationSelect) {
      const { lat, lng } = e.latlng;
      
      // Optional: Reverse geocoding to get address
      try {
        const response = await fetch(
          `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}`
        );
        const data = await response.json();
        const address = data.display_name || `${lat.toFixed(4)}, ${lng.toFixed(4)}`;
        
        onLocationSelect(lat, lng, address);
      } catch (error) {
        console.warn('Reverse geocoding failed:', error);
        onLocationSelect(lat, lng, `${lat.toFixed(4)}, ${lng.toFixed(4)}`);
      }
    }
  };

  const MapEvents = () => {
    const map = useMapEvents({
      click: handleMapClick
    });
    
    mapRef.current = map;
    return null;
  };

  return (
    <div className="position-relative">
      <div className="map-container" style={{ height }}>
        <MapContainer
          center={center}
          zoom={zoom}
          style={{ height: '100%', width: '100%' }}
          scrollWheelZoom={true}
        >
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
          
          <MapEvents />
          
          {markers.map((marker) => (
            <Marker key={marker.id} position={marker.position}>
              <Popup>
                <div>
                  <strong>{marker.title}</strong>
                  {marker.description && <div className="small text-muted">{marker.description}</div>}
                </div>
              </Popup>
            </Marker>
          ))}
        </MapContainer>
      </div>
      
      <div className="map-controls">
        <div className="d-flex flex-column gap-2">
          <Button variant="primary" size="sm" disabled>
            <Plus size={14} className="me-1" />
            Add Waypoint
          </Button>
          <Button variant="outline-secondary" size="sm" disabled>
            <Navigation size={14} className="me-1" />
            Draw Route
          </Button>
          <Button variant="outline-secondary" size="sm" disabled>
            <MapPin size={14} className="me-1" />
            My Location
          </Button>
        </div>
        
        <div className="small text-muted mt-2 text-center">
          <MapPin size={12} className="me-1" />
          Click to add location
        </div>
      </div>
    </div>
  );
};