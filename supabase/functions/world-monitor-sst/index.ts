const WORLD_MONITOR_BASE = 'https://api.worldmonitor.app';

const FEEDS: Record<string, string> = {
  natural: '/api/natural/v1/list-natural-events',
  outages: '/api/infrastructure/v1/list-internet-outages',
  radiation: '/api/radiation/v1/list-radiation-observations',
  air: '/api/climate/v1/list-air-quality-data',
};

const ALLOWED_ORIGINS = new Set([
  'https://emergencias.movidasst.com',
  'http://localhost:3000',
  'http://localhost:5173',
]);

const WINDOW_MS = 60_000;
const MAX_REQUESTS_PER_WINDOW = 120;
const requestBuckets = new Map<string, { count: number; resetAt: number }>();

const AIR_CITIES = [
  ['Caracas','Venezuela',10.4806,-66.9036],['Maracaibo','Venezuela',10.6427,-71.6125],
  ['Valencia','Venezuela',10.1620,-68.0077],['Maracay','Venezuela',10.2469,-67.5958],
  ['Barquisimeto','Venezuela',10.0678,-69.3474],['San Cristóbal','Venezuela',7.7669,-72.2250],
  ['Mérida','Venezuela',8.5897,-71.1561],['Puerto La Cruz','Venezuela',10.2138,-64.6328],
  ['Cumaná','Venezuela',10.4564,-64.1670],['Maturín','Venezuela',9.7457,-63.1832],
  ['Ciudad Guayana','Venezuela',8.2917,-62.7346],['Barinas','Venezuela',8.6226,-70.2075],
  ['Coro','Venezuela',11.4045,-69.6734],['Porlamar','Venezuela',10.9577,-63.8697],
  ['Puerto Ayacucho','Venezuela',5.6639,-67.6236],['Santa Elena de Uairén','Venezuela',4.6023,-61.1100],
  ['Bogotá','Colombia',4.7110,-74.0721],['Lima','Perú',-12.0464,-77.0428],
  ['Quito','Ecuador',-0.1807,-78.4678],['Santiago','Chile',-33.4489,-70.6693],
  ['Buenos Aires','Argentina',-34.6037,-58.3816],['São Paulo','Brasil',-23.5505,-46.6333],
  ['Ciudad de México','México',19.4326,-99.1332],['Miami','EE. UU.',25.7617,-80.1918],
  ['Madrid','España',40.4168,-3.7038],['Londres','Reino Unido',51.5072,-0.1276],
  ['París','Francia',48.8566,2.3522],['Johannesburgo','Sudáfrica',-26.2041,28.0473],
  ['Delhi','India',28.6139,77.2090],['Pekín','China',39.9042,116.4074],
  ['Tokio','Japón',35.6762,139.6503]
] as const;

function cors(origin: string) {
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Headers': 'content-type',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Max-Age': '86400',
    'Vary': 'Origin',
  };
}

function json(body: unknown, status: number, origin: string, extra: Record<string, string> = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...cors(origin),
      'Content-Type': 'application/json; charset=utf-8',
      'X-Content-Type-Options': 'nosniff',
      ...extra,
    },
  });
}

function clientIp(req: Request) {
  return req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || req.headers.get('cf-connecting-ip') || 'unknown';
}

function rateLimited(ip: string) {
  const now = Date.now();
  const bucket = requestBuckets.get(ip);
  if (!bucket || now >= bucket.resetAt) {
    requestBuckets.set(ip, { count: 1, resetAt: now + WINDOW_MS });
    return false;
  }
  bucket.count += 1;
  return bucket.count > MAX_REQUESTS_PER_WINDOW;
}

async function fetchJson(url: string, headers: Record<string,string> = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12_000);
  try {
    const res = await fetch(url, {
      headers: { Accept: 'application/json', 'User-Agent': 'La-Movida-SST-Monitor/1.2', ...headers },
      signal: controller.signal
    });
    if (!res.ok) throw new Error(`HTTP_${res.status}`);
    return await res.json();
  } finally {
    clearTimeout(timeout);
  }
}

function pickArray(payload: any): any[] {
  if (Array.isArray(payload)) return payload;
  for (const key of ['events','features','observations','outages','annotations','sensors','data','results','items']) {
    if (Array.isArray(payload?.[key])) return payload[key];
  }
  if (payload?.data && typeof payload.data === 'object') return pickArray(payload.data);
  return [];
}

function finite(v: unknown): number | null {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function fmt(v: number | null, digits = 0) {
  return v === null ? '—' : v.toFixed(digits);
}

function severityFromAqi(aqi: number | null) {
  if (aqi === null) return 'advisory';
  if (aqi >= 151) return 'critical';
  if (aqi >= 101) return 'warning';
  return 'advisory';
}

function uvCategory(uv: number | null) {
  if (uv === null) return 'sin dato';
  if (uv >= 11) return 'extremo';
  if (uv >= 8) return 'muy alto';
  if (uv >= 6) return 'alto';
  if (uv >= 3) return 'moderado';
  return 'bajo';
}

function environmentSeverity(aqi: number | null, uv: number | null, apparent: number | null, gust: number | null) {
  const aqiSeverity = severityFromAqi(aqi);
  if (aqiSeverity === 'critical' || (uv !== null && uv >= 11)) return 'critical';
  if (
    aqiSeverity === 'warning' ||
    (uv !== null && uv >= 8) ||
    (apparent !== null && apparent >= 38) ||
    (gust !== null && gust >= 65)
  ) return 'warning';
  return 'advisory';
}

async function worldMonitor(feed: string, apiKey: string) {
  const endpoint = FEEDS[feed];
  if (!endpoint) throw new Error('INVALID_FEED');
  return await fetchJson(`${WORLD_MONITOR_BASE}${endpoint}`, { 'X-WorldMonitor-Key': apiKey });
}

async function fallbackNatural() {
  const [eonet, usgs] = await Promise.allSettled([
    fetchJson('https://eonet.gsfc.nasa.gov/api/v3/events?status=open&days=30&limit=100'),
    fetchJson('https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/4.5_day.geojson'),
  ]);
  const items: any[] = [];

  if (eonet.status === 'fulfilled') {
    for (const e of pickArray(eonet.value)) {
      const g = Array.isArray(e.geometry) ? e.geometry[e.geometry.length - 1] : null;
      const coords = g?.coordinates || [];
      const category = e.categories?.[0]?.title || 'Evento natural';
      items.push({
        id: `eonet-${e.id}`,
        title: e.title || category,
        eventType: category,
        description: e.description || '',
        source: 'NASA EONET',
        url: e.sources?.[0]?.url || e.link || '',
        latitude: Array.isArray(coords) ? coords[1] : null,
        longitude: Array.isArray(coords) ? coords[0] : null,
        severity: /volcano|severe|storm|flood|wildfire/i.test(category) ? 'warning' : 'advisory',
        timestamp: g?.date || null,
      });
    }
  }

  if (usgs.status === 'fulfilled') {
    for (const f of pickArray(usgs.value)) {
      const mag = Number(f?.properties?.mag);
      const coords = f?.geometry?.coordinates || [];
      items.push({
        id: `usgs-${f.id}`,
        title: `Sismo M${Number.isFinite(mag) ? mag.toFixed(1) : '?'} · ${f?.properties?.place || 'ubicación no indicada'}`,
        eventType: 'Sismo',
        description: f?.properties?.title || '',
        source: 'USGS',
        url: f?.properties?.url || '',
        latitude: coords[1] ?? null,
        longitude: coords[0] ?? null,
        severity: mag >= 6 ? 'critical' : mag >= 5 ? 'warning' : 'advisory',
        timestamp: f?.properties?.time || null,
      });
    }
  }
  return items.slice(0, 150);
}

async function fallbackOutages() {
  const until = Math.floor(Date.now() / 1000);
  const from = until - 48 * 3600;
  const payload = await fetchJson(`https://api.ioda.inetintel.cc.gatech.edu/v2/outages/events?from=${from}&until=${until}&format=codf&limit=100`);
  return pickArray(payload).map((o: any, i: number) => ({
    id: `ioda-${o.id || i}-${o.start || ''}`,
    title: `Interrupción de conectividad · ${o.location_name || o.location || 'zona no indicada'}`,
    country: o.location_name || '',
    description: `Señal ${o.datasource || 'IODA'}${o.score != null ? ` · puntuación ${Math.round(Number(o.score))}` : ''}`,
    source: 'IODA / Georgia Tech',
    url: o.location ? `https://ioda.inetintel.cc.gatech.edu/${String(o.location).replace('/', '/')}` : 'https://ioda.inetintel.cc.gatech.edu/',
    severity: Number(o.score) >= 10000 ? 'critical' : Number(o.score) >= 4000 ? 'warning' : 'advisory',
    timestamp: o.start ? Number(o.start) * 1000 : null,
  }));
}

async function fallbackRadiation() {
  const payload = await fetchJson('https://simplemap.safecast.org/api/sensors');
  return pickArray(payload).slice(0, 150).map((s: any, i: number) => {
    const value = Number(s.value ?? s.usvh ?? s.uSv ?? s.cpm ?? s.last_value ?? s.reading);
    const unit = s.unit || (s.cpm != null ? 'CPM' : '');
    return {
      id: `safecast-${s.id || s.sensor_id || i}`,
      title: `Radiación ionizante · ${s.name || s.device_name || s.sensor_name || `sensor ${s.id || i + 1}`}`,
      country: s.country || s.location_name || '',
      description: Number.isFinite(value) ? `${value} ${unit}`.trim() : 'Sensor activo Safecast',
      source: 'Safecast',
      url: 'https://map.safecast.org/',
      latitude: s.latitude ?? s.lat ?? null,
      longitude: s.longitude ?? s.lon ?? s.lng ?? null,
      severity: 'advisory',
      timestamp: s.updated_at || s.timestamp || s.last_seen || null,
    };
  });
}

async function fallbackAir() {
  const lats = AIR_CITIES.map(c => c[2]).join(',');
  const lons = AIR_CITIES.map(c => c[3]).join(',');

  const airUrl = `https://air-quality-api.open-meteo.com/v1/air-quality?latitude=${encodeURIComponent(lats)}&longitude=${encodeURIComponent(lons)}&current=us_aqi,pm2_5,pm10,ozone,dust,uv_index&timezone=auto`;
  const weatherUrl = `https://api.open-meteo.com/v1/forecast?latitude=${encodeURIComponent(lats)}&longitude=${encodeURIComponent(lons)}&current=temperature_2m,relative_humidity_2m,apparent_temperature,precipitation,wind_speed_10m,wind_gusts_10m,weather_code&timezone=auto`;

  const [airResult, weatherResult] = await Promise.allSettled([
    fetchJson(airUrl),
    fetchJson(weatherUrl),
  ]);

  if (airResult.status === 'rejected' && weatherResult.status === 'rejected') {
    throw new Error('OPEN_METEO_ENVIRONMENT_UNAVAILABLE');
  }

  const airRows = airResult.status === 'fulfilled'
    ? (Array.isArray(airResult.value) ? airResult.value : [airResult.value])
    : [];
  const weatherRows = weatherResult.status === 'fulfilled'
    ? (Array.isArray(weatherResult.value) ? weatherResult.value : [weatherResult.value])
    : [];

  return AIR_CITIES.map((city, i) => {
    const air = airRows[i] || {};
    const weather = weatherRows[i] || {};
    const aq = air?.current || {};
    const wx = weather?.current || {};

    const aqi = finite(aq.us_aqi);
    const pm25 = finite(aq.pm2_5);
    const pm10 = finite(aq.pm10);
    const ozone = finite(aq.ozone);
    const dust = finite(aq.dust);
    const uv = finite(aq.uv_index);
    const temp = finite(wx.temperature_2m);
    const apparent = finite(wx.apparent_temperature);
    const humidity = finite(wx.relative_humidity_2m);
    const precipitation = finite(wx.precipitation);
    const wind = finite(wx.wind_speed_10m);
    const gust = finite(wx.wind_gusts_10m);
    const weatherCode = finite(wx.weather_code);
    const uvBand = uvCategory(uv);

    const description = [
      `UV ${fmt(uv,1)} (${uvBand})`,
      `Sensación ${fmt(apparent,1)} °C`,
      `T ${fmt(temp,1)} °C`,
      `HR ${fmt(humidity)}%`,
      `AQI US ${fmt(aqi)}`,
      `PM2.5 ${fmt(pm25,1)} µg/m³`,
      `PM10 ${fmt(pm10,1)} µg/m³`,
      `O₃ ${fmt(ozone,1)} µg/m³`,
      `Polvo ${fmt(dust,1)} µg/m³`,
      `Viento ${fmt(wind)} km/h`,
      `Ráfagas ${fmt(gust)} km/h`,
      `Lluvia ${fmt(precipitation,1)} mm`,
    ].join(' · ');

    const timestamp = aq.time || wx.time || null;
    return {
      id: `openmeteo-env-${i}`,
      title: `Exposición ambiental · ${city[0]}`,
      country: city[1],
      description,
      source: 'Open-Meteo / CAMS + Weather',
      url: 'https://open-meteo.com/en/docs/air-quality-api',
      latitude: Number(air.latitude ?? weather.latitude ?? city[2]),
      longitude: Number(air.longitude ?? weather.longitude ?? city[3]),
      severity: environmentSeverity(aqi, uv, apparent, gust),
      timestamp,
      metrics: {
        uv_index: uv,
        uv_category: uvBand,
        us_aqi: aqi,
        pm2_5: pm25,
        pm10,
        ozone,
        dust,
        temperature_c: temp,
        apparent_temperature_c: apparent,
        relative_humidity_pct: humidity,
        precipitation_mm: precipitation,
        wind_speed_kmh: wind,
        wind_gust_kmh: gust,
        weather_code: weatherCode,
      },
      note: 'La prioridad ambiental orienta la verificación SST y no sustituye mediciones ocupacionales específicas como WBGT ni criterios de higiene industrial.',
    };
  });
}

async function fallback(feed: string) {
  if (feed === 'natural') return fallbackNatural();
  if (feed === 'outages') return fallbackOutages();
  if (feed === 'radiation') return fallbackRadiation();
  if (feed === 'air') return fallbackAir();
  throw new Error('INVALID_FEED');
}

Deno.serve(async (req: Request) => {
  const origin = req.headers.get('origin') || '';
  if (!ALLOWED_ORIGINS.has(origin)) {
    return new Response(JSON.stringify({ error: 'ORIGIN_NOT_ALLOWED' }), {
      status: 403,
      headers: { 'Content-Type': 'application/json; charset=utf-8', Vary: 'Origin' }
    });
  }
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors(origin) });
  if (req.method !== 'GET') return json({ error: 'METHOD_NOT_ALLOWED' }, 405, origin, { Allow: 'GET, OPTIONS' });
  if (rateLimited(clientIp(req))) return json({ error: 'RATE_LIMITED' }, 429, origin, { 'Retry-After': '60' });

  const url = new URL(req.url);
  const feed = url.searchParams.get('feed') || 'natural';

  if (feed === 'health') {
    let wm: any = null;
    try { wm = await fetchJson(`${WORLD_MONITOR_BASE}/api/health?compact=1`); } catch { wm = null; }
    return json({
      feed: 'health',
      fetched_at: new Date().toISOString(),
      world_monitor_reachable: Boolean(wm),
      world_monitor_api_key_configured: Boolean(Deno.env.get('WORLD_MONITOR_API_KEY')),
      fallback_mode: true,
      environment_enrichment: 'open-meteo-air-quality-plus-weather',
      data: wm,
    }, 200, origin, { 'Cache-Control': 'no-store' });
  }

  if (!FEEDS[feed]) {
    return json({ error: 'INVALID_FEED', allowed: [...Object.keys(FEEDS), 'health'] }, 400, origin);
  }

  const apiKey = Deno.env.get('WORLD_MONITOR_API_KEY');

  if (apiKey && feed !== 'air') {
    try {
      const payload = await worldMonitor(feed, apiKey);
      return json({
        feed,
        fetched_at: new Date().toISOString(),
        source: 'World Monitor',
        provider_mode: 'world-monitor',
        data: payload
      }, 200, origin, {
        'Cache-Control': 'public, max-age=60, s-maxage=60, stale-while-revalidate=120',
        'X-Data-Source': 'World Monitor'
      });
    } catch (error) {
      console.error('World Monitor unavailable; using public fallback', error);
    }
  }

  try {
    const items = await fallback(feed);
    return json({
      feed,
      fetched_at: new Date().toISOString(),
      source: feed === 'air' ? 'Open-Meteo environmental data' : 'Public data sources',
      provider_mode: 'public-fallback',
      world_monitor_enrichment: feed === 'air' ? 'open-meteo-priority' : (apiKey ? 'temporarily-unavailable' : 'not-configured'),
      data: items,
    }, 200, origin, {
      'Cache-Control': 'public, max-age=120, s-maxage=120, stale-while-revalidate=300',
      'X-Data-Source': feed === 'air' ? 'Open-Meteo environmental' : 'Public fallback'
    });
  } catch (error) {
    console.error('Fallback provider failure', feed, error);
    return json({ error: 'DATA_SOURCE_UNAVAILABLE', feed }, 502, origin);
  }
});