# Monitor SST — La Movida de SST Plus

Interfaz mobile-first de inteligencia situacional SST inspirada en la arquitectura de World Monitor y conectada a fuentes públicas verificables.

## Arquitectura

```text
emergencias.movidasst.com/monitor/
        │
        ▼
Supabase Edge Function: world-monitor-sst
        │
        ├── Si existe WORLD_MONITOR_API_KEY → World Monitor REST API
        │
        └── Sin clave / si falla → fuentes públicas directas
              ├── NASA EONET + USGS
              ├── IODA / Georgia Tech
              ├── Safecast
              └── Open-Meteo / CAMS
```

La aplicación funciona **sin una clave de World Monitor**. Una clave `wm_live_...` es únicamente una capa opcional de enriquecimiento y, si se configura, permanece siempre en el servidor.

## Fuentes integradas

### Modo World Monitor opcional

- `natural` → `/api/natural/v1/list-natural-events`
- `outages` → `/api/infrastructure/v1/list-internet-outages`
- `radiation` → `/api/radiation/v1/list-radiation-observations`
- `air` → `/api/climate/v1/list-air-quality-data`

### Modo público automático

- Eventos naturales: NASA EONET + USGS.
- Conectividad: IODA, Georgia Tech.
- Radiación: Safecast.
- Calidad del aire: Open-Meteo / Copernicus CAMS.

## World Monitor PRO (opcional)

Si en el futuro se dispone de una clave de World Monitor, crear en Supabase Edge Functions el secreto:

- Nombre: `WORLD_MONITOR_API_KEY`
- Valor: `wm_live_...`

Nunca guardar esa clave en HTML, JavaScript, GitHub, issues ni commits. La Edge Function detecta automáticamente el secreto y prioriza World Monitor; ante fallo vuelve a las fuentes públicas.

## Seguridad aplicada

- Proxy de solo lectura (`GET` / `OPTIONS`).
- Rutas upstream en lista cerrada; el cliente no puede convertirlo en proxy arbitrario.
- CORS restringido a `https://emergencias.movidasst.com` y localhost de desarrollo.
- Ninguna credencial se expone al navegador.
- Timeout de 12 segundos.
- Límite defensivo por IP en la instancia Edge.
- Caché HTTP corta para reducir consultas repetidas.
- Sin `service_role`, sin cambios de tablas y sin migraciones.
- Degradación automática: World Monitor → fuentes públicas.

## Criterio SST

Una señal externa no equivale por sí sola a un riesgo ocupacional. Debe interpretarse considerando exposición, población trabajadora potencialmente afectada, vulnerabilidad, controles existentes, continuidad operacional y confirmación por fuentes oficiales locales.

## Licencia y atribución

El repositorio mantiene AGPL-3.0. World Monitor distribuye su código bajo AGPL-3.0-only. Cada dato conserva la identificación de su fuente; las condiciones de uso de cada proveedor siguen siendo aplicables.
