import '../App.css';
import React, { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import GoogleMapComponent from '../components/GoogleMapComponent';
import { fetchActivities } from '../controllers/apiServiceGPT';
import { searchLocation } from '../controllers/geocodingService';
import { Activity, ActivityCategory, GeocodingResult, MapBounds, UserInfo } from '../types';
import { v4 as uuidv4 } from 'uuid';
import AddCircleIcon from '../assets/add_circle.svg';
import PlayCircleIcon from '../assets/play_circle.svg';
import LoadingOverlay from '../components/LoadingOverlay';
import logo from '../assets/logo-goodmaps.png';

const USER_STORAGE_KEY = 'goodmaps_user_info';
const FAVORITES_STORAGE_KEY = 'goodmaps_favorites';
const DEFAULT_CENTER = { lat: 48.8566, lng: 2.3522 }; // Paris par défaut

const ABILITY_LABELS: Record<string, string> = {
  moteur: 'Handicap moteur (PMR)',
  sensoriel: 'Handicap sensoriel',
  mental: 'Handicap mental',
  psychique: 'Handicap psychique',
  cognitif: 'Handicap cognitif',
  multi: 'Multi handicap',
  valide: 'Sans handicap',
};

const CATEGORIES: Array<'Toutes' | ActivityCategory | 'Favoris'> = [
  'Toutes',
  'Culture',
  'Nature',
  'Sport',
  'Loisirs',
  'Restauration',
  'Favoris',
];

function calculateDistanceKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const R = 6371;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function formatDistance(km: number): string {
  if (km < 1) return `${Math.round(km * 1000)} m`;
  return `${km.toFixed(1)} km`;
}

function getInitialUserInfo(state: unknown): UserInfo {
  const stateInfo = state as Partial<UserInfo> | null;
  if (stateInfo?.ability) {
    return {
      ability: stateInfo.ability,
      activityPreferences: stateInfo.activityPreferences || '',
    };
  }
  try {
    const raw = localStorage.getItem(USER_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<UserInfo>;
      if (parsed.ability) {
        return {
          ability: parsed.ability,
          activityPreferences: parsed.activityPreferences || '',
        };
      }
    }
  } catch {
    // ignore storage errors
  }
  return { ability: 'moteur', activityPreferences: '' };
}

function loadFavorites(): Activity[] {
  try {
    const raw = localStorage.getItem(FAVORITES_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    }
  } catch {
    // ignore
  }
  return [];
}

const MapPage: React.FC = () => {
  const location = useLocation();
  const navigate = useNavigate();

  const [userInfo] = useState<UserInfo>(() => getInitialUserInfo(location.state));
  const [activities, setActivities] = useState<Activity[]>([]);
  const [favorites, setFavorites] = useState<Activity[]>(() => loadFavorites());
  const [selectedActivity, setSelectedActivity] = useState<Activity | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isMapReady, setIsMapReady] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  const [mapCenter, setMapCenter] = useState<{ lat: number; lng: number }>(DEFAULT_CENTER);
  const [userLocation, setUserLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [bounds, setBounds] = useState<MapBounds>({
    north: 48.8866,
    south: 48.8266,
    east: 2.3922,
    west: 2.3122,
  });

  // Search & Filters
  const [cityQuery, setCityQuery] = useState('');
  const [cityResults, setCityResults] = useState<GeocodingResult[]>([]);
  const [isSearchingCity, setIsSearchingCity] = useState(false);
  const [activeCategory, setActiveCategory] = useState<'Toutes' | ActivityCategory | 'Favoris'>('Toutes');
  const [textFilter, setTextFilter] = useState('');

  const activityInfoRef = useRef<HTMLDivElement | null>(null);

  // Save favorites to localStorage
  useEffect(() => {
    try {
      localStorage.setItem(FAVORITES_STORAGE_KEY, JSON.stringify(favorites));
    } catch {
      // ignore
    }
  }, [favorites]);

  // Try initial geolocation silently
  useEffect(() => {
    if (!('geolocation' in navigator)) return;
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const coords = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        setUserLocation(coords);
        setMapCenter(coords);
      },
      () => {
        // Silently keep default center if user denies GPS
      },
      { timeout: 6000, maximumAge: 60000 }
    );
  }, []);

  const handleBoundsChange = useCallback((newBounds: MapBounds, newCenter: { lat: number; lng: number }) => {
    setBounds(newBounds);
    setMapCenter(newCenter);
  }, []);

  const loadSuggestionsForCoords = useCallback(
    async (lat: number, lng: number, targetBounds?: MapBounds) => {
      setIsLoading(true);
      setStatusMessage(null);
      try {
        const data = await fetchActivities(lat, lng, targetBounds ?? bounds, userInfo);
        const withIds = data.map((act) => ({
          ...act,
          id: act.id || uuidv4(),
        }));
        setActivities(withIds);
        setSelectedActivity(withIds[0] ?? null);
        setActiveCategory('Toutes');

        if (withIds.length > 0 && withIds[0].source === 'curated') {
          setStatusMessage(
            "Affichage de suggestions adaptées pour cette zone (données OpenStreetMap indisponibles ou limitées ici)."
          );
        }
      } catch {
        setStatusMessage("Impossible de récupérer les activités pour le moment.");
      } finally {
        setIsLoading(false);
      }
    },
    [bounds, userInfo]
  );

  const handleSearchInArea = useCallback(() => {
    loadSuggestionsForCoords(mapCenter.lat, mapCenter.lng, bounds);
  }, [loadSuggestionsForCoords, mapCenter, bounds]);

  const handleLocateAndSearch = useCallback(() => {
    if (!('geolocation' in navigator)) {
      setStatusMessage("Géolocalisation non supportée. Recherche autour du centre de la carte.");
      loadSuggestionsForCoords(mapCenter.lat, mapCenter.lng, bounds);
      return;
    }

    setIsLoading(true);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const coords = { lat: position.coords.latitude, lng: position.coords.longitude };
        setUserLocation(coords);
        setMapCenter(coords);
        const gpsBounds: MapBounds = {
          north: coords.lat + 0.025,
          south: coords.lat - 0.025,
          east: coords.lng + 0.035,
          west: coords.lng - 0.035,
        };
        loadSuggestionsForCoords(coords.lat, coords.lng, gpsBounds);
      },
      () => {
        setStatusMessage("Position GPS indisponible ou refusée : recherche effectuée sur la zone affichée.");
        loadSuggestionsForCoords(mapCenter.lat, mapCenter.lng, bounds);
      },
      { timeout: 6000, maximumAge: 30000 }
    );
  }, [bounds, loadSuggestionsForCoords, mapCenter]);

  const handleCitySearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!cityQuery.trim()) return;
    setIsSearchingCity(true);
    setStatusMessage(null);
    try {
      const results = await searchLocation(cityQuery);
      setCityResults(results);
      if (results.length === 0) {
        setStatusMessage(`Aucun lieu trouvé pour "${cityQuery}".`);
      }
    } catch {
      setStatusMessage("Erreur lors de la recherche d'adresse.");
    } finally {
      setIsSearchingCity(false);
    }
  };

  const handleSelectCity = (item: GeocodingResult) => {
    const newCenter = { lat: item.lat, lng: item.lng };
    setMapCenter(newCenter);
    setCityResults([]);
    setCityQuery(item.display_name.split(',')[0]);
    const newBounds: MapBounds = {
      north: item.lat + 0.025,
      south: item.lat - 0.025,
      east: item.lng + 0.035,
      west: item.lng - 0.035,
    };
    loadSuggestionsForCoords(item.lat, item.lng, newBounds);
  };

  const toggleFavorite = (activity: Activity) => {
    setFavorites((prev) => {
      const exists = prev.some((f) => f.id === activity.id);
      return exists ? prev.filter((f) => f.id !== activity.id) : [...prev, activity];
    });
  };

  const isFavorite = (id: string) => favorites.some((f) => f.id === id);

  const handleMarkerClick = useCallback((activity: Activity) => {
    setSelectedActivity(activity);
    activityInfoRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }, []);

  const filteredActivities = useMemo(() => {
    const baseList = activeCategory === 'Favoris' ? favorites : activities;
    return baseList
      .filter((act) => {
        if (activeCategory !== 'Toutes' && activeCategory !== 'Favoris' && act.category !== activeCategory) {
          return false;
        }
        if (textFilter.trim()) {
          const q = textFilter.toLowerCase();
          return (
            act.name.toLowerCase().includes(q) ||
            act.description.toLowerCase().includes(q) ||
            (act.accessibility || '').toLowerCase().includes(q)
          );
        }
        return true;
      })
      .sort((a, b) => {
        const refPoint = userLocation || mapCenter;
        return (
          calculateDistanceKm(refPoint.lat, refPoint.lng, a.lat, a.lng) -
          calculateDistanceKm(refPoint.lat, refPoint.lng, b.lat, b.lng)
        );
      });
  }, [activities, favorites, activeCategory, textFilter, userLocation, mapCenter]);

  const refPoint = userLocation || mapCenter;

  return (
    <div className="container py-3 map-page-container">
      {isLoading && <LoadingOverlay />}

      <header className="d-flex flex-wrap align-items-center justify-content-between gap-2 mb-3 pb-2 border-bottom">
        <div className="d-flex align-items-center gap-3">
          <img
            src={logo}
            className="map-logo"
            alt="Logo GoodMaps"
            onClick={() => navigate('/')}
            style={{ cursor: 'pointer' }}
          />
          <div className="text-start">
            <span className="badge bg-secondary me-2">
              {ABILITY_LABELS[userInfo.ability] || userInfo.ability}
            </span>
            {userInfo.activityPreferences && (
              <span className="badge bg-light text-dark border">
                {userInfo.activityPreferences}
              </span>
            )}
          </div>
        </div>

        <button
          type="button"
          className="btn btn-outline-secondary btn-sm"
          onClick={() => navigate('/')}
        >
          Modifier mon profil
        </button>
      </header>

      {/* City Search & Action Buttons */}
      <div className="row g-2 mb-3 align-items-start">
        <div className="col-md-6 position-relative">
          <form onSubmit={handleCitySearch} className="input-group">
            <input
              type="text"
              className="form-control"
              placeholder="Rechercher une ville ou adresse (ex: Lyon, Bordeaux...)"
              value={cityQuery}
              onChange={(e) => setCityQuery(e.target.value)}
              aria-label="Rechercher une ville ou adresse"
            />
            <button
              type="submit"
              className="btn btn-outline-dark"
              disabled={isSearchingCity}
            >
              {isSearchingCity ? '...' : 'Chercher'}
            </button>
          </form>

          {cityResults.length > 0 && (
            <ul className="list-group position-absolute w-100 shadow city-dropdown">
              {cityResults.map((res, idx) => (
                <li key={`${res.lat}-${res.lng}-${idx}`} className="list-group-item p-0">
                  <button
                    type="button"
                    className="btn btn-link text-start text-dark text-decoration-none w-100 px-3 py-2 small"
                    onClick={() => handleSelectCity(res)}
                  >
                    {res.display_name}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="col-md-6 d-flex flex-wrap gap-2">
          <button
            type="button"
            onClick={handleSearchInArea}
            className={`suggestButton flex-grow-1 mb-0 ${!isMapReady ? 'disabled' : ''}`}
            disabled={!isMapReady || isLoading}
          >
            Rechercher dans cette zone
          </button>
          <button
            type="button"
            onClick={handleLocateAndSearch}
            className="btn btn-primary"
            disabled={!isMapReady || isLoading}
            title="Utiliser ma position GPS"
          >
            Autour de moi
          </button>
        </div>
      </div>

      {statusMessage && (
        <div className="alert alert-info py-2 px-3 small text-start mb-3" role="status">
          {statusMessage}
        </div>
      )}

      {/* Main Split View: Map + Results */}
      <div className="row g-3">
        <div className="col-lg-7">
          <GoogleMapComponent
            activities={filteredActivities}
            selectedActivityId={selectedActivity?.id}
            center={mapCenter}
            userLocation={userLocation}
            onMarkerClick={handleMarkerClick}
            onMapLoad={() => setIsMapReady(true)}
            onBoundsChange={handleBoundsChange}
          />

          {selectedActivity && (
            <div ref={activityInfoRef} className="activity-info text-start mt-3">
              <div className="d-flex justify-content-between align-items-start gap-2">
                <div>
                  <h2 className="h5 mb-1 activityName">{selectedActivity.name}</h2>
                  <div className="d-flex flex-wrap gap-1 mb-2">
                    {selectedActivity.category && (
                      <span className="badge bg-dark">{selectedActivity.category}</span>
                    )}
                    {selectedActivity.accessibility && (
                      <span className="badge bg-success">{selectedActivity.accessibility}</span>
                    )}
                    <span className="badge bg-light text-dark border">
                      {formatDistance(
                        calculateDistanceKm(
                          refPoint.lat,
                          refPoint.lng,
                          selectedActivity.lat,
                          selectedActivity.lng
                        )
                      )}
                    </span>
                  </div>
                </div>
                <button
                  type="button"
                  className={`btn btn-sm ${isFavorite(selectedActivity.id) ? 'btn-warning' : 'btn-outline-warning'}`}
                  onClick={() => toggleFavorite(selectedActivity)}
                  aria-label="Ajouter ou retirer des favoris"
                >
                  {isFavorite(selectedActivity.id) ? '★ Favori' : '☆ Favori'}
                </button>
              </div>

              <p className="mb-2">{selectedActivity.description}</p>

              {selectedActivity.address && (
                <p className="small mb-1">
                  <strong>Adresse :</strong> {selectedActivity.address}
                </p>
              )}
              {selectedActivity.opening_hours && (
                <p className="activityOpening small mb-2">
                  <strong>Horaires :</strong> {selectedActivity.opening_hours}
                </p>
              )}

              <div className="d-flex flex-wrap gap-3 mt-2 align-items-center">
                <a
                  href={`https://www.google.com/maps/dir/?api=1&destination=${selectedActivity.lat},${selectedActivity.lng}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="btn btn-sm btn-outline-primary"
                >
                  Itinéraire
                </a>

                {selectedActivity.booking_link && (
                  <a
                    href={selectedActivity.booking_link}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="link d-inline-flex align-items-center gap-1"
                  >
                    <img src={AddCircleIcon} alt="" width={18} height={18} /> Site / Réserver
                  </a>
                )}

                {selectedActivity.phone_number && (
                  <a
                    href={`tel:${selectedActivity.phone_number}`}
                    className="link d-inline-flex align-items-center gap-1"
                  >
                    <img src={PlayCircleIcon} alt="" width={18} height={18} /> Appeler
                  </a>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Sidebar: Filters & Activity List */}
        <div className="col-lg-5 text-start">
          <div className="card shadow-sm">
            <div className="card-body">
              <div className="d-flex justify-content-between align-items-center mb-2">
                <h2 className="h6 mb-0 fw-bold">
                  Activités ({filteredActivities.length})
                </h2>
              </div>

              <input
                type="search"
                className="form-control form-control-sm mb-2"
                placeholder="Filtrer par mot-clé..."
                value={textFilter}
                onChange={(e) => setTextFilter(e.target.value)}
                aria-label="Filtrer les activités par mot-clé"
              />

              <div className="d-flex flex-wrap gap-1 mb-3">
                {CATEGORIES.map((cat) => (
                  <button
                    key={cat}
                    type="button"
                    onClick={() => setActiveCategory(cat)}
                    className={`chip-btn btn-sm ${activeCategory === cat ? 'active' : ''}`}
                  >
                    {cat === 'Favoris' ? `Favoris (${favorites.length})` : cat}
                  </button>
                ))}
              </div>

              <div className="activity-list">
                {filteredActivities.length === 0 ? (
                  <p className="text-muted small mb-0">
                    {activeCategory === 'Favoris'
                      ? 'Aucun favori enregistré pour le moment.'
                      : 'Cliquez sur « Rechercher dans cette zone » ou « Autour de moi » pour afficher des activités.'}
                  </p>
                ) : (
                  filteredActivities.map((act, idx) => {
                    const selected = selectedActivity?.id === act.id;
                    const dist = formatDistance(
                      calculateDistanceKm(refPoint.lat, refPoint.lng, act.lat, act.lng)
                    );
                    return (
                      <div
                        key={act.id}
                        className={`activity-list-item p-2 mb-2 rounded border ${
                          selected ? 'selected' : ''
                        }`}
                        onClick={() => {
                          setSelectedActivity(act);
                          setMapCenter({ lat: act.lat, lng: act.lng });
                        }}
                        role="button"
                        tabIndex={0}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault();
                            setSelectedActivity(act);
                            setMapCenter({ lat: act.lat, lng: act.lng });
                          }
                        }}
                      >
                        <div className="d-flex justify-content-between align-items-start gap-2">
                          <div className="fw-semibold small">
                            <span className="badge bg-danger me-1">{idx + 1}</span>
                            {act.name}
                          </div>
                          <span className="text-muted small text-nowrap">{dist}</span>
                        </div>
                        <div className="small text-muted text-truncate mt-1">
                          {act.accessibility || act.description}
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default MapPage;
