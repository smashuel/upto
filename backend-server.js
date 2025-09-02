import express from 'express';
import cors from 'cors';

const app = express();
const port = process.env.PORT || 3001;

// CORS configuration for your domains and Nginx proxy
const corsOptions = {
  origin: [
    'http://localhost:3000',
    'http://localhost:5173',
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
    
    // Add mock high-confidence results for testing
    if (query.title.toLowerCase().includes('mount') || query.title.toLowerCase().includes('trail')) {
      suggestions.push({
        id: `mock-${Date.now()}`,
        name: `${query.title} - Popular Route`,
        source: 'local',
        confidence: 0.9,
        activityType: query.type,
        location: {
          name: query.location || 'Pacific Northwest',
          coordinates: [44.5, -121.5]
        },
        distance: 12.5,
        elevationGain: 800,
        difficulty: 'moderate',
        description: `Well-maintained ${query.type} trail with scenic views`,
        metadata: {
          verified: true,
          lastUpdated: new Date(),
          userRating: 4.2,
          tags: ['scenic', 'moderate', 'popular']
        }
      });
    }
    
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

app.listen(port, '0.0.0.0', () => {
  console.log(`Upto Backend running on http://172.105.178.48:${port}`);
  console.log(`CORS enabled for: ${corsOptions.origin.join(', ')}`);
});