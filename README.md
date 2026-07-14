# Calc3D — Web

Frontend React + Vite + TS. Consume la API (`VITE_API_URL`) y el motor
`@calc3d/shared` (copia sincronizada desde `calc3d-api`).

## Setup
    pnpm install                 # compila shared en postinstall
    cp apps/web/.env.example apps/web/.env   # y editar VITE_API_URL

## Desarrollo
    pnpm dev                     # Vite (5173). Con el launch "web-preview": 5180

## Build
    pnpm build                   # tsc --noEmit + vite build → apps/web/dist

## shared (IMPORTANTE)
Este repo tiene una COPIA de `packages/shared`. La fuente de verdad es
`calc3d-api`. Antes de tocar el motor, edítalo en calc3d-api y luego:
    pnpm sync:shared             # copia desde ../calc3d-api por defecto
    pnpm test:shared             # verifica
Subir SHARED_VERSION + version del package.json a la par en ambos repos.

## Deploy
Estático: subir `apps/web/dist` a un CDN, o usar el `Dockerfile` (nginx con
fallback SPA). Configurar `VITE_API_URL` al dominio real de la API en build.
