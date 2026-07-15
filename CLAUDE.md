# CLAUDE.md — Calc3D Web (Frontend)

Frontend de Calc3D (Calculadora de Precios para Impresión 3D). Repo pnpm que
contiene `apps/web` (React + Vite + TS) + una **copia** de `packages/shared`.
Idioma de UI/errores y respuestas: **español**.

## shared (copia)

La **fuente de verdad** del paquete `packages/shared` (motor de cálculo puro con
decimal.js + contratos Zod) vive en el repo **calc3d-api**. Aquí hay una **copia**
sincronizable. Antes de tocar el motor o los contratos: **edítalos en calc3d-api**,
y luego trae los cambios con `pnpm sync:shared` (copia shared desde calc3d-api) +
`pnpm test:shared`. **No edites `packages/shared` directamente en este repo**: se
sobrescribe al sincronizar. El front consume el build **ESM** (`dist/esm`) que
Vite importa.

## Estructura
- `apps/web` — React + Vite + TS. Tailwind + primitivas propias (`components/ui.tsx`),
  TanStack Query, React Hook Form + Zod, axios con interceptor JWT. **App de un solo
  dueño**: hay login (sin registro público), pero **sin planes/billing/panel admin,
  sin verificación de email ni gestión de equipo** (todo eso se quitó con la capa SaaS).
  - **Sistema visual de marca** — paleta ESTRICTA de 5 colores (tokens en
    `index.css`, claro/oscuro; `brand.*` en `tailwind.config.js`):
    `#000814` (fondo), `#001D3D` (tarjetas), `#003566` (azul primario/bordes),
    `#FFC300` (oro/acento), `#FFD60A` (oro hover, `brand-yellow-hover`). El texto
    usa blanco/gris por legibilidad; rojo/verde solo para error/éxito. Fuentes:
    Bricolage Grotesque (display), Hanken Grotesk (texto), JetBrains Mono (cifras).
    Concepto visual: **"panel de precisión"** (oro sobre navy profundo, malla de
    gradiente + textura blueprint, superficies *glass*, profundidad por glow).
    Oro legible: token `--brand-yellow-ink` (claro = oro profundo, oscuro = oro
    brillante idéntico); usar `text-brand-yellow-ink` para texto dorado,
    `bg-brand-yellow` solo para rellenos/acentos.
  - **Capa de efectos / motion** — dependencia `motion` (Framer Motion) +
    `components/effects.tsx`: `NumberTicker` (cifras que ruedan, para KPIs en
    vivo y montos), `Reveal` (entrada con stagger), `SpotlightCard`, `BeamBorder`
    (haz de oro, SOLO para el precio elegido / CTA héroe), `GridPattern`,
    `GoldText`. Todo respeta `prefers-reduced-motion` (guard JS `useReducedMotion`
    + media query en `index.css`). Utilidades CSS: `.glass`, `.surface-grid`,
    `.text-gold-sheen`; tokens nuevos en `tailwind.config.js` (animaciones
    `shimmer`/`shine`/`glow-pulse`, sombras `glow-sm`/`glow-lg`/`glow-blue`,
    `bg-grid-pattern`/`bg-gold-sheen`). La paleta sigue ESTRICTA: los efectos solo
    explotan los 5 colores de marca, no agregan colores. Las pantallas de auth
    usan `components/AuthShell.tsx` (split panel de marca + form glass).
  - **Fondo animado** — `components/AnimatedBackground.tsx`: campo de partículas
    canvas-2D (navy + destellos oro, líneas tenues estilo blueprint), **sin
    WebGL** a propósito (no castigar el móvil). Se reduce solo en móvil (menos
    partículas, sin líneas), se apaga con `prefers-reduced-motion` y se pausa con
    la pestaña oculta. Montado en `AppLayout` y `AuthShell` (`fixed inset-0 -z-10`).
  - **UI / navegación** — sidebar con grupos COLAPSABLES (`AppLayout`, estado en
    localStorage `nav-collapsed`).

### Regla de overlays (IMPORTANTE)
- **NO usar `AnimatePresence` para overlays con hijo condicional; renderizar
  condicional directo.** Un hijo directo SIN `key` NO se desmonta al cerrar (el
  overlay se queda abierto). Se resuelve con **render condicional directo**
  (`if (!open) return null`) conservando la animación de entrada. Afectó a
  `CommandPalette` y al **drawer móvil de `AppLayout`** (backdrop y X no cerraban).

### Primitivas y patrones UX (`components/ui.tsx`, `overlays.tsx`)
- **`Select` de marca** — sobre `@radix-ui/react-select` (popup propio temable;
  adiós a la lista nativa del SO que rompía el oscuro). Es **drop-in** del
  `<select>` nativo (acepta `value`/`onChange(e.target.value)` + hijos `<option>`);
  Radix prohíbe `value=""`, se mapea a un centinela interno. En forms RHF usar
  `Controller` (no `register`).
- **`NumberInput`** — campo numérico con buffer de texto (arranca vacío en 0, se
  puede borrar). Úsalo para TODO input numérico; en formularios RHF (catálogos) se
  integra con `Controller`.
- **`Combobox`** (`components/Combobox.tsx`) — select con búsqueda + "Crear «X»",
  SIN deps nuevas (dropdown propio con outside-click). La marca, tipo y color del
  **filamento** lo usan; las opciones viven en una lista administrada aparte
  (backend `catalog-options`). En `config.ts` el campo es `type:'combobox'` +
  `optionsKind`. A11y: navegación por flechas + `aria-activedescendant` + roles.
- **Skeletons** — `Skeleton`/`TableSkeleton`/`PageSkeleton` (ya NO queda texto
  "Cargando…") y `EmptyState` (ícono + descripción + acción/CTA). Úsalos en listas.
- **Dialog** — limita el alto a `100dvh` y scrollea el cuerpo (los modales no se
  salen de pantalla). Modales con `<form onSubmit>` + botón `type="submit"` dan
  **Enter=Guardar**; el primer input lleva `autoFocus`.
- **Buscar / ordenar / recordar filtros / móvil** — `SearchInput` (input con ícono
  + limpiar) y `SortHeader` (cabecera `<th>` ordenable); hooks `lib/useSortable.ts`
  (orden client-side por `keyof T`, texto locale es+numeric) y
  `lib/usePersistentState.ts` (useState espejado a localStorage). El filtro de fechas
  `useDateRange(initial, persistKey?)` + `DateRangePicker` viven en
  `features/finance/DateRange.tsx` (usan `usePersistentState` para recordar el rango).
  Patrón **tabla↔tarjetas**:
  `<div className="hidden md:block">` con la tabla + `<div className="md:hidden
  divide-y">` con tarjetas apiladas. **Detección de duplicados** al crear por nombre.
- **`CommandPalette`** (`components/CommandPalette.tsx`) — **buscador global
  ⌘/Ctrl-K** (montado en `AppLayout` + `CommandPaletteButton` en el header).
  Client-side sobre listas ya cacheadas (fetch PEREZOSO: queries `['clients']/
  ['orders']/['quotes']/['products']/['campaigns']` sólo corren al abrir por 1.ª
  vez, reusando caché de TanStack); filtra sin acentos (`normalize('NFD')`), navega
  al resultado. Teclado: flechas + Enter + Esc; roles `combobox`/`listbox`/`option`.
- **`OnboardingChecklist`** — checklist de primeros pasos en el Dashboard, DERIVADO
  de datos reales (material/impresora/presupuesto/venta-o-pedido), descartable
  (localStorage `onboarding-hidden`), desaparece solo al completar los 4.
- **Descarga autenticada** reutilizable: `downloadFile()` en `lib/api.ts` (token en
  header, blob — nunca en URL).
- **Tema claro/oscuro**: `theme/ThemeProvider.tsx` (estado + clase en `<html>`) +
  `components/ThemeToggle.tsx` (botón). Los tokens de marca traen valores claro/oscuro.
- **Toasts**: `components/toast.tsx` monta un `Toaster` sobre **`sonner`**; úsalo para
  notificaciones de éxito/error (no `alert()` nativo).
- **Contraste (auditoría AA)**: única falla histórica = `--success` claro sobre
  blanco (4.09:1) → se oscureció a `152 55% 32%` (5.01:1). El resto pasa AA.

### La calculadora (wizard de 5 pasos, `features/calculator/`)
- `CalculatorProvider` (estado + cálculo en vivo `POST /calc`), `Wizard` +
  `Stepper`, `steps/Step*.tsx` y `ResultPanel` (KPIs). Barra-resumen en vivo.
- **Los 3 datos OBLIGATORIOS del trabajo** (vienen del slicer, NO se guardan en
  catálogos, se llenan cada vez): **cantidad de piezas** (paso 1), **gramos
  totales del lote** (paso 2, por material) y **horas de impresión** (paso 3).
  Van marcados con `RequiredTag` + `REQUIRED_INPUT` (resalte amarillo) y el
  `Wizard` **bloquea Siguiente/Guardar** hasta que tengan valor (> 0; horas solo
  si la impresora está incluida). Lo demás sale de los catálogos guardados.
- **Ganancia/mayoreo en lenguaje claro**: la UI usa **porcentajes** (30/50/100)
  y el provider los guarda como **fracción** (`profitRates`); el cálculo siempre
  es **MARKUP** ("ganancia sobre el costo"), sin exponer markup/margen.
  `selectedRate` = ganancia elegida para vender (define las KPIs de utilidad).
  Tramos de mayoreo etiquetados Detal / Mayorista básico / medio / alto.
- **Motor pro (Fase 2A)**: `ResultPanel` deriva la UTILIDAD real (con extras) como
  `finalUnit − costoUnitario`; usa helpers de `shared/calc/select.ts`
  (`pickSuggestedPrice`, `priceFinalPerUnit`, `priceJobTotal`, `priceHasSurcharges`)
  para coincidir con PDF y ventas. La **merma por riesgo** (Bajo/Medio/Alto
  8/15/30 %) es solo selector de UI sobre `waste.pct`. Los snapshots previos a 2A:
  leerlos SIEMPRE con `?.`/`??`.
- El `Wizard` se alimenta de los catálogos guardados vía
  `features/calculator/useCatalogData.ts`. Desde la calculadora se guarda un
  **presupuesto** (`SaveQuoteModal`) o un **producto** (`SaveProductModal`, botón
  "Guardar producto", precio prellenado del elegido). `ProductDetail` reusa
  `ResultPanel` para el recosteo en vivo.

### Dashboard + finanzas (`pages/Dashboard.tsx`, `Sales.tsx`, `Expenses.tsx`; `features/finance/`)
- KPIs (ventas, gastos, **utilidad**, ticket), recuperación de inversión y 4
  gráficos **Recharts** tematizados a la marca. Filtro de fechas reutilizable
  `useDateRange`/`DateRangePicker` con presets (Hoy, Ayer, Semana, Mes, Año, Rango,
  Día, Todo). El Dashboard se **lazy-loadea** en `App.tsx` (Recharts en chunk
  aparte, ~380 KB). Los montos se agregan en el cliente desde las listas filtradas.
- **Punto de equilibrio (Fase 2B)**: tarjeta "Punto de equilibrio" (ingreso de
  equilibrio MENSUAL vs ventas del periodo; se compara mejor con el rango "Mes").
  Helpers puros en `shared/calc/breakeven.ts`. Los costos fijos y el margen se
  editan en **Configuración → Costos fijos** (`Settings.fixedCosts` /
  `breakEvenMarginPct`); NO entran en el precio por pieza.
- **Alertas proactivas**: `ProfitabilityAlert` (productos por debajo del margen
  mínimo → `/products`) y `CampaignAlert` (campañas `LOSS`/`AT_RISK` con inversión
  > 0 → `/campaigns`).

### Multi-moneda / Bs (front)
- `useMoney()` (en `features/settings/useSettings.ts`) expone `moneyAlt` (tasa default
  vigente), `moneyAtRate`/`moneyInRate` y `rates`; `frozenFromSnapshot()`
  (`features/settings/useExchangeRates.ts`) extrae la tasa congelada de un documento;
  `CurrencyPicker` (features/settings) en los modales de crear presupuesto/pedido/
  producto; Config → Moneda administra las tasas con nombre; `RateBadge` muestra la
  default; `OrderDetail`/`QuoteDetail` usan la tasa CONGELADA del documento (no la ambiental).
- **Cobro protegido** (`features/calculator/ChargeEquivalentsCard.tsx` en
  `ResultPanel`): **en vivo** (consulta tasas con `useExchangeRates({enabled:true})`
  — NO depende de `defaultRateLabel`) y **solo en cálculo vivo** (gate
  `frozenRate === undefined`, así NO aparece en documentos congelados como
  QuoteDetail; sí en la calculadora y el recosteo de ProductDetail).
- **Bs en vivo vs congelado**: hook `useDocRate(snapshot, {frozen})`
  (`useExchangeRates.ts`) resuelve la tasa VIGENTE por label; si `frozen` o la
  moneda ya no existe, cae a la congelada del snapshot; null si el doc es solo USD.
  Presupuestos siempre en vivo; pedidos con banner "Bs en vivo" vs "Bs cerrados el
  <fecha>"; cada abono muestra su equivalente Bs con su tasa histórica. El botón
  "Emitir nota de entrega" dispara `POST /orders/:id/settle`.

### CRM + mapa (Fase 5)
- **Contactos/CRM** (`pages/Contacts.tsx`+`ContactDetail.tsx`, `features/contacts/api.ts`):
  colores por tipo en `CONTACT_TYPE` (oro/azul/verde/rojo, SOLO para diferenciar
  pines — la paleta de marca sigue estricta en el resto). El nav movió "Clientes"
  al grupo **Directorio** como "Contactos".
- **Mapa interactivo** (`components/LeafletMap.tsx`, `pages/ContactsMap.tsx`):
  **Leaflet + OSM** (deps `leaflet`+`react-leaflet`). **Sin geocodificación**: la
  ubicación se fija haciendo **click en el mapa** (`LocationPicker`, marcador
  arrastrable) → guarda lat/lng. `PointsMap` pinta todos los contactos ubicados con
  capas activables por tipo. Íconos vía `L.divIcon` SVG de color (evita el bug de
  íconos rotos con bundlers). Las 3 páginas del CRM se **lazy-loadean** (Leaflet
  ~157 KB en chunk aparte). A11y: `role=application`+`aria-label` en contenedores,
  `title`/`alt` en pines.
- **Respaldo / plantillas**: Configuración → Datos (descarga autenticada vía axios
  `responseType:'blob'`; botones de respaldo y de sembrar plantillas).

### Catálogos + registro de gastos (front)
- **Catálogos** (`pages/Catalog.tsx`): página CRUD **genérica dirigida por
  `features/catalogs/config.ts`** (define los campos por catálogo: materiales,
  impresoras, componentes/insumos, proveedores). Los combobox de marca/tipo/color del
  filamento se renderizan aquí vía `Controller`. Alta con **detección de duplicados**
  por nombre.
- **Registro dinámico de gastos** (`pages/Expenses.tsx`): un modal elige el **tipo**
  (Filamento/Impresora/Componente/Empaque/Mantenimiento/General/Publicidad) y, si mapea
  a catálogo, deja **reusar** un item existente o **crearlo inline** (reusa
  `features/catalogs/config.ts`) → crea catálogo + gasto enlazado en una acción. Check
  "usar como precio de referencia" → `PATCH` PARCIAL al item. El tipo **Publicidad** con
  "pagué en bolívares" elige una tasa VES + monto Bs y guarda `amount` en USD base
  (= Bs ÷ tasa) + `rate`/`currencyCode='VES'` para presentación.

### Presupuestos / cotizaciones (`pages/Quotes.tsx`)
- Lista con **ciclo de cotización**: conversión (aceptados/decididos), "por seguir"
  (SENT), "vencido" (DRAFT/SENT > 7 días → recotizar). `QuoteDetail` usa la tasa
  CONGELADA del documento. El origen del presupuesto es la calculadora
  (`SaveQuoteModal`); el backend versiona (`GET /quotes/:id/versions`,
  `POST /quotes/:id/duplicate`).

### Publicidad / ROI (Fase 1, front)
- **Campañas** (`pages/Campaigns.tsx` + `CampaignDetail.tsx`, `features/campaigns/`):
  el backend deriva el gasto real de los `Expense` enlazados. La lista tiene **filtros
  persistentes** (plataforma/estado/búsqueda), **orden por columna** (`useSortable`),
  **semáforo por fila** (`campaignHealth` → Badge) y **gráficos**
  `features/campaigns/CampaignCharts.tsx` (Recharts, lazy-load: inversión vs vendido por
  campaña y por plataforma). `CampaignDetail` muestra **banner de recomendación**
  (`campaignRecommendation` + `REC_META`), ticket promedio y vista por período.
- **Atribución**: `features/campaigns/AttributionPicker.tsx` en los modales de crear
  venta/pedido (canal + campaña; se arrastra al convertir cotización→venta).
- **Export**: "Exportar CSV" en `Campaigns.tsx` y "PDF" en `CampaignDetail`
  (`GET /campaigns/export.csv`, `/campaigns/:id/report.pdf`), descarga autenticada vía
  `downloadFile()`. **Alerta proactiva** `CampaignAlert` en el Dashboard (campañas
  `LOSS`/`AT_RISK` con inversión > 0 → `/campaigns`).

### Auth / seguridad (front)
- `lib/api.ts`: interceptor que ante 401 llama `/auth/refresh` UNA vez (single-flight
  con `refreshPromise`) y reintenta; `setTokens` guarda access+refresh en localStorage;
  `AuthContext` hace logout server-side. **No hay registro público** (`AuthContext` solo
  expone `login`).
- Páginas de auth: `Login` / `ForgotPassword` / `ResetPassword`, sobre
  `components/AuthShell.tsx` (split panel de marca + form glass).

## Comandos (desde la raíz de este repo)
- `pnpm install`
- `pnpm sync:shared` — trae `packages/shared/src` desde calc3d-api (fuente de verdad).
  **Solo copia `src`**: recompilá `shared` después (el `postinstall`/build regenera
  `dist/esm`, que es lo que importa Vite) y verificá con `pnpm test:shared`.
- `pnpm test:shared` — tests del motor (tras sincronizar).
- `pnpm dev` — levanta el front Vite (antes `pnpm dev:web` en el monorepo).
- `pnpm -r build` / `pnpm -r lint`

## Entorno
- Windows / PowerShell: usar su sintaxis (`$env:VAR` no `$VAR`, `$null` no
  `/dev/null`, backtick para continuar línea). Rutas con backslash de Windows.
- pnpm vía `npm install -g pnpm`.
- `.env` reales NO se versionan ni se editan; usar los `.env.example`.

## Seguridad y secretos
- NUNCA modificar archivos `.env` (ni `.env.*`) salvo que se pida explícitamente
  en ese mismo mensaje. Leerlos para entender qué variables existen está bien.
- Nunca exponer valores reales de secretos/credenciales en código, logs ni docs.

## Git
- No hacer commit ni push salvo que se pida.
- No usar flags interactivos (`-i`) ni `--no-verify`.
- Cuando sí se pida commit, usar mensajes limpios y consistentes.
