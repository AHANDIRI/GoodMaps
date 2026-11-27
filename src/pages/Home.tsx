import '../App.css';
import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import logo from '../assets/logo-goodmaps.png';
import { UserInfo } from '../types';

const STORAGE_KEY = 'goodmaps_user_info';

const QUICK_PREFERENCES = [
  'Musées & Culture',
  'Parcs & Nature',
  'Sport adapté',
  'Cinéma / Théâtre',
  'Médiathèques',
  'Cafés & Restaurants',
];

const loadSavedUserInfo = (): UserInfo => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<UserInfo>;
      return {
        ability: parsed.ability || 'moteur',
        activityPreferences: parsed.activityPreferences || '',
      };
    }
  } catch {
    // ignore storage errors
  }
  return { ability: 'moteur', activityPreferences: '' };
};

const Home: React.FC = () => {
  const saved = loadSavedUserInfo();
  const [ability, setAbility] = useState(saved.ability);
  const [activityPreferences, setActivityPreferences] = useState(saved.activityPreferences);
  const navigate = useNavigate();

  const handleTogglePreference = (pref: string) => {
    const current = activityPreferences
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);

    if (current.includes(pref)) {
      setActivityPreferences(current.filter((item) => item !== pref).join(', '));
    } else {
      setActivityPreferences([...current, pref].join(', '));
    }
  };

  const handleFormSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const userInfo: UserInfo = { ability, activityPreferences: activityPreferences.trim() };
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(userInfo));
    } catch {
      // ignore storage errors
    }
    navigate('/map', { state: userInfo });
  };

  return (
    <div className="container home-container">
      <div className="home-card shadow-sm">
        <img src={logo} className="img-fluid home-logo" alt="Logo GoodMaps" />
        <h1 className="home-title">Bienvenue sur GoodMaps</h1>
        <p className="home-subtitle">
          Trouvez des sorties et activités accessibles près de chez vous ou dans la ville de votre choix.
        </p>

        <form onSubmit={handleFormSubmit} className="text-start">
          <div className="mb-3">
            <label htmlFor="ability-select" className="form-label fw-semibold">
              Mon profil d'accessibilité :
            </label>
            <select
              id="ability-select"
              className="form-select"
              value={ability}
              onChange={(e) => setAbility(e.target.value)}
            >
              <option value="moteur">Handicap moteur (PMR)</option>
              <option value="sensoriel">Handicap sensoriel (visuel / auditif)</option>
              <option value="mental">Handicap mental</option>
              <option value="psychique">Handicap psychique</option>
              <option value="cognitif">Handicap cognitif</option>
              <option value="multi">Multi handicap</option>
              <option value="valide">Sans handicap</option>
            </select>
          </div>

          <div className="mb-3">
            <label htmlFor="preferences-input" className="form-label fw-semibold">
              Préférences d'activités (optionnel) :
            </label>
            <input
              id="preferences-input"
              className="form-control"
              type="text"
              value={activityPreferences}
              onChange={(e) => setActivityPreferences(e.target.value)}
              placeholder="Ex: musée, parc, natation, café..."
            />
          </div>

          <div className="mb-3">
            <span className="form-label d-block small text-muted mb-2">Suggestions rapides :</span>
            <div className="d-flex flex-wrap gap-2">
              {QUICK_PREFERENCES.map((pref) => {
                const active = activityPreferences.toLowerCase().includes(pref.toLowerCase());
                return (
                  <button
                    key={pref}
                    type="button"
                    onClick={() => handleTogglePreference(pref)}
                    className={`chip-btn ${active ? 'active' : ''}`}
                  >
                    {pref}
                  </button>
                );
              })}
            </div>
          </div>

          <button type="submit" className="helloButton">
            Explorer la carte des activités
          </button>
        </form>
      </div>
    </div>
  );
};

export default Home;
