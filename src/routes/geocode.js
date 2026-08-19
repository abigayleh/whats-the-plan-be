const express = require('express');
const { captureException } = require('../lib/sentry');

const router = express.Router();

const NOMINATIM = 'https://nominatim.openstreetmap.org/search';
// Nominatim's policy requires a valid identifying User-Agent.
const USER_AGENT = 'WhatsThePlan/1.0 (itinerary planner)';
const NOMINATIM_TAG = { tags: { upstream: 'nominatim' } };

// Server-side geocoding proxy. Nominatim requires a User-Agent and sends no CORS headers,
// so the browser can't call it directly — we forward the query and return a trimmed list.
router.get('/', async (req, res) => {
  const q = String(req.query.q || '').trim();
  if (q.length < 3) return res.json([]);
  try {
    const url = `${NOMINATIM}?format=jsonv2&limit=5&q=${encodeURIComponent(q)}`;
    const upstream = await fetch(url, { headers: { 'User-Agent': USER_AGENT } });
    if (!upstream.ok) {
      captureException(new Error(`Nominatim responded ${upstream.status}`), NOMINATIM_TAG);
      return res.status(502).json({ error: 'Geocoding failed' });
    }
    const rows = await upstream.json();
    res.json(rows.map((row) => ({
      label: row.display_name, lat: parseFloat(row.lat), lng: parseFloat(row.lon),
    })));
  } catch (err) {
    // Upstream outages, DNS/network failures and malformed JSON all land here and the client
    // only ever sees a 502, so this is the one place they are visible.
    captureException(err, NOMINATIM_TAG);
    res.status(502).json({ error: 'Geocoding failed' });
  }
});

module.exports = router;