const BACKEND_URL = 'http://172.105.178.48';

export default async function handler(req, res) {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PATCH,DELETE,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    return res.status(204).end();
  }

  const targetUrl = `${BACKEND_URL}${req.url}`;

  try {
    const fetchOptions = {
      method: req.method,
      headers: {},
    };

    // Forward relevant headers
    if (req.headers['content-type']) {
      fetchOptions.headers['Content-Type'] = req.headers['content-type'];
    }
    if (req.headers.authorization) {
      fetchOptions.headers['Authorization'] = req.headers.authorization;
    }

    // Forward body for non-GET/HEAD requests
    if (req.method !== 'GET' && req.method !== 'HEAD' && req.body) {
      fetchOptions.body = typeof req.body === 'string' ? req.body : JSON.stringify(req.body);
    }

    const response = await fetch(targetUrl, fetchOptions);
    const contentType = response.headers.get('content-type') || '';

    // Forward CORS headers from backend
    const corsHeaders = ['access-control-allow-origin', 'access-control-allow-methods', 'access-control-allow-headers'];
    for (const header of corsHeaders) {
      const value = response.headers.get(header);
      if (value) res.setHeader(header, value);
    }

    res.status(response.status);

    if (contentType.includes('application/json')) {
      const data = await response.json();
      return res.json(data);
    }

    const text = await response.text();
    if (contentType) res.setHeader('Content-Type', contentType);
    return res.send(text);
  } catch (error) {
    console.error('API proxy error:', error);
    return res.status(502).json({ error: 'Backend unavailable' });
  }
}
