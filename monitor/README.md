# Monitor SST — La Movida de SST Plus

Interfaz mobile-first de inteligencia situacional SST para Venezuela, Latinoamérica y contexto mundial.

## Arquitectura

```text
emergencias.movidasst.com/monitor/
        │
        ▼
Supabase Edge Function: world-monitor-sst   ← slug heredado
        │
        ├── Fuentes directas (primarias)
        │     ├── NASA EONET
        │     ├── USGS
        │     ├── NASA FIRMS / VIIRS
        │     ├── GDACS
        │     ├── NOAA / NHC
        │     ├── NOAA Tsunami
        │     ├── IODA / Georgia Tech
        │     ├── Safecast
        │     ├── Open-Meteo / CAMS
        │     └── NOAA SWPC
        │
        └── OSIRIS Intelligence (respaldo automático)
              ├── /api/earthquakes
              ├── /api/fires
              ├── /api/weather
              ├── /api/radar
              └── /api/space-weather
```

La aplicación **prioriza siempre las fuentes directas**. OSIRIS no es la fuente principal ni una dependencia única: se usa únicamente como capa de redundancia cuando una familia de datos directos falla o devuelve información vacía.

## Capas visibles

- Eventos naturales: sismos, incendios/anomalías térmicas, tormentas, volcanes, inundaciones, ciclones, tsunami y alertas GDACS.
- Conectividad: IODA / Georgia Tech.
- Radiación ionizante: Safecast.
- Exposición ambiental: UV, AQI, PM2.5, PM10, ozono, polvo, temperatura, sensación térmica, humedad, lluvia y viento.
- Clima espacial: NOAA SWPC, activado progresivamente desde el backend.

## Fuentes contextuales

- OpenAQ: mediciones ambientales observadas cuando existe cobertura y API configurada.
- OCHA HDX HAPI: contexto territorial.
- OpenStreetMap / Overpass: infraestructura y servicios cercanos.

## Criterio SST

Una señal externa no equivale por sí sola a un riesgo ocupacional ni a daño confirmado. El monitor ayuda a priorizar verificaciones considerando:

1. ubicación y proximidad;
2. severidad de la señal;
3. posible exposición de trabajadores;
4. instalaciones y rutas;
5. servicios y comunicaciones;
6. continuidad operacional.

La capa **Impacto Venezuela** es una priorización preventiva, no un conteo de personas afectadas ni una predicción de daño.

## Seguridad

- Edge Function de solo lectura (`GET` / `OPTIONS`).
- Orígenes web permitidos en lista cerrada.
- Sin `service_role` en el navegador.
- Timeout en consultas externas.
- Límite defensivo por IP.
- Caché HTTP corta.
- Degradación por proveedor: fuente directa → OSIRIS cuando corresponde.
- Ninguna credencial de proveedor se guarda en HTML o JavaScript público.

## OSIRIS

OSIRIS Intelligence expone endpoints públicos normalizados y sin API key para varias fuentes de interés. En este proyecto se aprovecha solamente como **respaldo de continuidad del dato**; no se integran sus funciones OSINT de personas, RECON, cripto, escaneo ni otras áreas ajenas al propósito de SST y emergencias.

## Licencia y atribución

El repositorio de La Movida mantiene su licencia AGPL-3.0. OSIRIS se distribuye bajo licencia MIT. Cada dato conserva su proveedor/fuente y las condiciones de uso de los proveedores externos siguen siendo aplicables.
