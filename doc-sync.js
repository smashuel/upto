#!/usr/bin/env node
/**
 * DOC API Sync Script
 *
 * Syncs Department of Conservation (DOC) trail data from the API
 * to a local JSON cache for reliable offline access.
 *
 * Usage:
 *   node doc-sync.js                    (manual sync)
 *   0 3 * * 1 ... node doc-sync.js      (weekly cron: Mon 3am)
 *
 * Environment:
 *   DOC_API_KEY (required): API key from https://api.doc.govt.nz
 *
 * Data License: CC BY 4.0 - https://www.doc.govt.nz/
 */

import { promises as fs } from 'fs';
import { join } from 'path';

const DOC_API_BASE = 'https://api.doc.govt.nz';
const DOC_CACHE_DIR = './data';
const DOC_API_KEY = process.env.DOC_API_KEY || '';

const RESOURCES = [
  { name: 'tracks', path: 'v1/tracks' },
  { name: 'huts', path: 'v2/huts' },
  { name: 'campsites', path: 'v2/campsites' }
];

/**
 * Convert NZTM2000 (EPSG:2193) easting/northing to WGS84 lat/lng.
 * Uses inverse Transverse Mercator projection with GRS80 ellipsoid.
 */
function nztmToWgs84(easting, northing) {
  const a = 6378137.0;
  const f = 1 / 298.257222101;
  const lambda0 = 173 * Math.PI / 180;
  const k0 = 0.9996;
  const E0 = 1600000;
  const N0 = 10000000;

  const e2 = 2 * f - f * f;
  const ePrime2 = e2 / (1 - e2);
  const e1 = (1 - Math.sqrt(1 - e2)) / (1 + Math.sqrt(1 - e2));

  const M = (northing - N0) / k0;
  const mu = M / (a * (1 - e2 / 4 - 3 * e2 * e2 / 64 - 5 * e2 * e2 * e2 / 256));

  const phi1 = mu
    + (3 * e1 / 2 - 27 * e1 * e1 * e1 / 32) * Math.sin(2 * mu)
    + (21 * e1 * e1 / 16 - 55 * e1 * e1 * e1 * e1 / 32) * Math.sin(4 * mu)
    + (151 * e1 * e1 * e1 / 96) * Math.sin(6 * mu)
    + (1097 * e1 * e1 * e1 * e1 / 512) * Math.sin(8 * mu);

  const sinPhi1 = Math.sin(phi1);
  const cosPhi1 = Math.cos(phi1);
  const tanPhi1 = Math.tan(phi1);
  const N1 = a / Math.sqrt(1 - e2 * sinPhi1 * sinPhi1);
  const T1 = tanPhi1 * tanPhi1;
  const C1 = ePrime2 * cosPhi1 * cosPhi1;
  const R1 = a * (1 - e2) / Math.pow(1 - e2 * sinPhi1 * sinPhi1, 1.5);
  const D = (easting - E0) / (N1 * k0);

  const lat = phi1 - (N1 * tanPhi1 / R1) * (
    D * D / 2
    - (5 + 3 * T1 + 10 * C1 - 4 * C1 * C1 - 9 * ePrime2) * D * D * D * D / 24
    + (61 + 90 * T1 + 298 * C1 + 45 * T1 * T1 - 252 * ePrime2 - 3 * C1 * C1) * D * D * D * D * D * D / 720
  );

  const lng = lambda0 + (
    D
    - (1 + 2 * T1 + C1) * D * D * D / 6
    + (5 - 2 * C1 + 28 * T1 - 3 * C1 * C1 + 8 * ePrime2 + 24 * T1 * T1) * D * D * D * D * D / 120
  ) / cosPhi1;

  return {
    lat: lat * 180 / Math.PI,
    lng: lng * 180 / Math.PI
  };
}

/**
 * Add WGS84 lat/lng fields to DOC data during sync so downstream
 * consumers don't need to do coordinate conversion at request time.
 */
function convertTrackCoords(tracks) {
  return tracks.map(track => {
    const center = (track.x && track.y) ? nztmToWgs84(track.x, track.y) : null;

    // Convert line geometry from NZTM2000 to WGS84
    let lineWgs84 = null;
    if (track.line && Array.isArray(track.line) && track.line.length > 0) {
      // line is [[[easting, northing], ...]] — take first segment
      const segment = track.line[0];
      if (Array.isArray(segment)) {
        lineWgs84 = segment.map(([e, n]) => {
          const pt = nztmToWgs84(e, n);
          return [pt.lat, pt.lng];
        });
      }
    }

    return {
      ...track,
      lat: center?.lat ?? null,
      lng: center?.lng ?? null,
      lineWgs84
    };
  });
}

function convertPointCoords(items) {
  return items.map(item => {
    const coords = (item.x && item.y) ? nztmToWgs84(item.x, item.y) : null;
    return {
      ...item,
      lat: coords?.lat ?? null,
      lng: coords?.lng ?? null
    };
  });
}

async function fetchDocAPI(path) {
  if (!DOC_API_KEY) {
    throw new Error('DOC_API_KEY environment variable not set');
  }

  try {
    const response = await fetch(`${DOC_API_BASE}/${path}`, {
      method: 'GET',
      headers: {
        'x-api-key': DOC_API_KEY,
        'Accept': 'application/json'
      },
      signal: AbortSignal.timeout(30000)
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    return await response.json();
  } catch (error) {
    throw new Error(`Failed to fetch ${path}: ${error.message}`);
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
    throw new Error(`Failed to write cache for ${resource}: ${error.message}`);
  }
}

async function syncResource(resource, apiPath) {
  console.log(`\n[${new Date().toISOString()}] Syncing ${resource}...`);

  try {
    const startTime = Date.now();
    let data = await fetchDocAPI(apiPath);
    const fetchDuration = ((Date.now() - startTime) / 1000).toFixed(2);

    // Convert NZTM2000 coordinates to WGS84 lat/lng
    if (resource === 'tracks' && Array.isArray(data)) {
      console.log(`  Converting ${data.length} track coordinates from NZTM2000 to WGS84...`);
      data = convertTrackCoords(data);
    } else if ((resource === 'huts' || resource === 'campsites') && Array.isArray(data)) {
      console.log(`  Converting ${data.length} ${resource} coordinates from NZTM2000 to WGS84...`);
      data = convertPointCoords(data);
    }

    const duration = ((Date.now() - startTime) / 1000).toFixed(2);
    await writeDocCache(resource, data);

    const count = Array.isArray(data) ? data.length : Object.keys(data).length;
    console.log(`✓ Successfully synced ${resource}`);
    console.log(`  Records: ${count}`);
    console.log(`  Time: ${duration}s`);

    return { resource, success: true, count, duration };
  } catch (error) {
    console.error(`✗ Failed to sync ${resource}: ${error.message}`);
    return { resource, success: false, error: error.message };
  }
}

async function main() {
  console.log('═══════════════════════════════════════════════════');
  console.log('DOC Trail Data Sync');
  console.log('═══════════════════════════════════════════════════');
  console.log(`Start time: ${new Date().toISOString()}`);
  console.log(`Cache directory: ${DOC_CACHE_DIR}`);

  if (!DOC_API_KEY) {
    console.error('\n✗ ERROR: DOC_API_KEY environment variable not set');
    console.error('  Set it with: export DOC_API_KEY=your_key_here');
    process.exit(1);
  }

  console.log(`API Key: ${DOC_API_KEY.substring(0, 4)}...${DOC_API_KEY.substring(DOC_API_KEY.length - 4)}`);

  const results = [];
  const totalStart = Date.now();

  // Sync all resources sequentially
  for (const { name, path } of RESOURCES) {
    const result = await syncResource(name, path);
    results.push(result);

    // Small delay between requests to be respectful to the API
    if (name !== RESOURCES[RESOURCES.length - 1].name) {
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  }

  const totalDuration = ((Date.now() - totalStart) / 1000).toFixed(2);

  // Summary
  console.log('\n═══════════════════════════════════════════════════');
  console.log('Summary');
  console.log('═══════════════════════════════════════════════════');

  const successful = results.filter(r => r.success);
  const failed = results.filter(r => !r.success);

  successful.forEach(r => {
    console.log(`✓ ${r.resource.padEnd(12)} ${r.count.toString().padStart(5)} records  (${r.duration}s)`);
  });

  if (failed.length > 0) {
    console.log('\nFailed:');
    failed.forEach(r => {
      console.log(`✗ ${r.resource.padEnd(12)} ${r.error}`);
    });
  }

  console.log(`\nTotal time: ${totalDuration}s`);
  console.log(`End time: ${new Date().toISOString()}`);

  const hasFailures = failed.length > 0;
  process.exit(hasFailures ? 1 : 0);
}

main().catch(error => {
  console.error('\n✗ Fatal error:', error);
  process.exit(1);
});
