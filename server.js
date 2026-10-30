import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = 3000;

// Serve static assets with no-cache headers for HTML files
app.use((req, res, next) => {
  if (req.path.endsWith('.html') || req.path === '/' || !req.path.includes('.')) {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    res.setHeader('Surrogate-Control', 'no-store');
  }
  next();
});

// Primary landing page (Portal Procurement SJA)
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

// Portal Procurement dedicated routes
app.get('/procurement', (req, res) => {
  res.sendFile(path.join(__dirname, 'procurement.html'));
});
app.get('/procurement.html', (req, res) => {
  res.sendFile(path.join(__dirname, 'procurement.html'));
});
app.get('/portal_procurement', (req, res) => {
  res.sendFile(path.join(__dirname, 'portal_procurement.html'));
});
app.get('/portal_procurement.html', (req, res) => {
  res.sendFile(path.join(__dirname, 'portal_procurement.html'));
});
app.get('/procurementsja3.html', (req, res) => {
  res.sendFile(path.join(__dirname, 'procurementsja3.html'));
});

// SIBIKOM (Gudang Bahan Baku) dedicated routes
app.get('/sibikom', (req, res) => {
  res.sendFile(path.join(__dirname, 'sibikom.html'));
});
app.get('/sibikom.html', (req, res) => {
  res.sendFile(path.join(__dirname, 'sibikom.html'));
});

// Standalone index.html route
app.get('/index.html', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

// Code.gs download/view routes
app.get('/Code.gs', (req, res) => {
  res.sendFile(path.join(__dirname, 'Code.gs'));
});
app.get('/code.gs', (req, res) => {
  res.sendFile(path.join(__dirname, 'Code.gs'));
});

// Static files (disabled index.html default to prevent unexpected fallbacks)
app.use(express.static(__dirname, { index: false }));

// Fallback to primary landing page
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Server is running on http://0.0.0.0:${PORT}`);
});
