// Simple proxy server for ElevenLabs Signed URL
import express from 'express';
import path from 'path';
import cors from 'cors';

const app = express();
const PORT = process.env.PORT || 8080;

app.use(cors());
app.use(express.static(path.join(process.cwd(), 'public')));

// SIGNED URL ENDPOINT
// This hides your API key from the public frontend
app.get('/api/get-signed-url', async (req, res) => {
  try {
    const AGENT_ID = 'agent_6301kf03t1b2f7e8dtte5dawdask';
    const API_KEY = process.env.ELEVENLABS_API_KEY || 'sk_23ecdb027f96e10b22b1b0d818aa39e8966c2fdb731feebf';

    const response = await fetch(
      `https://api.elevenlabs.io/v1/convai/conversation/get-signed-url?agent_id=${AGENT_ID}`,
      {
        method: 'GET',
        headers: { 'xi-api-key': API_KEY }
      }
    );

    if (!response.ok) throw new Error('Failed to get signed URL');
    
    const data = await response.json();
    res.json({ signedUrl: data.signed_url });
  } catch (error) {
    console.error(error);
    res.status(500).send('Error securing session');
  }
});

app.get('*', (req, res) => {
  res.sendFile(path.join(process.cwd(), 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});

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
