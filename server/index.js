// Minimal proxy server for ElevenLabs API
// Usage:
//   export ELEVENLABS_API_KEY="sk_..."
//   npm install express
//   node server/index.js

import express from 'express';
import path from 'path';

const app = express();
const PORT = process.env.PORT || 3000;

// Accept JSON bodies
app.use(express.json({ limit: '20mb' }));

// Serve static frontend files from /public
app.use(express.static(path.join(process.cwd(), 'public')));

// Ensure root returns index.html for SPA
app.get('/', (req, res) => {
  res.sendFile(path.join(process.cwd(), 'public', 'index.html'));
});

// Accept raw audio bodies (for forwarding audio chunks)
app.use('/api/stream', express.raw({ type: '*/*', limit: '50mb' }));

if (!process.env.ELEVENLABS_API_KEY) {
  console.warn('Warning: ELEVENLABS_API_KEY is not set. Set it before proxying requests.');
}

// Relay JSON requests to ElevenLabs (replace the target path below with the real one you need)
app.post('/api/relay', async (req, res) => {
  try {
    const target = 'https://api.elevenlabs.com/v1/your/target/endpoint'; // <-- replace
    const resp = await fetch(target, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.ELEVENLABS_API_KEY || ''}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(req.body)
    });

    const buffer = Buffer.from(await resp.arrayBuffer());
    const contentType = resp.headers.get('content-type') || 'application/octet-stream';
    res.status(resp.status).set('Content-Type', contentType).send(buffer);
  } catch (err) {
    console.error('Relay error', err);
    res.status(500).json({ error: String(err) });
  }
});

// Relay binary audio chunks (forward raw body)
app.post('/api/stream', async (req, res) => {
  try {
    const target = 'https://api.elevenlabs.com/v1/your/stream/endpoint'; // <-- replace
    const resp = await fetch(target, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.ELEVENLABS_API_KEY || ''}`,
        'Content-Type': req.headers['content-type'] || 'application/octet-stream'
      },
      body: req.body
    });

    const buffer = Buffer.from(await resp.arrayBuffer());
    const contentType = resp.headers.get('content-type') || 'application/octet-stream';
    res.status(resp.status).set('Content-Type', contentType).send(buffer);
  } catch (err) {
    console.error('Stream relay error', err);
    res.status(500).json({ error: String(err) });
  }
});

app.listen(PORT, () => {
  console.log(`Proxy server listening on http://localhost:${PORT}`);
});
