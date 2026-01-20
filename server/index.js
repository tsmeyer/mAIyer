// Simple local server for Mr. mAIyer
import express from 'express';
import path from 'path';

const app = express();
const PORT = 8080;

// Serve static files from the 'public' directory
app.use(express.static(path.join(process.cwd(), 'public')));

// Fallback to index.html for all other routes
// In Express 5, use app.use to catch all remaining requests
app.use((req, res) => {
  res.sendFile(path.join(process.cwd(), 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`\n🚀 Mr. mAIyer is running at http://localhost:${PORT}`);
  console.log(`Secure context (localhost) is active for microphone access.\n`);
});
