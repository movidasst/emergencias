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

const FIRMS_SOURCES = [
  ['VIIRS_NOAA20_NRT', 'VIIRS NOAA-20'],
  ['VIIRS_NOAA21_NRT', 'VIIRS NOAA-21'],
  ['VIIRS_SNPP_NRT', 'VIIRS Suomi-NPP'],
] as const;

// Venezuela + entorno inmediato. FIRMS espera west,south,east,north.
const FIRMS_BBOX = '-74.8,-0.8,-57.8,13.8';

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
  return req.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
    || req.headers.get('cf-connecting-ip')
    || 'unknown';
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
      headers: {
        Accept: 'application/json',
        'User-Agent': 'La-Movida-SST-Monitor/2.0',
        ...headers
      },
      signal: controller.signal
    });
    if (!res.ok) throw new Error(`HTTP_${res.status}`);
    return await res.json();
  } finally {
    clearTimeout(timeout);
  }
}

async function fetchText(url: string) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12_000);
  try {
    const res = await fetch(url, {
      headers: {
        Accept: 'text/csv',
        'User-Agent': 'La-Movida-SST-Monitor/2.0'
      },
      signal: controller.signal
    });
    if (!res.ok) throw new Error(`HTTP_${res.status}`);
    return await res.text();
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
  const x = Number(v);
  return Number.isFinite(x) ? x : null;
}

function fmt(v: number | null, digits = 0) {
  return v === null ? '—' : v.toFixed(digits);
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
  if ((aqi !== null && aqi >= 151) || (uv !== null && uv >= 11)) return 'critical';
  if (
    (aqi !== null && aqi >= 101) ||
    (uv !== null && uv >= 8) ||
    (apparent !== null && apparent >= 38) ||
    (gust !== null && gust >= 65)
  ) return 'warning';
  return 'advisory';
}

function parseCsvLine(line: string) {
  const out: string[] = [];
  let cur = '';
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (quoted && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else {
        quoted = !quoted;
      }
    } else if (ch === ',' && !quoted) {
      out.push(cur);
      cur = '';
    } else {
      cur += ch;
    }
  }
  out.push(cur);
  return out;
}

function parseCsv(csv: string) {
  const lines = csv.trim().split(/\r?\n/).filter(Boolean);
  if (lines.length < 2) return [] as Record<string,string>[];
  const headers = parseCsvLine(lines[0]).map(x => x.trim());
  return lines.slice(1).map(line => {
    const vals = parseCsvLine(line);
    return Object.fromEntries(headers.map((h, i) => [h, (vals[i] ?? '').trim()]));
  });
}

function firmsConfidence(v: unknown) {
  const s = String(v ?? '').toLowerCase();
  if (s === 'h' || s === 'high') return 'alta';
  if (s === 'n' || s === 'nominal') return 'nominal';
  if (s === 'l' || s === 'low') return 'baja';
  return s || 'no indicada';
}

function firmsSeverity(row: Record<string,string>) {
  const frp = finite(row.frp);
  const conf = String(row.confidence || '').toLowerCase();
  if (conf === 'h' || (frp !== null && frp >= 50)) return 'critical';
  if (conf === 'n' || (frp !== null && frp >= 15)) return 'warning';
  return 'advisory';
}

function firmsTimestamp(row: Record<string,string>) {
  const date = row.acq_date || '';
  if (!date) return null;
  const rawTime = String(row.acq_time || '').padStart(4, '0');
  const iso = `${date}T${rawTime.slice(0,2)}:${rawTime.slice(2,4)}:00Z`;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? date : d.toISOString();
}

async function fallbackFirms() {
  const key = Deno.env.get('NASA_FIRMS_MAP_KEY');
  if (!key) return [];

  const settled = await Promise.allSettled(
    FIRMS_SOURCES.map(async ([source, label]) => {
      const url = `https://firms.modaps.eosdis.nasa.gov/api/area/csv/${encodeURIComponent(key)}/${source}/${FIRMS_BBOX}/1`;
      const csv = await fetchText(url);
      return parseCsv(csv).map((row, i) => {
        const lat = finite(row.latitude);
        const lon = finite(row.longitude);
        const frp = finite(row.frp);
        const bright = finite(row.bright_ti4 ?? row.brightness);
        const daynight = String(row.daynight || '').toUpperCase() === 'N' ? 'noche' : 'día';

        return {
          id: `firms-${source}-${lat}-${lon}-${row.acq_date}-${row.acq_time}-${i}`,
          title: `Foco térmico satelital${frp !== null ? ` · ${frp.toFixed(1)} MW` : ''}`,
          eventType: 'Incendio / anomalía térmica',
          country: 'Venezuela + entorno',
          description: [
            `Detección ${label}`,
            `confianza ${firmsConfidence(row.confidence)}`,
            frp !== null ? `FRP ${frp.toFixed(1)} MW` : '',
            bright !== null ? `T4 ${bright.toFixed(1)} K` : '',
            daynight,
          ].filter(Boolean).join(' · '),
          source: `NASA FIRMS · ${label}`,
          url: 'https://firms.modaps.eosdis.nasa.gov/map/',
          latitude: lat,
          longitude: lon,
          severity: firmsSeverity(row),
          timestamp: firmsTimestamp(row),
          metrics: {
            frp_mw: frp,
            brightness_ti4_k: bright,
            confidence: firmsConfidence(row.confidence),
            satellite: row.satellite || label,
            instrument: row.instrument || 'VIIRS',
            daynight,
          },
          note: 'FIRMS detecta anomalías térmicas desde satélite. Una detección no confirma por sí sola un incendio estructural ni afectación ocupacional.'
        };
      });
    })
  );

  let all: any[] = [];
  for (const result of settled) {
    if (result.status === 'fulfilled') all.push(...result.value);
  }

  // Deduplicación aproximada de detecciones muy próximas en espacio/tiempo.
  const seen = new Set<string>();
  all = all.filter(item => {
    const lat = finite(item.latitude);
    const lon = finite(item.longitude);
    const key = lat !== null && lon !== null
      ? `${lat.toFixed(2)}|${lon.toFixed(2)}|${String(item.timestamp || '').slice(0,13)}`
      : item.id;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  const rank = (s: string) => s === 'critical' ? 3 : s === 'warning' ? 2 : 1;
  return all
    .sort((a,b) => rank(b.severity) - rank(a.severity) || String(b.timestamp || '').localeCompare(String(a.timestamp || '')))
    .slice(0, 200);
}

async function fallbackNatural() {
  const [eonet, usgs, firms] = await Promise.allSettled([
    fetchJson('https://eonet.gsfc.nasa.gov/api/v3/events?status=open&days=30&limit=100'),
    fetchJson('https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/4.5_day.geojson'),
    fallbackFirms(),
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

  if (firms.status === 'fulfilled') items.push(...firms.value);

  return items.slice(0, 300);
}

async function fallbackOutages() {
  const until = Math.floor(Date.now() / 1000);
  const from = until - 48 * 3600;
  const payload = await fetchJson(
    `https://api.ioda.inetintel.cc.gatech.edu/v2/outages/events?from=${from}&until=${until}&format=codf&limit=100`
  );

  return pickArray(payload).map((o: any, i: number) => ({
    id: `ioda-${o.id || i}-${o.start || ''}`,
    title: `Interrupción de conectividad · ${o.location_name || o.location || 'zona no indicada'}`,
    country: o.location_name || '',
    description: `Señal ${o.datasource || 'IODA'}${o.score != null ? ` · puntuación ${Math.round(Number(o.score))}` : ''}`,
    source: 'IODA / Georgia Tech',
    url: 'https://ioda.inetintel.cc.gatech.edu/',
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
      title: `Radiación ionizante · ${s.name || s.device_name || s.sensor_name || `sensor ${i + 1}`}`,
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

    return {
      id: `openmeteo-env-${i}`,
      title: `Exposición ambiental · ${city[0]}`,
      country: city[1],
      description: [
        `UV ${fmt(uv,1)} (${uvCategory(uv)})`,
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
      ].join(' · '),
      source: 'Open-Meteo / CAMS + Weather',
      url: 'https://open-meteo.com/en/docs/air-quality-api',
      latitude: Number(air.latitude ?? weather.latitude ?? city[2]),
      longitude: Number(air.longitude ?? weather.longitude ?? city[3]),
      severity: environmentSeverity(aqi, uv, apparent, gust),
      timestamp: aq.time || wx.time || null,
      metrics: {
        uv_index: uv,
        uv_category: uvCategory(uv),
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
        weather_code: finite(wx.weather_code),
      },
      note: 'La prioridad ambiental orienta la verificación SST y no sustituye mediciones ocupacionales específicas como WBGT ni criterios de higiene industrial.',
    };
  });
}

async function getFeed(feed: string) {
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
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        Vary: 'Origin'
      }
    });
  }

  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors(origin) });
  if (req.method !== 'GET') return json({ error: 'METHOD_NOT_ALLOWED' }, 405, origin, { Allow: 'GET, OPTIONS' });
  if (rateLimited(clientIp(req))) return json({ error: 'RATE_LIMITED' }, 429, origin, { 'Retry-After': '60' });

  const url = new URL(req.url);
  const feed = url.searchParams.get('feed') || 'natural';

  if (feed === 'health') {
    return json({
      feed: 'health',
      fetched_at: new Date().toISOString(),
      direct_sources: true,
      nasa_firms_map_key_configured: Boolean(Deno.env.get('NASA_FIRMS_MAP_KEY')),
      environment_enrichment: 'open-meteo-air-quality-plus-weather',
      natural_sources: ['NASA EONET', 'USGS', 'NASA FIRMS / VIIRS'],
    }, 200, origin, { 'Cache-Control': 'no-store' });
  }

  if (!['natural','outages','radiation','air'].includes(feed)) {
    return json({
      error: 'INVALID_FEED',
      allowed: ['natural','outages','radiation','air','health']
    }, 400, origin);
  }

  try {
    const items = await getFeed(feed);

    const source =
      feed === 'natural' ? 'NASA EONET + USGS + NASA FIRMS' :
      feed === 'outages' ? 'IODA / Georgia Tech' :
      feed === 'radiation' ? 'Safecast' :
      'Open-Meteo / CAMS + Weather';

    return json({
      feed,
      fetched_at: new Date().toISOString(),
      source,
      provider_mode: 'direct-sources',
      firms_enabled: feed === 'natural' ? Boolean(Deno.env.get('NASA_FIRMS_MAP_KEY')) : undefined,
      data: items,
    }, 200, origin, {
      'Cache-Control': 'public, max-age=120, s-maxage=120, stale-while-revalidate=300',
      'X-Data-Source': source,
    });
  } catch (error) {
    console.error('Source failure', feed, error);
    return json({ error: 'DATA_SOURCE_UNAVAILABLE', feed }, 502, origin);
  }
});
