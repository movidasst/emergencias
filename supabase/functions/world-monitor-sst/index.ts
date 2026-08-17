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
  return (
    req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    req.headers.get('cf-connecting-ip') ||
    'unknown'
  );
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

async function fetchWorldMonitor(path: string, apiKey?: string) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12_000);
  try {
    const headers: Record<string, string> = {
      Accept: 'application/json',
      'User-Agent': 'La-Movida-SST-Monitor/1.0',
    };
    if (apiKey) headers['X-WorldMonitor-Key'] = apiKey;

    const upstream = await fetch(`${WORLD_MONITOR_BASE}${path}`, {
      method: 'GET',
      headers,
      signal: controller.signal,
    });

    const contentType = upstream.headers.get('content-type') || '';
    const payload = contentType.includes('application/json')
      ? await upstream.json()
      : { raw: await upstream.text() };

    return { upstream, payload };
  } finally {
    clearTimeout(timeout);
  }
}

Deno.serve(async (req: Request) => {
  const origin = req.headers.get('origin') || '';

  if (!ALLOWED_ORIGINS.has(origin)) {
    return new Response(JSON.stringify({ error: 'ORIGIN_NOT_ALLOWED' }), {
      status: 403,
      headers: { 'Content-Type': 'application/json; charset=utf-8', Vary: 'Origin' },
    });
  }

  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: cors(origin) });
  }

  if (req.method !== 'GET') {
    return json({ error: 'METHOD_NOT_ALLOWED' }, 405, origin, { Allow: 'GET, OPTIONS' });
  }

  const ip = clientIp(req);
  if (rateLimited(ip)) {
    return json({ error: 'RATE_LIMITED' }, 429, origin, { 'Retry-After': '60' });
  }

  const url = new URL(req.url);
  const feed = url.searchParams.get('feed') || 'natural';

  // World Monitor documents /api/health as a public endpoint. This gives us a
  // safe connectivity/freshness diagnostic without bypassing API-key gating.
  if (feed === 'health') {
    try {
      const { upstream, payload } = await fetchWorldMonitor('/api/health?compact=1');
      if (!upstream.ok) {
        return json(
          { error: 'WORLD_MONITOR_HEALTH_UNAVAILABLE', upstream_status: upstream.status },
          upstream.status >= 500 ? 502 : upstream.status,
          origin,
        );
      }
      return json(
        {
          feed: 'health',
          fetched_at: new Date().toISOString(),
          source: 'World Monitor',
          data: payload,
        },
        200,
        origin,
        { 'Cache-Control': 'no-store', 'X-Data-Source': 'World Monitor' },
      );
    } catch (error) {
      const isAbort = error instanceof DOMException && error.name === 'AbortError';
      console.error('World Monitor health failure', error);
      return json({ error: isAbort ? 'UPSTREAM_TIMEOUT' : 'UPSTREAM_UNAVAILABLE' }, 502, origin);
    }
  }

  const endpoint = FEEDS[feed];
  if (!endpoint) {
    return json({ error: 'INVALID_FEED', allowed: [...Object.keys(FEEDS), 'health'] }, 400, origin);
  }

  const apiKey = Deno.env.get('WORLD_MONITOR_API_KEY');
  if (!apiKey) {
    return json(
      {
        error: 'WORLD_MONITOR_API_KEY_NOT_CONFIGURED',
        provider: 'World Monitor',
        required_secret: 'WORLD_MONITOR_API_KEY',
      },
      503,
      origin,
    );
  }

  try {
    const { upstream, payload } = await fetchWorldMonitor(endpoint, apiKey);

    if (!upstream.ok) {
      console.error('World Monitor upstream error', upstream.status, payload);
      return json(
        { error: 'UPSTREAM_ERROR', upstream_status: upstream.status },
        upstream.status >= 500 ? 502 : upstream.status,
        origin,
      );
    }

    return json(
      {
        feed,
        fetched_at: new Date().toISOString(),
        source: 'World Monitor',
        data: payload,
      },
      200,
      origin,
      {
        'Cache-Control': 'public, max-age=60, s-maxage=60, stale-while-revalidate=120',
        'X-Data-Source': 'World Monitor',
      },
    );
  } catch (error) {
    const isAbort = error instanceof DOMException && error.name === 'AbortError';
    console.error('World Monitor proxy failure', error);
    return json({ error: isAbort ? 'UPSTREAM_TIMEOUT' : 'UPSTREAM_UNAVAILABLE' }, 502, origin);
  }
});
