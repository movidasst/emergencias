declare const Deno: any;

const ALLOWED_ORIGINS = new Set([
  'https://emergencias.movidasst.com',
  'http://localhost:3000',
  'http://localhost:5173',
]);
const BBOX = '-74.8,-0.8,-57.8,13.8';
const SOURCES = ['VIIRS_NOAA20_NRT','VIIRS_NOAA21_NRT'] as const;
const WINDOW_MS = 60_000;
const MAX_REQUESTS = 60;
const buckets = new Map<string,{count:number;resetAt:number}>();

function cors(origin:string){return{
  'Access-Control-Allow-Origin':origin,
  'Access-Control-Allow-Headers':'content-type',
  'Access-Control-Allow-Methods':'GET, OPTIONS',
  'Access-Control-Max-Age':'86400','Vary':'Origin'
}}
function json(body:unknown,status:number,origin:string){return new Response(JSON.stringify(body),{status,headers:{...cors(origin),'Content-Type':'application/json; charset=utf-8','X-Content-Type-Options':'nosniff','Cache-Control':'public, max-age=120, s-maxage=120, stale-while-revalidate=300'}})}
function ip(req:Request){return req.headers.get('x-forwarded-for')?.split(',')[0]?.trim()||req.headers.get('cf-connecting-ip')||'unknown'}
function limited(key:string){const now=Date.now(),b=buckets.get(key);if(!b||now>=b.resetAt){buckets.set(key,{count:1,resetAt:now+WINDOW_MS});return false}b.count++;return b.count>MAX_REQUESTS}
function finite(v:unknown){const n=Number(v);return Number.isFinite(n)?n:null}

async function fetchText(url:string){
  const controller=new AbortController();
  const timeout=setTimeout(()=>controller.abort(),12000);
  try{
    const res=await fetch(url,{headers:{Accept:'text/csv,text/plain;q=0.9,*/*;q=0.1','User-Agent':'La-Movida-SST-FIRMS/1.0'},signal:controller.signal});
    if(!res.ok)throw new Error(`HTTP_${res.status}`);
    return await res.text();
  }finally{clearTimeout(timeout)}
}

function parseCsv(text:string):Record<string,string>[] {
  const lines=text.replace(/^\uFEFF/,'').split(/\r?\n/).filter(Boolean);
  if(lines.length<2)return[];
  const parse=(line:string)=>{const out:string[]=[];let val='',quoted=false;for(let i=0;i<line.length;i++){const ch=line[i];if(ch==='"'){if(quoted&&line[i+1]==='"'){val+='"';i++}else quoted=!quoted}else if(ch===','&&!quoted){out.push(val);val=''}else val+=ch}out.push(val);return out};
  const headers=parse(lines[0]).map(x=>x.trim());
  return lines.slice(1).map(line=>{const cells=parse(line);return Object.fromEntries(headers.map((h,i)=>[h,cells[i]??'']))});
}
function timestamp(date:string,time:string){if(!date)return null;const hhmm=String(time||'').padStart(4,'0');const iso=`${date}T${hhmm.slice(0,2)}:${hhmm.slice(2,4)}:00Z`;return Number.isNaN(Date.parse(iso))?date:iso}
function severity(confidence:string){return /high|h$/i.test(String(confidence||'').trim())?'warning':'advisory'}

async function hotspots(mapKey:string){
  const results=await Promise.allSettled(SOURCES.map(source=>fetchText(`https://firms.modaps.eosdis.nasa.gov/api/area/csv/${encodeURIComponent(mapKey)}/${source}/${BBOX}/1`)));
  const rows:Array<Record<string,string>&{_source:string}>=[];
  results.forEach((r,i)=>{if(r.status==='fulfilled')parseCsv(r.value).forEach(row=>rows.push({...row,_source:SOURCES[i]}))});
  if(!rows.length&&results.every(r=>r.status==='rejected'))throw new Error('FIRMS_UNAVAILABLE');
  const unique=new Map<string,any>();
  for(const r of rows){
    const lat=finite(r.latitude),lon=finite(r.longitude);if(lat===null||lon===null)continue;
    const key=`${lat.toFixed(3)}|${lon.toFixed(3)}|${r.acq_date}|${r.acq_time}`;
    const confidence=String(r.confidence||'').trim()||'no indicada';const frp=finite(r.frp);
    const sourceLabel=r._source.replace('_NRT','').replaceAll('_',' ');
    const item={
      id:`firms-${key}`,title:`Foco térmico satelital · ${sourceLabel}`,
      eventType:'Fuego activo / anomalía térmica',country:'Venezuela',
      description:`NASA FIRMS active fire / anomalía térmica · confianza ${confidence}${frp!==null?` · FRP ${frp.toFixed(1)} MW`:''}${r.daynight?` · ${r.daynight==='D'?'detección diurna':'detección nocturna'}`:''}`,
      source:'NASA FIRMS · VIIRS',url:'https://firms.modaps.eosdis.nasa.gov/map/',
      latitude:lat,longitude:lon,severity:severity(confidence),timestamp:timestamp(r.acq_date,r.acq_time),
      metrics:{confidence,frp_mw:frp,satellite:r.satellite||'',instrument:r.instrument||'VIIRS',source_product:r._source},
      note:'FIRMS detecta fuego activo y anomalías térmicas por satélite. La detección debe contextualizarse antes de asumir un incendio forestal con impacto ocupacional.'
    };
    const current=unique.get(key);if(!current||(current.severity==='advisory'&&item.severity==='warning'))unique.set(key,item);
  }
  return [...unique.values()].slice(0,80);
}

Deno.serve(async(req:Request)=>{
  const origin=req.headers.get('origin')||'';
  if(!ALLOWED_ORIGINS.has(origin))return new Response(JSON.stringify({error:'ORIGIN_NOT_ALLOWED'}),{status:403,headers:{'Content-Type':'application/json; charset=utf-8',Vary:'Origin'}});
  if(req.method==='OPTIONS')return new Response('ok',{headers:cors(origin)});
  if(req.method!=='GET')return json({error:'METHOD_NOT_ALLOWED'},405,origin);
  if(limited(ip(req)))return json({error:'RATE_LIMITED'},429,origin);
  const mapKey=Deno.env.get('NASA_FIRMS_MAP_KEY');
  if(!mapKey)return json({error:'FIRMS_NOT_CONFIGURED',configured:false},503,origin);
  const u=new URL(req.url);
  if(u.searchParams.get('health')==='1')return json({ok:true,configured:true,source:'NASA FIRMS',products:[...SOURCES],bbox:BBOX},200,origin);
  try{
    const data=await hotspots(mapKey);
    return json({feed:'fires',fetched_at:new Date().toISOString(),source:'NASA FIRMS · VIIRS',provider_mode:'nasa-firms',configured:true,data},200,origin);
  }catch(error){console.error('NASA FIRMS failure',error);return json({error:'FIRMS_UNAVAILABLE',configured:true},502,origin)}
});