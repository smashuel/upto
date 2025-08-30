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

// Trail suggestions endpoint (from your MAPPING.md)
app.get('/api/trails/search', async (req, res) => {
  const { title, type, location } = req.query;
  
  try {
    // This will integrate with your GlobalTrailService
    res.json({
      suggestions: [],
      message: 'Trail search endpoint ready for GlobalTrailService integration'
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

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