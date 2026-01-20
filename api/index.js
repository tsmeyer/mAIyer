// Proxy server for ElevenLabs (Vercel edition)
import express from 'express';
import cors from 'cors';
import path from 'path';

const app = express();

app.use(cors());
app.use(express.json());

// Serve static files from the 'public' directory
app.use(express.static(path.join(process.cwd(), 'public')));

// THE ENDPOINT
app.get('/api/get-signed-url', async (req, res) => {
  try {
    const AGENT_ID = 'agent_6301kf03t1b2f7e8dtte5dawdask';
    const API_KEY = process.env.ELEVENLABS_API_KEY || 'sk_23ecdb027f96e10b22b1b0d818aa39e8966c2fdb731feebf';

    const url = `https://api.elevenlabs.io/v1/convai/conversation/get-signed-url?agent_id=${AGENT_ID}`;
    const response = await fetch(url, {
      method: 'GET',
      headers: { 'xi-api-key': API_KEY }
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('ElevenLabs Proxy Error:', errorText);
      return res.status(response.status).json({ error: 'ElevenLabs Authorization Failed', details: errorText });
    }
    
    const data = await response.json();
    res.json({ signedUrl: data.signed_url });
  } catch (error) {
    console.error('Proxy Error:', error.message);
    res.status(500).json({ error: error.message });
  }
});

// Any other requests serve the index.html (SPA support)
// For Express 5, using a middleware without a path is the most reliable catch-all
app.use((req, res) => {
  res.sendFile(path.join(process.cwd(), 'public', 'index.html'));
});

// IMPORTANT: For Vercel, we export the app instead of calling .listen()
export default app;

if (process.env.NODE_ENV !== 'production') {
  const PORT = process.env.PORT || 8080;
  app.listen(PORT, () => {
    console.log(`Local server running at http://localhost:${PORT}`);
  });
}
