import { useMemo } from 'react';
import L from 'leaflet';
import { MapContainer, Marker, Popup, TileLayer, useMapEvents } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';

/** Centro por defecto (Venezuela) cuando no hay ningún punto que enfocar. */
export const DEFAULT_CENTER: [number, number] = [10.4806, -66.9036];

/** Pin de color como divIcon (evita el bug de íconos rotos de Leaflet con bundlers). */
export function pinIcon(color: string) {
  return L.divIcon({
    className: 'calc3d-pin',
    html: `<svg width="26" height="34" viewBox="0 0 26 34" xmlns="http://www.w3.org/2000/svg">
      <path d="M13 0C5.8 0 0 5.8 0 13c0 9.2 13 21 13 21s13-11.8 13-21C26 5.8 20.2 0 13 0z" fill="${color}" stroke="#ffffff" stroke-width="2"/>
      <circle cx="13" cy="13" r="5" fill="#ffffff"/>
    </svg>`,
    iconSize: [26, 34],
    iconAnchor: [13, 34],
    popupAnchor: [0, -30],
  });
}

export interface MapPoint {
  id: string;
  name: string;
  lat: number;
  lng: number;
  color: string;
  subtitle?: string;
}

/** Captura clicks en el mapa para fijar una ubicación. */
function ClickCapture({ onPick }: { onPick: (lat: number, lng: number) => void }) {
  useMapEvents({
    click(e) {
      onPick(e.latlng.lat, e.latlng.lng);
    },
  });
  return null;
}

/**
 * Mapa selector: click (o arrastra el pin) para fijar una coordenada. `value`
 * es la coordenada actual (o null); `onChange` recibe la nueva.
 */
export function LocationPicker({
  value,
  onChange,
  color = '#FFC300',
  height = 260,
}: {
  value: { lat: number; lng: number } | null;
  onChange: (coords: { lat: number; lng: number }) => void;
  color?: string;
  height?: number;
}) {
  const icon = useMemo(() => pinIcon(color), [color]);
  const center = value ? [value.lat, value.lng] : DEFAULT_CENTER;

  return (
    <div
      className="overflow-hidden rounded-xl border border-border"
      style={{ height }}
      role="application"
      aria-label="Mapa para fijar la ubicación: haz clic o arrastra el pin"
    >
      <MapContainer
        center={center as [number, number]}
        zoom={value ? 14 : 11}
        style={{ height: '100%', width: '100%' }}
        scrollWheelZoom
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        <ClickCapture onPick={(lat, lng) => onChange({ lat, lng })} />
        {value && (
          <Marker
            position={[value.lat, value.lng]}
            icon={icon}
            draggable
            title="Ubicación seleccionada (arrastra para mover)"
            alt="Ubicación seleccionada"
            eventHandlers={{
              dragend(e) {
                const p = (e.target as L.Marker).getLatLng();
                onChange({ lat: p.lat, lng: p.lng });
              },
            }}
          />
        )}
      </MapContainer>
    </div>
  );
}

/** Mapa de solo lectura con varios puntos (directorio de contactos). */
export function PointsMap({
  points,
  height = '100%',
  onSelect,
}: {
  points: MapPoint[];
  height?: number | string;
  onSelect?: (id: string) => void;
}) {
  const center = useMemo<[number, number]>(() => {
    if (points.length === 0) return DEFAULT_CENTER;
    const lat = points.reduce((s, p) => s + p.lat, 0) / points.length;
    const lng = points.reduce((s, p) => s + p.lng, 0) / points.length;
    return [lat, lng];
  }, [points]);

  return (
    <div
      className="overflow-hidden rounded-xl border border-border"
      style={{ height }}
      role="application"
      aria-label={`Mapa con ${points.length} ${points.length === 1 ? 'contacto ubicado' : 'contactos ubicados'}`}
    >
      <MapContainer center={center} zoom={points.length ? 11 : 6} style={{ height: '100%', width: '100%' }} scrollWheelZoom>
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        {points.map((p) => (
          <Marker
            key={p.id}
            position={[p.lat, p.lng]}
            icon={pinIcon(p.color)}
            title={p.subtitle ? `${p.name} · ${p.subtitle}` : p.name}
            alt={p.name}
          >
            <Popup>
              <div className="text-sm">
                <div className="font-semibold">{p.name}</div>
                {p.subtitle && <div className="text-xs opacity-70">{p.subtitle}</div>}
                {onSelect && (
                  <button
                    onClick={() => onSelect(p.id)}
                    className="mt-1 text-xs font-semibold text-blue-600 underline"
                  >
                    Ver ficha
                  </button>
                )}
              </div>
            </Popup>
          </Marker>
        ))}
      </MapContainer>
    </div>
  );
}
