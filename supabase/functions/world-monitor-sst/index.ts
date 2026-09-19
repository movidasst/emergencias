const ALLOWED_ORIGINS = new Set([
  'https://emergencias.movidasst.com',
  'http://localhost:3000',
  'http://localhost:5173',
]);

const WINDOW_MS = 60_000;
const MAX_REQUESTS_PER_WINDOW = 120;
const requestBuckets = new Map<string, { count: number; resetAt: number }>();

// OSIRIS se usa únicamente como capa de redundancia. Las fuentes oficiales/directas
// siguen siendo la primera opción; si una de ellas no responde, OSIRIS puede
// normalizar la misma familia de datos sin convertirse en una dependencia única.
const OSIRIS_BASE = 'https://osirisai.live/api';

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

async function fetchText(url: string, accept = 'text/plain') {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12_000);
  try {
    const res = await fetch(url, {
      headers: {
        Accept: accept,
        'User-Agent': 'La-Movida-SST-Monitor/3.0'
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

async function fallbackFirms(url?: URL) {
  const key = Deno.env.get('NASA_FIRMS_MAP_KEY');
  if (!key) return [];
  const requestedCountry = String(url?.searchParams.get('country') || '').trim();
  const requestedBbox = String(url?.searchParams.get('bbox') || '').trim();
  if (requestedCountry && !requestedBbox) return [];
  const firmsBbox = requestedBbox || FIRMS_BBOX;
  const countryLabel = requestedCountry || 'Venezuela';

  const settled = await Promise.allSettled(
    FIRMS_SOURCES.map(async ([source, label]) => {
      const url = `https://firms.modaps.eosdis.nasa.gov/api/area/csv/${encodeURIComponent(key)}/${source}/${firmsBbox}/1`;
      const csv = await fetchText(url, 'text/csv');
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
          country: countryLabel,
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


function osirisSeverity(v: unknown) {
  const s = String(v ?? '').toLowerCase();
  if (/critical|extreme|severe|high|red|danger/.test(s)) return 'critical';
  if (/warning|watch|medium|moderate|orange|yellow|elevated/.test(s)) return 'warning';
  return 'advisory';
}

function normalizeOsirisEarthquakes(payload: any) {
  return pickArray(payload?.earthquakes ?? payload).slice(0, 250).map((q: any, i: number) => {
    const mag = finite(q.magnitude ?? q.mag);
    return {
      id: `osiris-eq-${q.id || i}`,
      title: `Sismo M${mag !== null ? mag.toFixed(1) : '?'} · ${q.place || 'ubicación no indicada'}`,
      eventType: 'Sismo',
      description: [
        q.depth != null ? `Profundidad ${q.depth} km` : '',
        q.tsunami ? 'Indicador tsunami USGS activo' : '',
      ].filter(Boolean).join(' · '),
      source: 'OSIRIS · USGS',
      url: q.url || 'https://osirisai.live/docs',
      latitude: finite(q.lat ?? q.latitude),
      longitude: finite(q.lng ?? q.lon ?? q.longitude),
      severity: mag !== null && mag >= 6 ? 'critical' : mag !== null && mag >= 5 ? 'warning' : osirisSeverity(q.alert),
      timestamp: q.time ?? payload?.timestamp ?? null,
      note: 'Respaldo OSIRIS de datos sísmicos USGS. Confirmar siempre con la fuente oficial aplicable.'
    };
  });
}

function normalizeOsirisFires(payload: any) {
  return pickArray(payload?.fires ?? payload).slice(0, 300).map((f: any, i: number) => {
    const frp = finite(f.frp);
    const conf = String(f.confidence ?? '').toLowerCase();
    const date = String(f.date || '').trim();
    const rawTime = String(f.time || '').padStart(4, '0');
    const timestamp = date
      ? `${date}T${rawTime.slice(0,2) || '00'}:${rawTime.slice(2,4) || '00'}:00Z`
      : payload?.timestamp ?? null;
    return {
      id: `osiris-fire-${i}-${f.lat ?? f.latitude}-${f.lng ?? f.longitude}`,
      title: f.title || `Foco térmico satelital${frp !== null ? ` · ${frp.toFixed(1)} MW` : ''}`,
      eventType: String(f.type || '').toLowerCase() === 'volcano' ? 'Volcán' : 'Incendio / anomalía térmica',
      description: [
        conf ? `confianza ${conf}` : '',
        frp !== null ? `FRP ${frp.toFixed(1)} MW` : '',
        finite(f.brightness) !== null ? `brillo ${finite(f.brightness)?.toFixed(1)}` : '',
      ].filter(Boolean).join(' · '),
      source: 'OSIRIS · NASA FIRMS',
      url: 'https://osirisai.live/docs',
      latitude: finite(f.lat ?? f.latitude),
      longitude: finite(f.lng ?? f.lon ?? f.longitude),
      severity: frp !== null && frp >= 50 ? 'critical' : (conf === 'high' || conf === 'h' || (frp !== null && frp >= 15)) ? 'warning' : 'advisory',
      timestamp,
      note: 'Respaldo OSIRIS de NASA FIRMS. Un foco térmico no confirma por sí solo afectación ocupacional.'
    };
  });
}

function normalizeOsirisWeather(payload: any) {
  return pickArray(payload?.events ?? payload).slice(0, 220).map((w: any, i: number) => ({
    id: `osiris-weather-${w.id || i}`,
    title: w.title || w.type || w.category || 'Evento meteorológico',
    eventType: w.type || w.category || 'Evento meteorológico',
    country: w.area || '',
    description: [w.category, w.expires ? `Vigente hasta ${w.expires}` : ''].filter(Boolean).join(' · '),
    source: `OSIRIS · ${w.provider || 'fuente meteorológica'}`,
    url: /^https?:\/\//i.test(String(w.source || '')) ? w.source : 'https://osirisai.live/docs',
    latitude: finite(w.lat ?? w.latitude),
    longitude: finite(w.lng ?? w.lon ?? w.longitude),
    severity: osirisSeverity(w.severity),
    timestamp: w.date ?? payload?.timestamp ?? null,
    note: 'Respaldo OSIRIS para eventos meteorológicos. Validar con las autoridades y servicios oficiales del territorio.'
  }));
}

async function osirisNaturalFallback(needs: { earthquakes: boolean; fires: boolean; weather: boolean }) {
  const jobs: Promise<any[]>[] = [];
  if (needs.earthquakes) jobs.push(fetchJson(`${OSIRIS_BASE}/earthquakes`).then(normalizeOsirisEarthquakes));
  if (needs.fires) jobs.push(fetchJson(`${OSIRIS_BASE}/fires`).then(normalizeOsirisFires));
  if (needs.weather) jobs.push(fetchJson(`${OSIRIS_BASE}/weather`).then(normalizeOsirisWeather));
  if (!jobs.length) return [];
  const settled = await Promise.allSettled(jobs);
  return settled
    .filter((r): r is PromiseFulfilledResult<any[]> => r.status === 'fulfilled')
    .flatMap(r => r.value);
}

function normalizeOsirisOutages(payload: any) {
  return pickArray(payload?.outages ?? payload).slice(0, 150).map((o: any, i: number) => ({
    id: `osiris-ioda-${o.id || o.code || i}-${o.from || ''}`,
    title: `Interrupción de conectividad · ${o.country || o.code || 'zona no indicada'}`,
    country: o.country || o.code || '',
    description: [
      o.datasource ? `Señal ${o.datasource}` : 'Señal IODA',
      o.score != null ? `puntuación ${Math.round(Number(o.score))}` : ''
    ].filter(Boolean).join(' · '),
    source: 'OSIRIS · IODA / Georgia Tech',
    url: 'https://osirisai.live/docs',
    latitude: finite(o.lat ?? o.latitude),
    longitude: finite(o.lng ?? o.lon ?? o.longitude),
    severity: Number(o.score) >= 10000 ? 'critical' : Number(o.score) >= 4000 ? 'warning' : osirisSeverity(o.level),
    timestamp: o.from ? Number(o.from) * 1000 : payload?.timestamp ?? null,
    note: 'Respaldo OSIRIS de IODA. Una señal de conectividad debe contrastarse antes de inferir una interrupción operacional.'
  }));
}

function normalizeOsirisSpaceWeather(payload: any) {
  const kp = finite(payload?.kp_index);
  const level = String(payload?.storm_level || 'Unknown');
  const alerts = Array.isArray(payload?.alerts) ? payload.alerts : [];
  const flares = Array.isArray(payload?.solar_flares) ? payload.solar_flares : [];
  const severity = kp !== null && kp >= 8 ? 'critical'
    : kp !== null && kp >= 6 ? 'warning'
    : /extreme|severe|strong/i.test(level) ? 'warning'
    : 'advisory';
  return [{
    id: `osiris-swpc-${String(payload?.timestamp || new Date().toISOString()).slice(0,13)}`,
    title: `Clima espacial · respaldo OSIRIS${kp !== null ? ` · Kp ${kp.toFixed(1)}` : ''}`,
    eventType: 'Clima espacial',
    country: 'Global',
    description: [
      level && level !== 'Unknown' ? `Nivel ${level}` : '',
      alerts.slice(0,2).map((a:any)=>a?.message || '').filter(Boolean).join(' | '),
      flares[0]?.class ? `Llamarada ${flares[0].class}` : ''
    ].filter(Boolean).join(' · ') || 'Condiciones de clima espacial normalizadas por OSIRIS.',
    source: 'OSIRIS · NOAA SWPC',
    url: 'https://osirisai.live/docs',
    latitude: null,
    longitude: null,
    severity,
    timestamp: payload?.kp_timestamp || payload?.timestamp || new Date().toISOString(),
    metrics: { planetary_k_index: kp, storm_level: level },
    note: 'Respaldo OSIRIS de NOAA SWPC para continuidad tecnológica, GPS, radio HF y navegación.'
  }];
}

async function fallbackNatural(url?: URL) {
  const [eonet, usgs, firms, gdacs, nhc, tsunami] = await Promise.allSettled([
    fetchJson('https://eonet.gsfc.nasa.gov/api/v3/events?status=open&days=30&limit=100'),
    fetchJson('https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/4.5_day.geojson'),
    fallbackFirms(url),
    fallbackGdacs(),
    fallbackNhc(),
    fallbackTsunami(),
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
  if (gdacs.status === 'fulfilled') items.push(...gdacs.value);
  if (nhc.status === 'fulfilled') items.push(...nhc.value);
  if (tsunami.status === 'fulfilled') items.push(...tsunami.value);

  const directEonetCount = eonet.status === 'fulfilled' ? pickArray(eonet.value).length : 0;
  const directUsgsCount = usgs.status === 'fulfilled' ? pickArray(usgs.value).length : 0;
  const directFirmsCount = firms.status === 'fulfilled' ? firms.value.length : 0;
  if (!directEonetCount || !directUsgsCount || !directFirmsCount) {
    try {
      items.push(...await osirisNaturalFallback({
        earthquakes: !directUsgsCount,
        fires: !directFirmsCount,
        weather: !directEonetCount,
      }));
    } catch (error) {
      console.warn('OSIRIS natural fallback unavailable', error);
    }
  }

  const seen = new Set<string>();
  const deduped = items.filter((x:any) => {
    const key = String(x.id || `${x.source}-${x.title}-${x.timestamp}`);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  return deduped.slice(0, 450);
}

async function fallbackOutages() {
  const until = Math.floor(Date.now() / 1000);
  const from = until - 48 * 3600;
  try {
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
  } catch (directError) {
    try {
      const osiris = await fetchJson(`${OSIRIS_BASE}/radar`);
      const items = normalizeOsirisOutages(osiris);
      if (items.length) return items;
    } catch (osirisError) {
      console.warn('OSIRIS outage fallback unavailable', osirisError);
    }
    throw directError;
  }
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

async function fallbackAir(url?: URL) {
  const requestedLat = finite(url?.searchParams.get('lat'));
  const requestedLon = finite(url?.searchParams.get('lon'));
  const requestedCountry = String(url?.searchParams.get('country') || '').trim();
  const requestedCity = String(url?.searchParams.get('city') || requestedCountry || '').trim();
  const cities:any[] = requestedLat !== null && requestedLon !== null
    ? [[requestedCity || requestedCountry || 'Ubicación seleccionada', requestedCountry || '', requestedLat, requestedLon]]
    : AIR_CITIES;
  const lats = cities.map(c => c[2]).join(',');
  const lons = cities.map(c => c[3]).join(',');

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

  return cities.map((city, i) => {
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


function decodeXml(s: string) {
  return String(s || '')
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&').replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

function tag(block: string, name: string) {
  const re = new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${name}>`, 'i');
  const m = block.match(re);
  return m ? decodeXml(m[1]).replace(/<[^>]+>/g, '').trim() : '';
}

function xmlItems(xml: string) {
  return [...xml.matchAll(/<item(?:\s[^>]*)?>([\s\S]*?)<\/item>/gi)].map(m => m[1]);
}

function xmlEntries(xml: string) {
  return [...xml.matchAll(/<entry(?:\s[^>]*)?>([\s\S]*?)<\/entry>/gi)].map(m => m[1]);
}

function parseCoordPair(v: string) {
  const nums = String(v || '').match(/-?\d+(?:\.\d+)?/g)?.map(Number) || [];
  if (nums.length < 2) return { lat: null, lon: null };
  return { lat: finite(nums[0]), lon: finite(nums[1]) };
}

function gdacsSeverity(level: string) {
  const s = String(level || '').toLowerCase();
  if (s.includes('red')) return 'critical';
  if (s.includes('orange')) return 'warning';
  return 'advisory';
}

async function fallbackGdacs() {
  const xml = await fetchText('https://www.gdacs.org/xml/rss_7d.xml', 'application/rss+xml, application/xml, text/xml');
  const out: any[] = [];
  for (const [i, item] of xmlItems(xml).entries()) {
    const lat = finite(tag(item, 'geo:lat'));
    const lon = finite(tag(item, 'geo:long'));
    const type = tag(item, 'gdacs:eventtype') || 'Desastre';
    const level = tag(item, 'gdacs:alertlevel');
    const from = tag(item, 'gdacs:fromdate') || tag(item, 'pubDate');
    const country = tag(item, 'gdacs:country');
    const title = tag(item, 'title') || `${type} · ${country || 'ubicación no indicada'}`;
    out.push({
      id: `gdacs-${tag(item, 'gdacs:eventid') || i}`,
      title,
      eventType: type,
      country,
      description: tag(item, 'description'),
      source: 'GDACS · ONU / Comisión Europea',
      url: tag(item, 'link') || 'https://www.gdacs.org/',
      latitude: lat,
      longitude: lon,
      severity: gdacsSeverity(level),
      timestamp: from || null,
      metrics: {
        gdacs_alert_level: level || null,
        gdacs_alert_score: finite(tag(item, 'gdacs:alertscore')),
        episode_alert_level: tag(item, 'gdacs:episodealertlevel') || null,
      },
      note: 'GDACS aporta alertas internacionales para conciencia situacional. La relevancia SST debe verificarse frente a exposición y vulnerabilidad reales.'
    });
  }
  return out.slice(0, 150);
}

async function fallbackNhc() {
  const xml = await fetchText('https://www.nhc.noaa.gov/gis-at.xml', 'application/rss+xml, application/xml, text/xml');
  const out: any[] = [];
  for (const [i, item] of xmlItems(xml).entries()) {
    const title = tag(item, 'title');
    if (!/^Summary\s*-/i.test(title)) continue;
    const center = tag(item, 'nhc:center');
    const c = parseCoordPair(center);
    const name = tag(item, 'nhc:name');
    const type = tag(item, 'nhc:type') || 'Ciclón tropical';
    const movement = tag(item, 'nhc:movement');
    const pressure = tag(item, 'nhc:pressure');
    const headline = tag(item, 'nhc:headline');
    out.push({
      id: `nhc-${tag(item, 'nhc:atcf') || i}`,
      title: `${type}${name ? ` ${name}` : ''}`,
      eventType: 'Ciclón tropical',
      country: 'Atlántico / Caribe',
      description: [headline, movement ? `Movimiento: ${movement}` : '', pressure ? `Presión: ${pressure}` : ''].filter(Boolean).join(' · '),
      source: 'NOAA / National Hurricane Center',
      url: tag(item, 'link') || 'https://www.nhc.noaa.gov/',
      latitude: c.lat,
      longitude: c.lon,
      severity: /hurricane|hurac/i.test(type) ? 'warning' : 'advisory',
      timestamp: tag(item, 'pubDate') || tag(item, 'nhc:datetime') || null,
      metrics: { movement: movement || null, pressure: pressure || null, atcf: tag(item, 'nhc:atcf') || null },
      note: 'Los productos NHC son oficiales para ciclones tropicales del Atlántico. El monitor los usa como señal regional y no sustituye avisos nacionales.'
    });
  }
  return out.slice(0, 30);
}

function capSeverity(v: string) {
  const s = String(v || '').toLowerCase();
  if (/(extreme|severe)/.test(s)) return 'critical';
  if (/moderate/.test(s)) return 'warning';
  return 'advisory';
}

async function fallbackTsunami() {
  const urls = [
    ['PTWC', 'https://www.tsunami.gov/events/xml/PHEBCAP.xml'],
    ['NTWC', 'https://www.tsunami.gov/events/xml/PAAQCAP.xml'],
  ] as const;
  const settled = await Promise.allSettled(urls.map(async ([center, url]) => {
    const xml = await fetchText(url, 'application/xml, text/xml');
    const event = tag(xml, 'event') || 'Tsunami';
    const headline = tag(xml, 'headline');
    const severity = tag(xml, 'severity');
    const area = tag(xml, 'areaDesc');
    const circle = tag(xml, 'circle');
    const c = parseCoordPair(circle);
    return {
      id: `tsunami-${center}-${tag(xml, 'identifier') || Date.now()}`,
      title: headline || `${event} · ${center}`,
      eventType: 'Tsunami',
      country: area || 'Caribe / Pacífico',
      description: [tag(xml, 'description'), tag(xml, 'instruction')].filter(Boolean).join(' '),
      source: `NOAA Tsunami Warning System · ${center}`,
      url: 'https://www.tsunami.gov/',
      latitude: c.lat,
      longitude: c.lon,
      severity: capSeverity(severity),
      timestamp: tag(xml, 'sent') || tag(xml, 'effective') || null,
      metrics: {
        urgency: tag(xml, 'urgency') || null,
        certainty: tag(xml, 'certainty') || null,
        cap_severity: severity || null,
        status: tag(xml, 'status') || null,
      },
      note: 'Mensaje CAP de los centros de alerta de tsunami de NOAA. Verificar siempre los avisos nacionales y locales aplicables.'
    };
  }));
  return settled.filter((r): r is PromiseFulfilledResult<any> => r.status === 'fulfilled').map(r => r.value);
}

async function fallbackSpaceWeather() {
  const [scalesResult, alertsResult, kpResult] = await Promise.allSettled([
    fetchJson('https://services.swpc.noaa.gov/products/noaa-scales.json'),
    fetchJson('https://services.swpc.noaa.gov/products/alerts.json'),
    fetchJson('https://services.swpc.noaa.gov/products/noaa-planetary-k-index.json'),
  ]);

  const scales = scalesResult.status === 'fulfilled' ? scalesResult.value : {};
  const alerts = alertsResult.status === 'fulfilled' ? pickArray(alertsResult.value) : [];
  const kpRows = kpResult.status === 'fulfilled' && Array.isArray(kpResult.value) ? kpResult.value : [];

  const latestKpRow = kpRows.length ? kpRows[kpRows.length - 1] : null;
  const kp = Array.isArray(latestKpRow) ? finite(latestKpRow[1]) : finite(latestKpRow?.kp_index ?? latestKpRow?.kp);

  const scaleValues: any[] = [];
  for (const key of ['R','S','G']) {
    const obj = scales?.[key] || scales?.[key.toLowerCase()] || {};
    const value = Number(obj?.Scale ?? obj?.scale ?? obj?.CurrentScale ?? obj?.currentScale);
    if (Number.isFinite(value)) scaleValues.push({ key, value });
  }
  const maxScale = scaleValues.reduce((m, x) => Math.max(m, x.value), 0);
  const severity = maxScale >= 4 || (kp !== null && kp >= 8) ? 'critical' : maxScale >= 2 || (kp !== null && kp >= 6) ? 'warning' : 'advisory';

  const recentAlerts = alerts.slice(-8).map((a: any) => a?.message || a?.product_text || a?.text || '').filter(Boolean);
  const directAvailable = kp !== null || scaleValues.length > 0 || recentAlerts.length > 0;
  if (!directAvailable) {
    try {
      const osiris = await fetchJson(`${OSIRIS_BASE}/space-weather`);
      const fallback = normalizeOsirisSpaceWeather(osiris);
      if (fallback.length) return fallback;
    } catch (error) {
      console.warn('OSIRIS space-weather fallback unavailable', error);
    }
  }
  return [{
    id: `swpc-${new Date().toISOString().slice(0,13)}`,
    title: `Clima espacial · NOAA SWPC${kp !== null ? ` · Kp ${kp.toFixed(1)}` : ''}`,
    eventType: 'Clima espacial',
    country: 'Global',
    description: recentAlerts.slice(-3).join(' | ') || 'Condiciones y alertas de clima espacial NOAA SWPC.',
    source: 'NOAA / Space Weather Prediction Center',
    url: 'https://www.swpc.noaa.gov/',
    latitude: null,
    longitude: null,
    severity,
    timestamp: new Date().toISOString(),
    metrics: {
      planetary_k_index: kp,
      noaa_scales: scaleValues,
    },
    note: 'La relevancia SST se concentra en continuidad tecnológica, GPS, comunicaciones HF, navegación y sistemas dependientes de infraestructura espacial.'
  }];
}

async function openAqNearby(lat: number, lon: number) {
  const apiKey = Deno.env.get('OPENAQ_API_KEY');
  if (!apiKey) throw new Error('OPENAQ_API_KEY_NOT_CONFIGURED');

  const headers = { 'X-API-Key': apiKey };
  const locationsPayload = await fetchJson(
    `https://api.openaq.org/v3/locations?coordinates=${encodeURIComponent(`${lat.toFixed(4)},${lon.toFixed(4)}`)}&radius=25000&limit=20`,
    headers
  );
  const locations = pickArray(locationsPayload);
  if (!locations.length) {
    return {
      feed: 'openaq',
      available: false,
      query: { lat, lon, radius_m: 25000 },
      station: null,
      measurements: [],
      age_hours: null,
      freshness: 'none',
      note: 'OpenAQ no reportó estaciones dentro de 25 km del punto consultado.'
    };
  }

  let best: any = null;
  for (const loc of locations) {
    const ll = loc?.coordinates || {};
    const la = finite(ll.latitude ?? loc.latitude);
    const lo = finite(ll.longitude ?? loc.longitude);
    if (la === null || lo === null) continue;
    const d = haversineKm(lat, lon, la, lo);
    if (!best || d < best.distance_km) best = { ...loc, latitude: la, longitude: lo, distance_km: d };
  }
  if (!best) best = locations[0];

  const locationId = Number(best.id);
  const latestPayload = await fetchJson(`https://api.openaq.org/v3/locations/${locationId}/latest?limit=100`, headers);
  const latest = pickArray(latestPayload);

  const sensorMap = new Map<number, any>();
  for (const s of best.sensors || []) {
    sensorMap.set(Number(s.id), s);
  }

  const measurements = latest.map((m: any) => {
    const sensor = sensorMap.get(Number(m.sensorsId));
    const parameter = sensor?.parameter || {};
    return {
      parameter: parameter.name || parameter.displayName || sensor?.name || `sensor_${m.sensorsId}`,
      display_name: parameter.displayName || parameter.name || '',
      units: parameter.units || '',
      value: finite(m.value),
      datetime_utc: m?.datetime?.utc || null,
      datetime_local: m?.datetime?.local || null,
      sensor_id: m.sensorsId ?? null,
    };
  }).filter((m: any) => m.value !== null);

  const times = measurements
    .map((m:any) => m.datetime_utc ? new Date(m.datetime_utc).getTime() : NaN)
    .filter((t:number) => Number.isFinite(t));
  const latestMs = times.length ? Math.max(...times) : NaN;
  const ageHours = Number.isFinite(latestMs) ? Math.max(0, (Date.now() - latestMs) / 3_600_000) : null;
  const freshness = ageHours === null ? 'unknown' : ageHours <= 6 ? 'recent' : ageHours <= 24 ? 'aging' : 'old';

  return {
    feed: 'openaq',
    available: measurements.length > 0,
    query: { lat, lon, radius_m: 25000 },
    station: {
      id: best.id,
      name: best.name || best.locality || `OpenAQ ${best.id}`,
      locality: best.locality || null,
      country: best.country?.name || best.country?.code || null,
      provider: best.provider?.name || null,
      owner: best.owner?.name || null,
      is_monitor: best.isMonitor ?? null,
      latitude: best.latitude ?? best.coordinates?.latitude ?? null,
      longitude: best.longitude ?? best.coordinates?.longitude ?? null,
      distance_km: best.distance_km ?? null,
    },
    measurements,
    age_hours: ageHours,
    freshness,
    note: 'OpenAQ aporta mediciones ambientales de estaciones/sensores cuando existe cobertura. No equivale a una medición ocupacional en el puesto de trabajo.'
  };
}

async function hdxContext(locationCode = 'VEN') {
  const appIdentifier = Deno.env.get('HDX_HAPI_APP_IDENTIFIER');
  if (!appIdentifier) throw new Error('HDX_HAPI_APP_IDENTIFIER_NOT_CONFIGURED');

  const url = `https://hapi.humdata.org/api/v2/geography-infrastructure/baseline-population?location_code=${encodeURIComponent(locationCode)}&output_format=json&offset=0&limit=5000&admin_level=1&app_identifier=${encodeURIComponent(appIdentifier)}`;
  const payload = await fetchJson(url);
  const rows = pickArray(payload);

  const filtered = rows.filter((r: any) => {
    const gender = String(r.gender ?? r.gender_code ?? '').toLowerCase();
    const age = String(r.age_range ?? r.age_range_code ?? '').toLowerCase();
    return (!gender || gender === 'all') && (!age || age === 'all');
  });
  const useRows = filtered.length ? filtered : rows;

  const byAdmin = new Map<string, any>();
  for (const r of useRows) {
    const code = String(r.admin1_code || r.admin1_name || '');
    if (!code) continue;
    const pop = finite(r.population);
    if (pop === null) continue;
    const prev = byAdmin.get(code);
    if (!prev || pop > prev.population) {
      byAdmin.set(code, {
        admin1_code: r.admin1_code || null,
        admin1_name: r.admin1_name || null,
        population: pop,
        reference_period_start: r.reference_period_start || null,
        reference_period_end: r.reference_period_end || null,
        resource_hdx_id: r.resource_hdx_id || null,
      });
    }
  }
  return {
    feed: 'hdx',
    location_code: locationCode,
    source: 'OCHA HDX HAPI',
    data: [...byAdmin.values()].sort((a,b) => (b.population || 0) - (a.population || 0)),
    note: 'Población de referencia subnacional para contextualizar exposición territorial. Son datos demográficos de línea base, no conteos de personas afectadas por una emergencia.'
  };
}

function haversineKm(lat1:number, lon1:number, lat2:number, lon2:number) {
  const R = 6371;
  const r = (v:number) => v * Math.PI / 180;
  const dLat = r(lat2-lat1), dLon = r(lon2-lon1);
  const a = Math.sin(dLat/2)**2 + Math.cos(r(lat1))*Math.cos(r(lat2))*Math.sin(dLon/2)**2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

async function getFeed(feed: string, url?: URL) {
  if (feed === 'natural') return fallbackNatural(url);
  if (feed === 'outages') return fallbackOutages();
  if (feed === 'radiation') return fallbackRadiation();
  if (feed === 'air') return fallbackAir(url);
  if (feed === 'space') return fallbackSpaceWeather();
  if (feed === 'openaq') {
    const lat = finite(url?.searchParams.get('lat'));
    const lon = finite(url?.searchParams.get('lon'));
    if (lat === null || lon === null) throw new Error('OPENAQ_COORDINATES_REQUIRED');
    return openAqNearby(lat, lon);
  }
  if (feed === 'hdx') {
    return hdxContext(url?.searchParams.get('location_code') || 'VEN');
  }
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
      osiris_fallback_enabled: true,
      osiris_base: OSIRIS_BASE,
      osiris_fallback_endpoints: ['earthquakes','fires','weather','radar','space-weather'],
      nasa_firms_map_key_configured: Boolean(Deno.env.get('NASA_FIRMS_MAP_KEY')),
      openaq_api_key_configured: Boolean(Deno.env.get('OPENAQ_API_KEY')),
      hdx_hapi_app_identifier_configured: Boolean(Deno.env.get('HDX_HAPI_APP_IDENTIFIER')),
      reliefweb_appname_configured: Boolean(Deno.env.get('RELIEFWEB_APPNAME')),
      environment_enrichment: 'open-meteo-air-quality-plus-weather',
      natural_sources: ['NASA EONET', 'USGS', 'NASA FIRMS / VIIRS', 'GDACS', 'NOAA/NHC', 'NOAA Tsunami'],
      continuity_sources: ['IODA / Georgia Tech', 'NOAA SWPC'],
      context_sources: ['OpenAQ', 'OCHA HDX HAPI', 'OpenStreetMap / Overpass'],
    }, 200, origin, { 'Cache-Control': 'no-store' });
  }

  if (!['natural','outages','radiation','air','space','openaq','hdx'].includes(feed)) {
    return json({
      error: 'INVALID_FEED',
      allowed: ['natural','outages','radiation','air','space','openaq','hdx','health']
    }, 400, origin);
  }

  try {
    const items = await getFeed(feed, url);

    const source =
      feed === 'natural' ? 'NASA EONET + USGS + NASA FIRMS' :
      feed === 'outages' ? 'IODA / Georgia Tech' :
      feed === 'radiation' ? 'Safecast' :
      feed === 'air' ? 'Open-Meteo / CAMS + Weather' :
      feed === 'space' ? 'NOAA SWPC' :
      feed === 'openaq' ? 'OpenAQ' :
      'OCHA HDX HAPI';

    const osirisFallbackUsed = Array.isArray(items)
      && items.some((item:any) => /^OSIRIS\b/i.test(String(item?.source || '')));
    const responseSource = osirisFallbackUsed ? `${source} + OSIRIS fallback` : source;

    return json({
      feed,
      fetched_at: new Date().toISOString(),
      source: responseSource,
      provider_mode: osirisFallbackUsed ? 'osiris-fallback' : 'direct-sources',
      osiris_fallback_used: osirisFallbackUsed,
      firms_enabled: feed === 'natural' ? Boolean(Deno.env.get('NASA_FIRMS_MAP_KEY')) : undefined,
      openaq_enabled: feed === 'openaq' ? Boolean(Deno.env.get('OPENAQ_API_KEY')) : undefined,
      hdx_enabled: feed === 'hdx' ? Boolean(Deno.env.get('HDX_HAPI_APP_IDENTIFIER')) : undefined,
      data: items,
    }, 200, origin, {
      'Cache-Control': 'public, max-age=120, s-maxage=120, stale-while-revalidate=300',
      'X-Data-Source': responseSource,
    });
  } catch (error) {
    console.error('Source failure', feed, error);
    return json({ error: 'DATA_SOURCE_UNAVAILABLE', feed }, 502, origin);
  }
});