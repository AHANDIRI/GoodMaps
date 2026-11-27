import { Activity, ActivityCategory, ApiResponse, MapBounds, UserInfo } from '../types';

interface OverpassElement {
  id: number;
  type: string;
  lat?: number;
  lon?: number;
  center?: { lat: number; lon: number };
  tags?: Record<string, string>;
}

function inferCategory(tags: Record<string, string> = {}): ActivityCategory {
  if (
    tags.tourism === 'museum' ||
    tags.tourism === 'gallery' ||
    tags.amenity === 'theatre' ||
    tags.amenity === 'library' ||
    tags.amenity === 'arts_centre'
  ) {
    return 'Culture';
  }
  if (tags.leisure === 'park' || tags.leisure === 'garden' || tags.leisure === 'nature_reserve') {
    return 'Nature';
  }
  if (tags.leisure === 'swimming_pool' || tags.leisure === 'sports_centre' || tags.leisure === 'fitness_centre') {
    return 'Sport';
  }
  if (tags.amenity === 'cafe' || tags.amenity === 'restaurant') {
    return 'Restauration';
  }
  if (
    tags.amenity === 'cinema' ||
    tags.amenity === 'community_centre' ||
    tags.tourism === 'attraction' ||
    tags.tourism === 'viewpoint'
  ) {
    return 'Loisirs';
  }
  return 'Autre';
}

function formatAccessibility(tags: Record<string, string> = {}, ability = 'valide'): string {
  if (tags.wheelchair === 'yes') return 'Accessible PMR (fauteuil roulant)';
  if (tags.wheelchair === 'limited') return 'Accessibilité PMR partielle';
  if (ability === 'sensoriel') return 'Lieu adapté sensoriel';
  if (ability === 'cognitif' || ability === 'mental' || ability === 'psychique') return 'Environnement accueillant';
  return 'Accessibilité à vérifier sur place';
}

async function fetchFromOverpassDirect(bounds: MapBounds, userInfo?: UserInfo): Promise<Activity[]> {
  const south = Math.max(-90, bounds.south);
  const west = Math.max(-180, bounds.west);
  const north = Math.min(90, bounds.north);
  const east = Math.min(180, bounds.east);

  const bbox = `${south},${west},${north},${east}`;
  const query = `
    [out:json][timeout:12];
    (
      node["name"]["tourism"~"museum|gallery|attraction|viewpoint"](${bbox});
      node["name"]["leisure"~"park|garden|swimming_pool|sports_centre"](${bbox});
      node["name"]["amenity"~"cinema|theatre|library|arts_centre|community_centre|cafe|restaurant"](${bbox});
      way["name"]["tourism"~"museum|gallery|attraction"](${bbox});
      way["name"]["leisure"~"park|garden|swimming_pool|sports_centre"](${bbox});
      way["name"]["amenity"~"cinema|theatre|library|arts_centre"](${bbox});
    );
    out center 40;
  `;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 12000);

  try {
    const response = await fetch('https://overpass-api.de/api/interpreter', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: `data=${encodeURIComponent(query)}`,
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new Error('Overpass API error');
    }

    const json = await response.json();
    const elements: OverpassElement[] = json.elements || [];
    const ability = userInfo?.ability || 'valide';
    const pref = (userInfo?.activityPreferences || '').toLowerCase().trim();

    const scored = elements
      .map((el) => {
        const lat = el.lat ?? el.center?.lat;
        const lng = el.lon ?? el.center?.lon;
        const tags = el.tags || {};
        if (!lat || !lng || !tags.name) return null;

        const category = inferCategory(tags);
        const accessibility = formatAccessibility(tags, ability);
        const addressParts = [tags['addr:housenumber'], tags['addr:street'], tags['addr:city']].filter(Boolean);
        const address = addressParts.length > 0 ? addressParts.join(' ') : undefined;

        let score = 0;
        if (tags.wheelchair === 'yes') score += 4;
        else if (tags.wheelchair === 'limited') score += 2;
        if (pref && `${tags.name} ${category} ${tags.description || ''}`.toLowerCase().includes(pref)) {
          score += 5;
        }

        const activity: Activity = {
          id: `osm-${el.type}-${el.id}`,
          name: tags.name,
          description: `${category} — ${accessibility}.${tags.description ? ` ${tags.description}` : address ? ` Situé à ${address}.` : ''}`,
          lat,
          lng,
          category,
          accessibility,
          address,
          opening_hours: tags.opening_hours || undefined,
          booking_link: tags.website || tags['contact:website'] || undefined,
          phone_number: tags.phone || tags['contact:phone'] || undefined,
          source: 'openstreetmap',
        };

        return { score, activity };
      })
      .filter((item): item is { score: number; activity: Activity } => item !== null)
      .sort((a, b) => b.score - a.score)
      .slice(0, 15)
      .map((item) => item.activity);

    return scored;
  } finally {
    clearTimeout(timeoutId);
  }
}

function buildCuratedFallback(latitude: number, longitude: number, userInfo?: UserInfo): Activity[] {
  const ability = userInfo?.ability || 'valide';
  const pref = userInfo?.activityPreferences ? ` (${userInfo.activityPreferences})` : '';

  const templates: Array<{
    dLat: number;
    dLng: number;
    name: string;
    category: ActivityCategory;
    accessibility: string;
    opening_hours: string;
  }> = [
    {
      dLat: 0.004,
      dLng: 0.005,
      name: 'Parc & Promenade Accessible',
      category: 'Nature',
      accessibility: 'Accessible PMR (chemins stabilisés)',
      opening_hours: '08h00 - 20h00',
    },
    {
      dLat: -0.005,
      dLng: 0.006,
      name: 'Musée & Visite Adaptée',
      category: 'Culture',
      accessibility: 'Accessible PMR & audioguides',
      opening_hours: '10h00 - 18h00',
    },
    {
      dLat: 0.006,
      dLng: -0.004,
      name: 'Médiathèque & Espace Calme',
      category: 'Culture',
      accessibility: 'Adapté sensoriel & cognitif',
      opening_hours: '09h30 - 18h30',
    },
    {
      dLat: -0.003,
      dLng: -0.006,
      name: 'Centre Aquatique & Sportif Adapté',
      category: 'Sport',
      accessibility: "Mise à l'eau PMR disponible",
      opening_hours: '09h00 - 21h00',
    },
    {
      dLat: 0.002,
      dLng: 0.008,
      name: 'Café Associatif & Rencontres',
      category: 'Restauration',
      accessibility: 'Plain-pied & accueil bienveillant',
      opening_hours: '08h30 - 19h00',
    },
  ];

  return templates.map((item, idx) => ({
    id: `curated-${idx + 1}`,
    name: item.name,
    description: `Suggestion adaptée pour le profil "${ability}"${pref}. Pensez à vérifier les conditions d'accueil avant votre visite.`,
    lat: Number((latitude + item.dLat).toFixed(6)),
    lng: Number((longitude + item.dLng).toFixed(6)),
    category: item.category,
    accessibility: item.accessibility,
    opening_hours: item.opening_hours,
    source: 'curated',
  }));
}

export const fetchActivities = async (
  latitude: number,
  longitude: number,
  bounds?: MapBounds,
  userInfo?: UserInfo
): Promise<Activity[]> => {
  const effectiveBounds: MapBounds = bounds ?? {
    north: latitude + 0.03,
    south: latitude - 0.03,
    east: longitude + 0.04,
    west: longitude - 0.04,
  };

  // 1. Try local Express backend (/api/suggestions via Vite proxy)
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000);
    const response = await fetch('/api/suggestions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        latitude,
        longitude,
        ...effectiveBounds,
        userInfo,
      }),
      signal: controller.signal,
    });
    clearTimeout(timeoutId);

    if (response.ok) {
      const data: ApiResponse = await response.json();
      if (Array.isArray(data.activities) && data.activities.length > 0) {
        return data.activities;
      }
    }
  } catch {
    // Local backend not running or unreachable; fall through to direct Overpass
  }

  // 2. Direct OpenStreetMap Overpass API fallback (works without backend server)
  try {
    const osmActivities = await fetchFromOverpassDirect(effectiveBounds, userInfo);
    if (osmActivities.length > 0) {
      return osmActivities;
    }
  } catch {
    // Overpass unavailable or timed out; fall through to curated suggestions
  }

  // 3. Guaranteed curated fallback
  return buildCuratedFallback(latitude, longitude, userInfo);
};
