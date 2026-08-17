# Monitor SST — La Movida de SST Plus

Interfaz mobile-first para vigilancia situacional SST basada en datos de World Monitor.

## Arquitectura

```text
emergencias.movidasst.com/monitor/
        │
        ▼
Supabase Edge Function: world-monitor-sst
        │  X-WorldMonitor-Key (secreto, solo servidor)
        ▼
World Monitor REST API
```

La clave de World Monitor **nunca se incluye en el HTML o JavaScript público**.

## Fuentes integradas

- `natural` → `/api/natural/v1/list-natural-events`
- `outages` → `/api/infrastructure/v1/list-internet-outages`
- `radiation` → `/api/radiation/v1/list-radiation-observations`
- `air` → `/api/climate/v1/list-air-quality-data`

## Único paso manual requerido

En el proyecto Supabase `Directorio-movidasst-plus`, crear un secreto de Edge Functions:

- Nombre: `WORLD_MONITOR_API_KEY`
- Valor: la clave `wm_live_...` emitida por World Monitor.

No guardar ni pegar esa clave en `index.html`, `app.js`, GitHub, issues o commits.

Después de guardar el secreto, abrir:

`https://emergencias.movidasst.com/monitor/`

## Seguridad aplicada

- Proxy de solo lectura (`GET` / `OPTIONS`).
- Rutas upstream en lista cerrada; el cliente no puede convertirlo en proxy arbitrario.
- CORS restringido a `https://emergencias.movidasst.com` y localhost de desarrollo.
- La respuesta upstream no expone la API key.
- Timeout de 12 segundos.
- Límite defensivo por IP en la instancia Edge.
- Caché HTTP corta para reducir consultas repetidas.
- Sin `service_role`, sin credenciales de Supabase y sin cambios de base de datos.

## Licencia y atribución

El repositorio mantiene AGPL-3.0. World Monitor también distribuye su código bajo AGPL-3.0-only. Los datos agregados conservan la atribución de sus fuentes originales cuando la API la proporciona.
