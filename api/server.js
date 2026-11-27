// api/server.js
import express from "express";
import axios from "axios";
import cors from "cors";
import dotenv from "dotenv";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3002;

app.use(cors());
app.use(express.json());

const openaiApiKey = process.env.VITE_OPENAI_API_KEY || process.env.OPENAI_API_KEY;

if (!openaiApiKey) {
  console.warn(
    "Info : VITE_OPENAI_API_KEY non définie. Le serveur utilisera OpenStreetMap (Overpass API) et des suggestions adaptées."
  );
}

app.get("/api/health", (_req, res) => {
  res.json({ ok: true, mode: openaiApiKey ? "openai" : "openstreetmap" });
});

function inferCategory(tags = {}) {
  if (tags.tourism === "museum" || tags.tourism === "gallery" || tags.amenity === "theatre" || tags.amenity === "library" || tags.amenity === "arts_centre") {
    return "Culture";
  }
  if (tags.leisure === "park" || tags.leisure === "garden" || tags.leisure === "nature_reserve") {
    return "Nature";
  }
  if (tags.leisure === "swimming_pool" || tags.leisure === "sports_centre" || tags.leisure === "fitness_centre") {
    return "Sport";
  }
  if (tags.amenity === "cafe" || tags.amenity === "restaurant") {
    return "Restauration";
  }
  if (tags.amenity === "cinema" || tags.amenity === "community_centre" || tags.tourism === "attraction" || tags.tourism === "viewpoint") {
    return "Loisirs";
  }
  return "Autre";
}

function formatAccessibility(tags = {}, ability = "valide") {
  if (tags.wheelchair === "yes") return "Accessible PMR (fauteuil roulant)";
  if (tags.wheelchair === "limited") return "Accessibilité PMR partielle";
  if (ability === "sensoriel") return "Lieu culturel / calme adapté";
  if (ability === "cognitif" || ability === "mental" || ability === "psychique") return "Environnement accueillant";
  return "Accessibilité à vérifier sur place";
}

async function fetchFromOverpass(bounds, userInfo) {
  const south = Math.max(-90, Number(bounds.south));
  const west = Math.max(-180, Number(bounds.west));
  const north = Math.min(90, Number(bounds.north));
  const east = Math.min(180, Number(bounds.east));

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

  const response = await axios.post(
    "https://overpass-api.de/api/interpreter",
    `data=${encodeURIComponent(query)}`,
    {
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      timeout: 13000,
    }
  );

  const elements = response.data?.elements || [];
  const ability = userInfo?.ability || "valide";
  const pref = (userInfo?.activityPreferences || "").toLowerCase().trim();

  const mapped = elements
    .map((el) => {
      const lat = el.lat ?? el.center?.lat;
      const lng = el.lon ?? el.center?.lon;
      const tags = el.tags || {};
      if (!lat || !lng || !tags.name) return null;

      const category = inferCategory(tags);
      const accessibility = formatAccessibility(tags, ability);
      const addressParts = [tags["addr:housenumber"], tags["addr:street"], tags["addr:city"]].filter(Boolean);
      const address = addressParts.length > 0 ? addressParts.join(" ") : undefined;

      const descParts = [
        `${category} — ${accessibility}.`,
        tags.description || (address ? `Situé à ${address}.` : "Lieu identifié via OpenStreetMap."),
      ];

      let score = 0;
      if (tags.wheelchair === "yes") score += 4;
      else if (tags.wheelchair === "limited") score += 2;
      if (pref && (`${tags.name} ${category} ${tags.description || ""}`).toLowerCase().includes(pref)) {
        score += 5;
      }

      return {
        score,
        activity: {
          id: `osm-${el.type}-${el.id}`,
          name: tags.name,
          description: descParts.join(" "),
          lat,
          lng,
          category,
          accessibility,
          address,
          opening_hours: tags.opening_hours || undefined,
          booking_link: tags.website || tags["contact:website"] || undefined,
          phone_number: tags.phone || tags["contact:phone"] || undefined,
          source: "openstreetmap",
        },
      };
    })
    .filter(Boolean)
    .sort((a, b) => b.score - a.score)
    .slice(0, 12)
    .map((item) => item.activity);

  return mapped;
}

function buildCuratedFallback(latitude, longitude, userInfo) {
  const ability = userInfo?.ability || "valide";
  const pref = userInfo?.activityPreferences ? ` (${userInfo.activityPreferences})` : "";
  const offsets = [
    { dLat: 0.004, dLng: 0.005, name: "Parc & Promenade Accessible", cat: "Nature", acc: "Chemins stabilisés PMR", hours: "08h00 - 20h00" },
    { dLat: -0.005, dLng: 0.006, name: "Musée Municipal & Visite Adaptée", cat: "Culture", acc: "Accessible PMR & audioguides", hours: "10h00 - 18h00" },
    { dLat: 0.006, dLng: -0.004, name: "Médiathèque & Espace Calme", cat: "Culture", acc: "Adapté sensoriel & cognitif", hours: "09h30 - 18h30" },
    { dLat: -0.003, dLng: -0.006, name: "Centre Aquatique & Sportif Adapté", cat: "Sport", acc: "Mise à l'eau PMR disponible", hours: "09h00 - 21h00" },
    { dLat: 0.002, dLng: 0.008, name: "Café Associatif & Rencontres", cat: "Restauration", acc: "Plain-pied & accueil bienveillant", hours: "08h30 - 19h00" },
  ];

  return offsets.map((item, idx) => ({
    id: `curated-${idx + 1}`,
    name: item.name,
    description: `Suggestion adaptée pour le profil "${ability}"${pref}. Pensez à vérifier les conditions d'accueil avant votre visite.`,
    lat: Number((latitude + item.dLat).toFixed(6)),
    lng: Number((longitude + item.dLng).toFixed(6)),
    category: item.cat,
    accessibility: item.acc,
    opening_hours: item.hours,
    source: "curated",
  }));
}

app.post("/api/suggestions", async (req, res) => {
  const { latitude, longitude, north, south, east, west, userInfo } = req.body;

  if (
    latitude === undefined ||
    longitude === undefined ||
    north === undefined ||
    south === undefined ||
    east === undefined ||
    west === undefined
  ) {
    return res.status(400).json({
      error: "Latitude, longitude, et les limites de la carte (north, south, east, west) sont requis.",
    });
  }

  // 1. Try OpenAI if key is configured
  if (openaiApiKey) {
    const userMessageContent = `Génère une liste de 6 activités adaptées et réelles pour une personne ayant le profil "${
      userInfo?.ability || "valide"
    }", se trouvant autour de la latitude ${latitude} et longitude ${longitude} (zone: nord ${north}, sud ${south}, est ${east}, ouest ${west})${
      userInfo?.activityPreferences
        ? `, avec des préférences pour : ${userInfo.activityPreferences}`
        : ""
    }. Retourne uniquement un JSON valide avec un tableau 'activities' contenant pour chaque élément :
    - 'name' : nom de l'activité
    - 'description' : description concise incluant l'accessibilité
    - 'lat' et 'lng' : coordonnées numériques dans la zone
    - 'category' : parmi Culture, Nature, Sport, Loisirs, Restauration, Autre
    - 'accessibility' : niveau d'accessibilité
    - 'opening_hours' : horaires d'ouverture (optionnel)
    - 'booking_link' : URL (optionnel)
    - 'phone_number' : téléphone (optionnel)`;

    try {
      const response = await axios.post(
        "https://api.openai.com/v1/chat/completions",
        {
          model: "gpt-4o-mini",
          messages: [
            { role: "system", content: "Tu es un assistant spécialisé dans les sorties et activités accessibles. Réponds uniquement en JSON valide." },
            { role: "user", content: userMessageContent },
          ],
          max_tokens: 1500,
          temperature: 0.7,
        },
        {
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${openaiApiKey}`,
          },
          timeout: 15000,
        }
      );

      const rawText = response.data.choices[0]?.message?.content?.trim() || "";
      const cleaned = rawText.replace(/^```json\s*/i, "").replace(/```$/, "").trim();
      const parsed = JSON.parse(cleaned);
      if (Array.isArray(parsed.activities) && parsed.activities.length > 0) {
        return res.json({
          activities: parsed.activities.map((a) => ({ ...a, source: "openai" })),
        });
      }
    } catch (err) {
      console.warn("OpenAI indisponible, bascule vers OpenStreetMap :", err.message);
    }
  }

  // 2. Fallback to OpenStreetMap Overpass API
  try {
    const osmActivities = await fetchFromOverpass({ north, south, east, west }, userInfo);
    if (osmActivities.length > 0) {
      return res.json({ activities: osmActivities });
    }
  } catch (err) {
    console.warn("Overpass API indisponible, bascule vers suggestions locales :", err.message);
  }

  // 3. Final curated fallback so the user always gets results
  const fallback = buildCuratedFallback(Number(latitude), Number(longitude), userInfo);
  return res.json({ activities: fallback });
});

app.listen(PORT, () => {
  console.log(`Serveur API démarré sur http://localhost:${PORT}`);
});
