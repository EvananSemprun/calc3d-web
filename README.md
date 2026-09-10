# Calc3D — Web

> Panel web de **Calc3D**: calculadora de precios y gestión integral para talleres de impresión 3D.

![React](https://img.shields.io/badge/React-18-61DAFB?logo=react&logoColor=black)
![Vite](https://img.shields.io/badge/Vite-6-646CFF?logo=vite&logoColor=white)
![TypeScript](https://img.shields.io/badge/TypeScript-5.7-3178C6?logo=typescript&logoColor=white)
![TailwindCSS](https://img.shields.io/badge/Tailwind-3.4-06B6D4?logo=tailwindcss&logoColor=white)
![pnpm](https://img.shields.io/badge/pnpm-workspace-F69220?logo=pnpm&logoColor=white)

Frontend de un solo dueño (self-hosted) que consume la
[API de Calc3D](https://github.com/EvananSemprun/calc3d-api). Identidad visual
**"panel de precisión"**: oro sobre navy profundo, paleta estricta de 5 colores,
superficies glass y micro-animaciones (respetando `prefers-reduced-motion`).

## Funcionalidades

- **Calculadora en wizard de 5 pasos** con cálculo en vivo: material, desgaste,
  electricidad, insumos, mano de obra, merma por riesgo y tramos de mayoreo.
- **Presupuestos** con versionado, PDF/CSV y ciclo de cotización (conversión,
  seguimiento, vencidos).
- **Pedidos** con abonos, cuentas por cobrar, calendario de entregas, nota de
  entrega en PDF y aviso por WhatsApp.
- **Productos** con recosteo contra el catálogo de hoy y **alerta de
  rentabilidad por devaluación**.
- **Multi-moneda**: costeo en USD, presentación en bolívares con tasas con
  nombre (BCV, paralelo…), tasa congelada por documento y **cobro protegido**.
- **Finanzas**: dashboard con KPIs, punto de equilibrio, ventas y ledger único
  de gastos enlazado al catálogo.
- **Publicidad**: campañas con atribución, ROAS/ROI, recomendación automática y
  export CSV/PDF.
- **CRM**: directorio de contactos con mapa interactivo (Leaflet + OSM).
- UX: buscador global `Ctrl/⌘-K`, tema claro/oscuro, skeletons, responsive
  tabla↔tarjetas, respaldo de datos en JSON/CSV.

## Stack

React 18 · Vite 6 · TypeScript · Tailwind CSS · TanStack Query ·
React Hook Form + Zod · Recharts · Leaflet · motion (Framer Motion) · axios

## Estructura

| Ruta | Qué es |
|---|---|
| `apps/web` | Aplicación React (pages, features, components) |
| `packages/shared` | **Copia** del motor de cálculo + contratos Zod. La fuente de verdad vive en [calc3d-api](https://github.com/EvananSemprun/calc3d-api). |

## Requisitos

- Node.js ≥ 20
- pnpm (`npm install -g pnpm`)
- La [API de Calc3D](https://github.com/EvananSemprun/calc3d-api) corriendo

## Puesta en marcha

```bash
pnpm install                              # compila shared en el postinstall
cp apps/web/.env.example apps/web/.env    # editar VITE_API_URL
pnpm dev                                  # Vite en http://localhost:5173
```

Para probar contra la API local en el puerto 3001:
`VITE_API_URL=http://localhost:3001/api` (la API debe permitir el origen del
front vía su `WEB_ORIGIN`).

## Scripts

| Comando | Qué hace |
|---|---|
| `pnpm dev` | Servidor de desarrollo (Vite) |
| `pnpm build` | `tsc --noEmit` + build de producción → `apps/web/dist` |
| `pnpm preview` | Sirve el build para revisarlo |
| `pnpm sync:shared` | Trae `packages/shared/src` desde `../calc3d-api` (deben ser carpetas hermanas) |
| `pnpm test:shared` | Tests del motor de cálculo (tras sincronizar) |
| `pnpm -r lint` | Lint de todo el workspace |

## El paquete `shared` (importante)

Este repo tiene una **copia** de `packages/shared`; **no se edita aquí** (se
sobrescribe al sincronizar). El flujo correcto:

1. Editar motor/contratos en **calc3d-api**.
2. Aquí: `pnpm sync:shared` (solo copia `src` — recompilar shared después) y
   verificar con `pnpm test:shared`.
3. Subir `SHARED_VERSION` + `version` del `package.json` a la par en ambos repos.

## Deploy

Build estático: subir `apps/web/dist` a un CDN, o usar el `Dockerfile` incluido
(nginx con fallback SPA). Definir `VITE_API_URL` con el dominio real de la API
**en tiempo de build**.

## Ecosistema Calc3D

| Repo | Qué es |
|---|---|
| [calc3d-api](https://github.com/EvananSemprun/calc3d-api) | Backend + motor de cálculo canónico |
| **calc3d-web** (este) | Panel web (React + Vite) |
| [calc3d-landing](https://github.com/EvananSemprun/calc3d-landing) | Sitio público / tienda de Banano Lab (Vite, sin React). ⚠️ El nombre dice "landing" por historia git |

## Levantar el panel en local

```bash
pnpm dev
```

Queda en **http://localhost:5180** — un solo puerto, fijado en `vite.config.ts`.
Con la API corriendo (`pnpm dev` en `calc3d-api`, puerto 3001) ya está todo.

> ⚠️ **El 5180 no es caprichoso**: es el que la API acepta por CORS
> (`WEB_ORIGIN`). Por eso va con `strictPort`, para fallar en vez de saltar a
> otro puerto donde el login se rompería sin explicación.
>
> Si necesitás apuntar a otra API, copiá `apps/web/.env.example` a
> `apps/web/.env.local` y cambiá `VITE_API_URL`.
