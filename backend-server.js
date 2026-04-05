import express from 'express';
import cors from 'cors';
import { promises as fs } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const app = express();
const port = process.env.PORT || 3001;

// DOC API constants
const DOC_API_BASE = 'https://api.doc.govt.nz';
const DOC_CACHE_DIR = './data';
const DOC_CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days
const DOC_API_KEY = process.env.DOC_API_KEY || '';
const NZ_BOUNDS = { minLat: -47, maxLat: -34, minLng: 166, maxLng: 178 };

// CORS configuration for your domains and Nginx proxy
const corsOptions = {
  origin: [
    'http://localhost:3000',
    'http://localhost:5173',
    'http://127.0.0.1:5173',
    'https://upto-six.vercel.app',
    'https://upto.world',
    'http://172.105.178.48',  // Nginx proxy
    'http://localhost'        // Local Nginx proxy
  ],
  credentials: true,
  optionsSuccessStatus: 200,
  // Allow proxy headers
  allowedHeaders: [
    'Content-Type',
    'Authorization',
    'X-Requested-With',
    'X-Real-IP',
    'X-Forwarded-For',
    'X-Forwarded-Proto'
  ]
};

app.use(cors(corsOptions));
app.use(express.json());

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'Backend connected successfully!',
    server: 'Linode',
    port: port,
    proxyHeaders: {
      realIP: req.headers['x-real-ip'],
      forwardedFor: req.headers['x-forwarded-for'],
      forwardedProto: req.headers['x-forwarded-proto']
    },
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'development'
  });
});

// Trail suggestions endpoint with real API integration
app.get('/api/trails/search', async (req, res) => {
  const { title, type, location } = req.query;
  
  if (!title || !type) {
    return res.status(400).json({ error: 'Title and type are required' });
  }
  
  try {
    const suggestions = await searchTrails({ title, type, location });
    res.json({
      suggestions,
      message: `Found ${suggestions.length} trail suggestions`,
      query: { title, type, location }
    });
  } catch (error) {
    console.error('Trail search error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Trail search implementation
async function searchTrails(query) {
  const suggestions = [];
  
  try {
    // Search OSM Overpass API (free, global coverage)
    const osmResults = await searchOSMOverpass(query);
    suggestions.push(...osmResults);

    // Search DOC tracks if query appears to be in NZ
    const docResults = await searchDocTracks(query);
    suggestions.push(...docResults);

    return suggestions
      .filter(s => s.confidence > 0.6)
      .sort((a, b) => b.confidence - a.confidence)
      .slice(0, 5);
      
  } catch (error) {
    console.error('Search trails error:', error);
    return [];
  }
}

// OSM Overpass API search
async function searchOSMOverpass(query) {
  try {
    const overpassQuery = buildOverpassQuery(query);
    
    const response = await fetch('https://overpass-api.de/api/interpreter', {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain' },
      body: overpassQuery,
      signal: AbortSignal.timeout(10000)
    });
    
    if (!response.ok) {
      throw new Error(`OSM API error: ${response.status}`);
    }
    
    const data = await response.json();
    return processOSMResults(data, query);
  } catch (error) {
    console.error('OSM search error:', error);
    return [];
  }
}

function buildOverpassQuery(query) {
  const titlePattern = query.title.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  
  return `
    [out:json][timeout:25];
    (
      way["route"="hiking"]["name"~"${titlePattern}",i];
      way["highway"~"^(path|footway)$"]["name"~"${titlePattern}",i];
    );
    out geom;
  `;
}

function processOSMResults(data, query) {
  if (!data.elements || !Array.isArray(data.elements)) {
    return [];
  }
  
  return data.elements
    .filter(element => element.tags?.name)
    .map(element => {
      const coords = extractOSMCoordinates(element);
      const confidence = calculateNameSimilarity(query.title, element.tags.name);
      
      return {
        id: `osm-${element.id}`,
        name: element.tags.name,
        source: 'osm',
        confidence,
        activityType: query.type,
        location: {
          name: element.tags.name,
          coordinates: coords
        },
        distance: element.tags.distance ? parseFloat(element.tags.distance) : undefined,
        difficulty: element.tags.sac_scale || element.tags.difficulty,
        description: element.tags.description,
        metadata: {
          verified: false,
          lastUpdated: new Date(),
          tags: Object.keys(element.tags)
        }
      };
    })
    .filter(suggestion => suggestion.confidence > 0.5);
}

function extractOSMCoordinates(element) {
  if (element.geometry && element.geometry.length > 0) {
    const point = element.geometry[0];
    return [point.lat, point.lon];
  }
  return [element.lat || 0, element.lon || 0];
}

function calculateNameSimilarity(str1, str2) {
  const s1 = str1.toLowerCase();
  const s2 = str2.toLowerCase();
  
  if (s1 === s2) return 0.95;
  if (s2.includes(s1) || s1.includes(s2)) return 0.85;
  
  // Simple word overlap scoring
  const words1 = s1.split(/\s+/);
  const words2 = s2.split(/\s+/);
  const overlap = words1.filter(w => words2.some(w2 => w2.includes(w) || w.includes(w2)));
  
  return Math.min(0.9, overlap.length / Math.max(words1.length, words2.length) + 0.3);
}

// Search DOC cached tracks by name similarity
async function searchDocTracks(query) {
  try {
    const cache = await readDocCache('tracks');
    if (!cache || !cache.data) return [];

    const titlePattern = query.title.toLowerCase();
    return cache.data
      .filter(track => track.name && track.name.toLowerCase().includes(titlePattern))
      .slice(0, 5)
      .map(track => {
        const coordinates = (track.lat && track.lng) ? [track.lat, track.lng] : [0, 0];
        const regionName = Array.isArray(track.region) ? track.region.join(', ') : (track.region || 'New Zealand');

        return {
          id: `doc-${track.assetId || track.id}`,
          name: track.name,
          source: 'doc',
          confidence: calculateNameSimilarity(query.title, track.name),
          activityType: query.type,
          location: {
            name: regionName,
            coordinates
          },
          distance: track.distance ? parseFloat(track.distance) : undefined,
          difficulty: track.dificulty, // Note: DOC API typo
          description: track.introductory,
          metadata: {
            verified: true,
            lastUpdated: new Date(),
            tags: ['nz', 'doc', ...(Array.isArray(track.region) ? track.region : [track.region])].filter(Boolean)
          }
        };
      });
  } catch (error) {
    console.error('DOC track search error:', error);
    return [];
  }
}

// Adventure sharing endpoints
app.get('/api/adventures/:id', (req, res) => {
  const { id } = req.params;
  res.json({
    message: `Adventure ${id} endpoint ready`,
    adventure: null
  });
});

app.post('/api/adventures', (req, res) => {
  res.json({
    message: 'Adventure creation endpoint ready',
    id: 'generated-id'
  });
});

// DOC API cache utilities
async function readDocCache(resource) {
  try {
    const data = await fs.readFile(join(DOC_CACHE_DIR, `doc-${resource}.json`), 'utf-8');
    return JSON.parse(data);
  } catch {
    return null;
  }
}

async function writeDocCache(resource, data) {
  try {
    await fs.mkdir(DOC_CACHE_DIR, { recursive: true });
    const cacheData = {
      syncedAt: new Date().toISOString(),
      data
    };
    await fs.writeFile(
      join(DOC_CACHE_DIR, `doc-${resource}.json`),
      JSON.stringify(cacheData, null, 2)
    );
  } catch (error) {
    console.error(`Failed to write DOC cache for ${resource}:`, error);
  }
}

async function isCacheStale(resource) {
  const cache = await readDocCache(resource);
  if (!cache) return true;
  const age = Date.now() - new Date(cache.syncedAt).getTime();
  return age > DOC_CACHE_TTL_MS;
}

async function fetchDocAPI(path) {
  if (!DOC_API_KEY) {
    console.error('DOC_API_KEY not set — cannot fetch from DOC API');
    return null;
  }

  try {
    const response = await fetch(`${DOC_API_BASE}/${path}`, {
      method: 'GET',
      headers: {
        'x-api-key': DOC_API_KEY,
        'Accept': 'application/json'
      },
      signal: AbortSignal.timeout(15000)
    });

    if (!response.ok) {
      throw new Error(`DOC API error: ${response.status}`);
    }

    return await response.json();
  } catch (error) {
    console.error(`DOC API fetch failed for ${path}:`, error);
    return null;
  }
}

async function syncDocResource(resource, apiPath) {
  console.log(`Syncing DOC ${resource}...`);
  const data = await fetchDocAPI(apiPath);
  if (data) {
    await writeDocCache(resource, data);
    console.log(`✓ Synced ${resource}: ${data.length || Object.keys(data).length} records`);
    return data;
  }
  return null;
}

async function syncAllDocResources() {
  console.log('Syncing all DOC resources...');
  try {
    await Promise.all([
      syncDocResource('tracks', 'v1/tracks'),
      syncDocResource('huts', 'v2/huts'),
      syncDocResource('campsites', 'v2/campsites')
    ]);
  } catch (error) {
    console.error('Error syncing DOC resources:', error);
  }
}

// NZ bounds detection
function isNZBounds(bounds) {
  if (!bounds) return false;
  return !(
    bounds.south > NZ_BOUNDS.maxLat ||
    bounds.north < NZ_BOUNDS.minLat ||
    bounds.east < NZ_BOUNDS.minLng ||
    bounds.west > NZ_BOUNDS.maxLng
  );
}

// Haversine distance in km
function haversineDistance(lat1, lon1, lat2, lon2) {
  const R = 6371; // Earth radius in km
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

// DOC routes
app.get('/api/doc/tracks', async (req, res) => {
  const { name, region } = req.query;

  try {
    const cache = await readDocCache('tracks');
    if (!cache || !cache.data) {
      return res.status(503).json({ error: 'DOC tracks cache not available' });
    }

    let tracks = cache.data;

    if (name) {
      const nameLower = String(name).toLowerCase();
      tracks = tracks.filter(t =>
        t.name.toLowerCase().includes(nameLower)
      );
    }

    if (region) {
      const regionLower = String(region).toLowerCase();
      tracks = tracks.filter(t => {
        // region can be an array of strings (tracks) or a string (huts/campsites)
        const regions = Array.isArray(t.region) ? t.region : [t.region || ''];
        return regions.some(r => r.toLowerCase().includes(regionLower));
      });
    }

    res.json({
      source: 'doc',
      license: 'CC BY 4.0 - https://www.doc.govt.nz/',
      count: tracks.length,
      data: tracks
    });
  } catch (error) {
    console.error('DOC tracks error:', error);
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/doc/huts', async (req, res) => {
  const { region } = req.query;

  try {
    const cache = await readDocCache('huts');
    if (!cache || !cache.data) {
      return res.status(503).json({ error: 'DOC huts cache not available' });
    }

    let huts = cache.data;

    if (region) {
      const regionLower = String(region).toLowerCase();
      huts = huts.filter(h =>
        (h.region || '').toLowerCase().includes(regionLower)
      );
    }

    res.json({
      source: 'doc',
      license: 'CC BY 4.0 - https://www.doc.govt.nz/',
      count: huts.length,
      data: huts
    });
  } catch (error) {
    console.error('DOC huts error:', error);
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/doc/campsites', async (req, res) => {
  const { region } = req.query;

  try {
    const cache = await readDocCache('campsites');
    if (!cache || !cache.data) {
      return res.status(503).json({ error: 'DOC campsites cache not available' });
    }

    let campsites = cache.data;

    if (region) {
      const regionLower = String(region).toLowerCase();
      campsites = campsites.filter(c =>
        (c.region || '').toLowerCase().includes(regionLower)
      );
    }

    res.json({
      source: 'doc',
      license: 'CC BY 4.0 - https://www.doc.govt.nz/',
      count: campsites.length,
      data: campsites
    });
  } catch (error) {
    console.error('DOC campsites error:', error);
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/doc/alerts', async (req, res) => {
  try {
    const data = await fetchDocAPI('v2/alerts');
    if (!data) {
      return res.status(503).json({ error: 'DOC alerts unavailable' });
    }

    // Filter to only active alerts
    const now = new Date();
    const active = data.filter(alert => {
      const start = new Date(alert.startDate);
      const end = (alert.endDate && alert.endDate !== '') ? new Date(alert.endDate) : new Date('2099-12-31');
      return start <= now && now <= end;
    });

    res.json({
      source: 'doc',
      license: 'CC BY 4.0 - https://www.doc.govt.nz/',
      count: active.length,
      data: active,
      fetchedAt: new Date().toISOString()
    });
  } catch (error) {
    console.error('DOC alerts error:', error);
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/doc/nearby', async (req, res) => {
  const { lat, lng, radius = 20 } = req.query;

  if (!lat || !lng) {
    return res.status(400).json({ error: 'lat and lng are required' });
  }

  try {
    const userLat = parseFloat(lat);
    const userLng = parseFloat(lng);
    const maxRadius = parseFloat(radius);

    // Fetch caches and live alerts in parallel
    const [trackCache, hutCache, campsiteCache, alerts] = await Promise.all([
      readDocCache('tracks'),
      readDocCache('huts'),
      readDocCache('campsites'),
      fetchDocAPI('v2/alerts')
    ]);

    const result = {
      source: 'doc',
      license: 'CC BY 4.0 - https://www.doc.govt.nz/',
      center: { lat: userLat, lng: userLng },
      radius: maxRadius,
      tracks: [],
      huts: [],
      campsites: [],
      alerts: []
    };

    // Filter tracks by distance from center (use pre-converted lat/lng)
    if (trackCache && trackCache.data) {
      result.tracks = trackCache.data
        .filter(track => {
          if (!track.lat || !track.lng) return false;
          const dist = haversineDistance(userLat, userLng, track.lat, track.lng);
          return dist <= maxRadius;
        })
        .sort((a, b) => {
          const distA = haversineDistance(userLat, userLng, a.lat, a.lng);
          const distB = haversineDistance(userLat, userLng, b.lat, b.lng);
          return distA - distB;
        });
    }

    // Filter huts by distance
    if (hutCache && hutCache.data) {
      result.huts = hutCache.data
        .filter(hut => {
          if (!hut.lat || !hut.lng) return false;
          const dist = haversineDistance(userLat, userLng, hut.lat, hut.lng);
          return dist <= maxRadius;
        })
        .sort((a, b) => {
          const distA = haversineDistance(userLat, userLng, a.lat, a.lng);
          const distB = haversineDistance(userLat, userLng, b.lat, b.lng);
          return distA - distB;
        });
    }

    // Filter campsites by distance
    if (campsiteCache && campsiteCache.data) {
      result.campsites = campsiteCache.data
        .filter(camp => {
          if (!camp.lat || !camp.lng) return false;
          const dist = haversineDistance(userLat, userLng, camp.lat, camp.lng);
          return dist <= maxRadius;
        })
        .sort((a, b) => {
          const distA = haversineDistance(userLat, userLng, a.lat, a.lng);
          const distB = haversineDistance(userLat, userLng, b.lat, b.lng);
          return distA - distB;
        });
    }

    // Include all active alerts (region-based, not distance-filtered)
    if (alerts) {
      const now = new Date();
      result.alerts = alerts.filter(alert => {
        const start = new Date(alert.startDate);
        const end = (alert.endDate && alert.endDate !== '') ? new Date(alert.endDate) : new Date('2099-12-31');
        return start <= now && now <= end;
      });
    }

    res.json(result);
  } catch (error) {
    console.error('DOC nearby error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Trigger background sync on startup if cache is stale
async function initDOCSync() {
  try {
    const needsSync = await Promise.all([
      isCacheStale('tracks'),
      isCacheStale('huts'),
      isCacheStale('campsites')
    ]).then(results => results.some(stale => stale));

    if (needsSync) {
      console.log('DOC cache is stale or missing — starting background sync...');
      syncAllDocResources().catch(err => console.error('Initial DOC sync failed:', err));
    } else {
      console.log('DOC cache is fresh — using cached data');
    }
  } catch (error) {
    console.error('Failed to check DOC cache status:', error);
  }
}

app.listen(port, '0.0.0.0', () => {
  console.log(`Upto Backend running on http://172.105.178.48:${port}`);
  console.log(`CORS enabled for: ${corsOptions.origin.join(', ')}`);
  initDOCSync();
});