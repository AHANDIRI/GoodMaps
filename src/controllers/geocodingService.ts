import { GeocodingResult } from '../types';

interface NominatimItem {
  display_name: string;
  lat: string;
  lon: string;
}

export const searchLocation = async (query: string): Promise<GeocodingResult[]> => {
  const trimmed = query.trim();
  if (!trimmed) return [];

  const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(trimmed)}&limit=5&accept-language=fr`;
  const response = await fetch(url, {
    headers: {
      Accept: 'application/json',
    },
  });

  if (!response.ok) {
    throw new Error('Erreur lors de la recherche de lieu');
  }

  const data: NominatimItem[] = await response.json();
  return data.map((item) => ({
    display_name: item.display_name,
    lat: parseFloat(item.lat),
    lng: parseFloat(item.lon),
  }));
};
