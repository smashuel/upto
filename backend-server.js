import express from 'express';
import cors from 'cors';
import { promises as fs } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import pg from 'pg';
import crypto from 'crypto';

const { Pool } = pg;

// ── PostgreSQL connection ──────────────────────────────────────────────────────
const db = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://upto_user:Rowdy050@127.0.0.1:5432/upto_db'
});

// ── Password hashing (no bcrypt dep — uses Node built-in crypto) ──────────────
function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${hash}`;
}

function verifyPassword(password, stored) {
  const [salt, hash] = stored.split(':');
  const derived = crypto.scryptSync(password, salt, 64).toString('hex');
  return crypto.timingSafeEqual(Buffer.from(hash, 'hex'), Buffer.from(derived, 'hex'));
}

// Bootstrap schema on startup (idempotent)
async function initDB() {
  try {
    await db.query(`
      CREATE TABLE IF NOT EXISTS users (
        id            TEXT PRIMARY KEY,
        email         TEXT UNIQUE NOT NULL,
        name          TEXT NOT NULL,
        password_hash TEXT NOT NULL,
        session_token TEXT UNIQUE,
        created_at    TIMESTAMPTZ DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS contacts (
        id           SERIAL PRIMARY KEY,
        user_id      TEXT REFERENCES users(id) ON DELETE CASCADE,
        name         TEXT NOT NULL,
        email        TEXT,
        phone        TEXT,
        relationship TEXT,
        is_favourite BOOLEAN DEFAULT FALSE,
        created_at   TIMESTAMPTZ DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS triplinks (
        id                   TEXT PRIMARY KEY,
        user_id              TEXT REFERENCES users(id) ON DELETE SET NULL,
        share_token          TEXT UNIQUE NOT NULL,
        data                 JSONB NOT NULL,
        status               TEXT NOT NULL DEFAULT 'planned',
        created_at           TIMESTAMPTZ DEFAULT NOW(),
        expected_return_time TIMESTAMPTZ,
        started_at           TIMESTAMPTZ,
        last_check_in        TIMESTAMPTZ,
        overdue_since        TIMESTAMPTZ
      );

      CREATE TABLE IF NOT EXISTS check_ins (
        id             SERIAL PRIMARY KEY,
        trip_id        TEXT REFERENCES triplinks(id) ON DELETE CASCADE,
        checked_in_at  TIMESTAMPTZ DEFAULT NOW(),
        message        TEXT,
        location_w3w   TEXT
      );

      CREATE INDEX IF NOT EXISTS idx_users_email            ON users(email);
      CREATE INDEX IF NOT EXISTS idx_users_session_token    ON users(session_token);
      CREATE INDEX IF NOT EXISTS idx_contacts_user_id       ON contacts(user_id);
      CREATE INDEX IF NOT EXISTS idx_triplinks_share_token  ON triplinks(share_token);
      CREATE INDEX IF NOT EXISTS idx_triplinks_status       ON triplinks(status);
      CREATE INDEX IF NOT EXISTS idx_triplinks_user_id      ON triplinks(user_id);
    `);
    // Add user_id column to existing triplinks table if missing (migration)
    await db.query(`
      ALTER TABLE triplinks ADD COLUMN IF NOT EXISTS user_id TEXT REFERENCES users(id) ON DELETE SET NULL;
    `);
    console.log('Database schema ready');
  } catch (err) {
    console.error('DB init error:', err.message);
  }
}

// ── SSE client registry (in-memory — ephemeral connections) ───────────────────
const sseClients = new Map(); // shareToken → Set<Response>

function sseAdd(shareToken, res) {
  if (!sseClients.has(shareToken)) sseClients.set(shareToken, new Set());
  sseClients.get(shareToken).add(res);
}

function sseRemove(shareToken, res) {
  const clients = sseClients.get(shareToken);
  if (clients) {
    clients.delete(res);
    if (clients.size === 0) sseClients.delete(shareToken);
  }
}

function broadcast(shareToken, eventName, data) {
  const clients = sseClients.get(shareToken);
  if (!clients || clients.size === 0) return;
  const payload = `event: ${eventName}\ndata: ${JSON.stringify(data)}\n\n`;
  clients.forEach(res => {
    try { res.write(payload); } catch (_) { sseRemove(shareToken, res); }
  });
}

// ── Overdue checker (runs every 60 s) ─────────────────────────────────────────
const OVERDUE_GRACE_MS = 15 * 60 * 1000; // 15 minutes

setInterval(async () => {
  try {
    const { rows } = await db.query(`
      SELECT id, share_token, expected_return_time
      FROM   triplinks
      WHERE  status = 'active'
        AND  expected_return_time IS NOT NULL
    `);
    const now = Date.now();
    for (const row of rows) {
      const returnTime = new Date(row.expected_return_time).getTime();
      if (now > returnTime + OVERDUE_GRACE_MS) {
        const overdueSince = new Date().toISOString();
        await db.query(
          `UPDATE triplinks SET status = 'overdue', overdue_since = NOW() WHERE id = $1`,
          [row.id]
        );
        broadcast(row.share_token, 'overdue', { overdueSince });
        console.log(`TripLink ${row.id} marked overdue`);
      }
    }
  } catch (err) {
    console.error('Overdue checker error:', err.message);
  }
}, 60_000);

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
    'https://www.upto.world',
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

// ── Google OAuth config ───────────────────────────────────────────────────────
const GOOGLE_CLIENT_ID     = process.env.GOOGLE_CLIENT_ID     || '';
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET || '';
// The public-facing URL of this backend (used as redirect_uri for OAuth)
const BACKEND_URL = process.env.BACKEND_URL || 'http://172.105.178.48';

// ── Auth middleware ───────────────────────────────────────────────────────────
async function requireAuth(req, res, next) {
  const auth = req.headers.authorization;
  if (!auth || !auth.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Authentication required' });
  }
  const token = auth.slice(7);
  try {
    const { rows } = await db.query(
      `SELECT id, email, name FROM users WHERE session_token = $1`, [token]
    );
    if (rows.length === 0) return res.status(401).json({ error: 'Invalid or expired session' });
    req.user = rows[0];
    next();
  } catch (err) {
    res.status(500).json({ error: 'Auth check failed' });
  }
}

// ── Auth endpoints ────────────────────────────────────────────────────────────

// POST /api/auth/register
app.post('/api/auth/register', async (req, res) => {
  const { email, name, password } = req.body || {};
  if (!email || !name || !password) {
    return res.status(400).json({ error: 'email, name and password are required' });
  }
  if (password.length < 8) {
    return res.status(400).json({ error: 'Password must be at least 8 characters' });
  }
  try {
    const id = `user-${Date.now()}-${crypto.randomUUID().slice(0, 8)}`;
    const sessionToken = crypto.randomUUID();
    const passwordHash = hashPassword(password);
    await db.query(
      `INSERT INTO users (id, email, name, password_hash, session_token)
       VALUES ($1, $2, $3, $4, $5)`,
      [id, email.toLowerCase().trim(), name.trim(), passwordHash, sessionToken]
    );
    res.status(201).json({ sessionToken, user: { id, email: email.toLowerCase().trim(), name: name.trim() } });
  } catch (err) {
    if (err.code === '23505') {
      return res.status(409).json({ error: 'An account with this email already exists' });
    }
    console.error('Register error:', err.message);
    res.status(500).json({ error: 'Registration failed' });
  }
});

// POST /api/auth/login
app.post('/api/auth/login', async (req, res) => {
  const { email, password } = req.body || {};
  if (!email || !password) {
    return res.status(400).json({ error: 'email and password are required' });
  }
  try {
    const { rows } = await db.query(
      `SELECT id, email, name, password_hash FROM users WHERE email = $1`,
      [email.toLowerCase().trim()]
    );
    if (rows.length === 0 || !verifyPassword(password, rows[0].password_hash)) {
      return res.status(401).json({ error: 'Incorrect email or password' });
    }
    const sessionToken = crypto.randomUUID();
    await db.query(`UPDATE users SET session_token = $1 WHERE id = $2`, [sessionToken, rows[0].id]);
    res.json({ sessionToken, user: { id: rows[0].id, email: rows[0].email, name: rows[0].name } });
  } catch (err) {
    console.error('Login error:', err.message);
    res.status(500).json({ error: 'Login failed' });
  }
});

// GET /api/auth/me
app.get('/api/auth/me', requireAuth, (req, res) => {
  res.json({ user: req.user });
});

// POST /api/auth/logout
app.post('/api/auth/logout', requireAuth, async (req, res) => {
  await db.query(`UPDATE users SET session_token = NULL WHERE id = $1`, [req.user.id]);
  res.json({ ok: true });
});

// GET /api/auth/google — redirect user to Google consent screen
app.get('/api/auth/google', (req, res) => {
  if (!GOOGLE_CLIENT_ID) {
    return res.status(503).json({ error: 'Google OAuth not configured' });
  }
  // Encode the frontend origin in state so we can redirect back after auth
  const origin = req.query.origin || 'https://upto.world';
  const state = Buffer.from(JSON.stringify({ origin })).toString('base64url');
  const redirectUri = `${BACKEND_URL}/api/auth/google/callback`;

  const url = new URL('https://accounts.google.com/o/oauth2/v2/auth');
  url.searchParams.set('client_id', GOOGLE_CLIENT_ID);
  url.searchParams.set('redirect_uri', redirectUri);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('scope', 'openid email profile');
  url.searchParams.set('state', state);
  url.searchParams.set('prompt', 'select_account');

  res.redirect(url.toString());
});

// GET /api/auth/google/callback — Google redirects here with ?code=...
app.get('/api/auth/google/callback', async (req, res) => {
  const { code, state, error } = req.query;

  // Decode origin from state
  let origin = 'https://upto.world';
  try {
    origin = JSON.parse(Buffer.from(String(state), 'base64url').toString()).origin;
  } catch { /* use default */ }

  if (error || !code) {
    return res.redirect(`${origin}/login?error=google_cancelled`);
  }

  try {
    const redirectUri = `${BACKEND_URL}/api/auth/google/callback`;

    // Exchange authorisation code for access token
    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code:          String(code),
        client_id:     GOOGLE_CLIENT_ID,
        client_secret: GOOGLE_CLIENT_SECRET,
        redirect_uri:  redirectUri,
        grant_type:    'authorization_code',
      }),
    });
    const tokens = await tokenRes.json();

    if (!tokens.access_token) {
      console.error('Google token exchange failed:', tokens);
      return res.redirect(`${origin}/login?error=google_failed`);
    }

    // Fetch the user's Google profile
    const userRes = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
      headers: { Authorization: `Bearer ${tokens.access_token}` },
    });
    const gUser = await userRes.json();

    if (!gUser.email) {
      return res.redirect(`${origin}/login?error=google_failed`);
    }

    const email = gUser.email.toLowerCase().trim();
    const sessionToken = crypto.randomUUID();

    // Find existing user or create a new one
    const { rows } = await db.query(
      `SELECT id FROM users WHERE email = $1`, [email]
    );

    if (rows.length > 0) {
      // Existing user — refresh session
      await db.query(
        `UPDATE users SET session_token = $1 WHERE id = $2`,
        [sessionToken, rows[0].id]
      );
    } else {
      // New user — create account (no usable password; Google-only login)
      const id = `user-${Date.now()}-${crypto.randomUUID().slice(0, 8)}`;
      const dummyHash = hashPassword(crypto.randomUUID()); // unguessable, never used
      await db.query(
        `INSERT INTO users (id, email, name, password_hash, session_token)
         VALUES ($1, $2, $3, $4, $5)`,
        [id, email, gUser.name || email.split('@')[0], dummyHash, sessionToken]
      );
    }

    // Redirect back to frontend with the session token in the URL
    res.redirect(`${origin}/login?session=${sessionToken}`);
  } catch (err) {
    console.error('Google OAuth callback error:', err.message);
    res.redirect(`${origin}/login?error=google_failed`);
  }
});

// ── Contacts endpoints ────────────────────────────────────────────────────────

// GET /api/contacts — list contacts for authenticated user (favourites first)
app.get('/api/contacts', requireAuth, async (req, res) => {
  try {
    const { rows } = await db.query(
      `SELECT id, name, email, phone, relationship, is_favourite, created_at
       FROM contacts WHERE user_id = $1
       ORDER BY is_favourite DESC, name ASC`,
      [req.user.id]
    );
    res.json(rows);
  } catch (err) {
    console.error('List contacts error:', err.message);
    res.status(500).json({ error: 'Failed to fetch contacts' });
  }
});

// POST /api/contacts — create a contact
app.post('/api/contacts', requireAuth, async (req, res) => {
  const { name, email, phone, relationship, isFavourite } = req.body || {};
  if (!name) return res.status(400).json({ error: 'name is required' });
  try {
    const { rows } = await db.query(
      `INSERT INTO contacts (user_id, name, email, phone, relationship, is_favourite)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id, name, email, phone, relationship, is_favourite`,
      [req.user.id, name.trim(), email || null, phone || null, relationship || null, isFavourite || false]
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    console.error('Create contact error:', err.message);
    res.status(500).json({ error: 'Failed to create contact' });
  }
});

// PATCH /api/contacts/:id — update a contact
app.patch('/api/contacts/:id', requireAuth, async (req, res) => {
  const { id } = req.params;
  const { name, email, phone, relationship, isFavourite } = req.body || {};
  try {
    const { rows } = await db.query(
      `UPDATE contacts
       SET name = COALESCE($1, name),
           email = COALESCE($2, email),
           phone = COALESCE($3, phone),
           relationship = COALESCE($4, relationship),
           is_favourite = COALESCE($5, is_favourite)
       WHERE id = $6 AND user_id = $7
       RETURNING id, name, email, phone, relationship, is_favourite`,
      [name || null, email || null, phone || null, relationship || null,
       isFavourite !== undefined ? isFavourite : null, id, req.user.id]
    );
    if (rows.length === 0) return res.status(404).json({ error: 'Contact not found' });
    res.json(rows[0]);
  } catch (err) {
    console.error('Update contact error:', err.message);
    res.status(500).json({ error: 'Failed to update contact' });
  }
});

// DELETE /api/contacts/:id
app.delete('/api/contacts/:id', requireAuth, async (req, res) => {
  const { id } = req.params;
  try {
    const { rowCount } = await db.query(
      `DELETE FROM contacts WHERE id = $1 AND user_id = $2`, [id, req.user.id]
    );
    if (rowCount === 0) return res.status(404).json({ error: 'Contact not found' });
    res.json({ ok: true });
  } catch (err) {
    console.error('Delete contact error:', err.message);
    res.status(500).json({ error: 'Failed to delete contact' });
  }
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

// ── TripLink endpoints ────────────────────────────────────────────────────────

// POST /api/triplinks — create and persist a new TripLink
app.post('/api/triplinks', async (req, res) => {
  try {
    const tripLink = req.body;
    if (!tripLink || !tripLink.id || !tripLink.shareToken) {
      return res.status(400).json({ error: 'Missing required fields: id, shareToken' });
    }
    await db.query(
      `INSERT INTO triplinks (id, user_id, share_token, data, status, expected_return_time)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (id) DO UPDATE SET data = EXCLUDED.data`,
      [
        tripLink.id,
        tripLink.userId || null,
        tripLink.shareToken,
        JSON.stringify(tripLink),
        tripLink.status || 'planned',
        tripLink.expectedReturnTime || null,
      ]
    );
    res.status(201).json({ id: tripLink.id, shareToken: tripLink.shareToken });
  } catch (err) {
    console.error('Create triplink error:', err.message);
    res.status(500).json({ error: 'Failed to save TripLink' });
  }
});

// GET /api/triplinks/:token — fetch a TripLink with its check-ins
app.get('/api/triplinks/:token', async (req, res) => {
  try {
    const { token } = req.params;
    const { rows } = await db.query(
      `SELECT t.data, t.status, t.started_at, t.last_check_in, t.overdue_since,
              t.expected_return_time,
              COALESCE(
                json_agg(
                  json_build_object(
                    'timestamp', c.checked_in_at,
                    'message',   c.message,
                    'locationW3w', c.location_w3w
                  ) ORDER BY c.checked_in_at DESC
                ) FILTER (WHERE c.id IS NOT NULL),
                '[]'
              ) AS check_ins
       FROM   triplinks t
       LEFT JOIN check_ins c ON c.trip_id = t.id
       WHERE  t.share_token = $1
       GROUP  BY t.id`,
      [token]
    );
    if (rows.length === 0) return res.status(404).json({ error: 'TripLink not found' });

    const row = rows[0];
    const tripLink = {
      ...row.data,
      status:             row.status,
      startedAt:          row.started_at,
      lastCheckIn:        row.last_check_in,
      overdueSince:       row.overdue_since,
      expectedReturnTime: row.expected_return_time,
      checkIns:           row.check_ins,
    };
    res.json(tripLink);
  } catch (err) {
    console.error('Get triplink error:', err.message);
    res.status(500).json({ error: 'Failed to fetch TripLink' });
  }
});

// PATCH /api/triplinks/:token/start — creator starts the trip
app.patch('/api/triplinks/:token/start', async (req, res) => {
  try {
    const { token } = req.params;
    const { rows } = await db.query(
      `UPDATE triplinks
       SET status = 'active', started_at = NOW()
       WHERE share_token = $1
       RETURNING id`,
      [token]
    );
    if (rows.length === 0) return res.status(404).json({ error: 'TripLink not found' });
    broadcast(token, 'status', { status: 'active', startedAt: new Date().toISOString() });
    res.json({ ok: true });
  } catch (err) {
    console.error('Start trip error:', err.message);
    res.status(500).json({ error: 'Failed to start trip' });
  }
});

// POST /api/triplinks/:token/checkin — creator submits a check-in
app.post('/api/triplinks/:token/checkin', async (req, res) => {
  try {
    const { token } = req.params;
    const { message, locationW3w } = req.body || {};

    const { rows } = await db.query(
      `SELECT id FROM triplinks WHERE share_token = $1`,
      [token]
    );
    if (rows.length === 0) return res.status(404).json({ error: 'TripLink not found' });
    const tripId = rows[0].id;

    const { rows: ciRows } = await db.query(
      `INSERT INTO check_ins (trip_id, message, location_w3w)
       VALUES ($1, $2, $3)
       RETURNING checked_in_at`,
      [tripId, message || null, locationW3w || null]
    );

    const timestamp = ciRows[0].checked_in_at;
    await db.query(
      `UPDATE triplinks
       SET last_check_in = $1, status = CASE WHEN status = 'overdue' THEN 'active' ELSE status END,
           overdue_since  = CASE WHEN status = 'overdue' THEN NULL ELSE overdue_since END
       WHERE id = $2`,
      [timestamp, tripId]
    );

    broadcast(token, 'checkin', { timestamp, message: message || null, locationW3w: locationW3w || null });
    res.status(201).json({ ok: true, timestamp });
  } catch (err) {
    console.error('Check-in error:', err.message);
    res.status(500).json({ error: 'Failed to record check-in' });
  }
});

// PATCH /api/triplinks/:token/complete — creator marks trip complete
app.patch('/api/triplinks/:token/complete', async (req, res) => {
  try {
    const { token } = req.params;
    const { rows } = await db.query(
      `UPDATE triplinks SET status = 'completed'
       WHERE share_token = $1 RETURNING id`,
      [token]
    );
    if (rows.length === 0) return res.status(404).json({ error: 'TripLink not found' });
    broadcast(token, 'status', { status: 'completed', completedAt: new Date().toISOString() });
    res.json({ ok: true });
  } catch (err) {
    console.error('Complete trip error:', err.message);
    res.status(500).json({ error: 'Failed to complete trip' });
  }
});

// GET /api/triplinks/:token/events — SSE stream for watchers
app.get('/api/triplinks/:token/events', (req, res) => {
  const { token } = req.params;
  res.set({
    'Content-Type':  'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection':    'keep-alive',
    'X-Accel-Buffering': 'no', // disable Nginx buffering for SSE
  });
  res.flushHeaders();

  // Send a heartbeat every 25 s to keep the connection alive through proxies
  const heartbeat = setInterval(() => {
    try { res.write(': heartbeat\n\n'); } catch (_) { cleanup(); }
  }, 25_000);

  sseAdd(token, res);

  const cleanup = () => {
    clearInterval(heartbeat);
    sseRemove(token, res);
  };

  req.on('close', cleanup);
  req.on('error', cleanup);
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

app.listen(port, '0.0.0.0', async () => {
  console.log(`Upto Backend running on http://172.105.178.48:${port}`);
  console.log(`CORS enabled for: ${corsOptions.origin.join(', ')}`);
  await initDB();
  initDOCSync();
});