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

### La calculadora (UNA pantalla, `features/calculator/`)

> Reescrita el **2026-09-06** (shared **0.7.0**) siguiendo la hoja "Costeo" del
> Excel de Banano Lab. Antes era un wizard de 5 pasos; ya no existe.
> Spec: `calc3d-api/docs/superpowers/specs/2026-09-06-calculadora-una-pantalla-design.md`.

- **Archivos**: `CalculatorProvider` (estado + cálculo en vivo `POST /calc`),
  `CalculatorScreen` (layout), `sections.tsx` (las 7 secciones de entrada, en el
  orden del Excel), `ResultPanel` (el precio y su semáforo), `analysis.tsx`
  (comparador de redondeos, mayoreo, producción), `parts.tsx` (bloques
  reutilizables). **`Wizard.tsx` y `steps/` fueron eliminados.**
- **Layout**: formulario a la izquierda, panel de precio **pegajoso** a la
  derecha; en móvil se apila con el precio ARRIBA. Debajo, a lo ancho: redondeos,
  mayoreo y producción.
- **Datos OBLIGATORIOS del trabajo** (los da el laminador, no los catálogos):
  unidades, **gramos de la tanda**, precio del rollo y horas de impresión. Van con
  `RequiredTag` + `REQUIRED_INPUT`, y `missing` (del provider) bloquea guardar.
- **Un solo margen objetivo** y **un solo precio final**, editable a mano. El
  semáforo (`price.status` → `PRICE_STATUS_LABEL`, ambos de shared) marca
  PIERDES DINERO / Margen bajo / Por debajo de tu objetivo / OK. **No
  re-implementar esos umbrales en la UI**: vienen del motor.
- **Mayoreo por DESCUENTO** (`discountPct`), no por margen. Cada tramo muestra el
  margen real que deja.
- **El panel juzga el precio COBRADO, no el de lista**: el semáforo usa
  `order.status`/`order.marginReal`, y cuando `order.fromTier` es true muestra el
  precio de lista tachado → el del tramo. Es el mismo número que sale en la
  cotización del cliente; esa coherencia es el punto.
- **Bajo el piso de margen (`LOW`) va en ROJO**, no en ámbar, con un aviso al
  lado. No bloquea la venta: bajar el precio sin darse cuenta es el error que más
  caro sale, y un aviso tibio es justo lo que un panel bonito esconde. El piso se
  edita en Configuración (`minMarginPct`).
- **La UI usa porcentajes y el provider guarda fracciones** (margen, merma,
  descuentos): la conversión `/100` vive en `sections.tsx` y `analysis.tsx`.
- ⚠️ **Un documento guardado antes de 0.7.0 no tiene `result.price`.**
  `ResultPanel` lo detecta y muestra un aviso; sin ese guard, `QuoteDetail` se
  cae con pantalla en blanco. No se recalcula el snapshot: es el precio que se le
  cotizó al cliente ese día.
- ⚠️ **Los breakpoints de Tailwind miran el VIEWPORT, no el contenedor.** El panel
  mide 22rem: un `sm:grid-cols-2` adentro se activa igual y trunca las etiquetas.
  Dentro del panel, una sola columna.
- El formulario se alimenta de los catálogos guardados vía
  `features/calculator/useCatalogData.ts`. Al elegir un insumo del catálogo, el
  costo unitario es `packagePrice / unitsPerPackage` (el catálogo guarda el
  PAQUETE). Desde la calculadora se guarda un **presupuesto** (`SaveQuoteModal`)
  o un **producto** (`SaveProductModal`, precio prellenado con `price.final`).
  `ProductDetail` reusa `ResultPanel` para el recosteo en vivo.

### Control de filamento (`pages/Filament.tsx`, `features/filament/`)

> Los dos controles que el dueño llevaba en su Excel: la hoja "Inventario"
> (compras) y "Stock mensual" (conteo físico). Spec:
> `calc3d-api/docs/superpowers/specs/2026-09-07-control-de-filamento-design.md`.

- Página propia en **Definiciones → Filamento** (`/filament`), con pestañas. Vive
  aparte de Catálogos (que es el alta de fichas) y de Gastos (que es dinero que
  sale): acá se responde "cuánto me cuesta el filamento y cuánto me queda".
- **Compras** (`PurchasesTab`): los `Expense` con `materialId`, con **costo por
  rollo y por gramo derivados por el SERVIDOR** (`GET /filament/purchases`). El
  costo por gramo se muestra con **4 decimales**: son centavos, y con 2 todo se
  vería como "$0.02". Filtro por fechas (`useDateRange`, preset `ALL`), búsqueda
  sin acentos y KPIs que se recalculan sobre lo FILTRADO.
- El alta de una compra sigue estando en **Gastos** (tipo "Filamento"): esta
  pantalla es de lectura y análisis. Al registrarla, el backend actualiza solo el
  `rollPrice` del material — "la última compra manda".
- **Stock del mes** (`StockTab`): conteo MANUAL al cierre de mes. Filas agrupadas
  por **tipo + color** (como la hoja), con una fila por MARCA dentro de cada grupo.
  Tres casillas (Sin abrir / En uso / Por acabarse) y el total derivado.
- **El guardado es al SALIR del campo (`onBlur`)**, con un borrador local: con 39
  materiales × 3 casillas, guardar en cada tecla sería un bombardeo de requests.
- ⚠️ **"No contado" ≠ "cero rollos".** `counted` distingue los dos casos: el total
  solo se pinta en rojo si SE contó y dio cero. Sin conteo va en gris, el consumo
  dice "Sin dato" y la reposición no incluye ese material. Es la misma distinción
  en las tres partes de la pantalla; romperla en una sola la vuelve mentirosa.
- La **lista de reposición** usa los colores de la hoja: rojo = sin rollos, ámbar =
  por acabarse. Los descontinuados nunca entran.
- Los **rollos por identificar** (`needsBrandCheck`, los que vinieron del Excel sin
  marca) se listan aparte; contarlos a mano apaga el aviso.
- **Análisis** (`AnalysisTab`): la parte de la hoja "Resumen" que mira las
  compras — rollos e inversión **por marca** (con costo promedio por rollo y
  participación), **colores más comprados** y reparto por material. Usa el helper
  puro `groupPurchases` de shared sobre las MISMAS compras que la pestaña de al
  lado; no hay endpoint propio, para que los totales no puedan discrepar.
- ⚠️ `capitalize` de Tailwind pone mayúscula en CADA palabra ("Septiembre De
  2026"): para un mes en español va `first-letter:uppercase`.
- Las pestañas solo se dibujan si hay más de una (`TABS.length > 1`).

### Dashboard + finanzas (`pages/Dashboard.tsx`, `Sales.tsx`, `Expenses.tsx`; `features/finance/`)
- KPIs (ventas, gastos, **utilidad**, ticket), recuperación de inversión y 4
  gráficos **Recharts** tematizados a la marca. Filtro de fechas reutilizable
  `useDateRange`/`DateRangePicker` con presets (Hoy, Ayer, Semana, Mes, Año, Rango,
  Día, Todo). El Dashboard se **lazy-loadea** en `App.tsx` (Recharts en chunk
  aparte, ~380 KB). Los montos se agregan en el cliente desde las listas filtradas.
- **Punto de equilibrio en TRES niveles** (2026-09-07): la tarjeta muestra "no
  perder" / "además pagar la cuota" / "además reservar para equipos", con el
  avance del periodo contra cada uno (`breakEvenLevels` de shared). Son
  MENSUALES: se comparan con el rango "Mes". Un nivel **se oculta** si no
  aplica (sin préstamos no hay nivel 2). Los costos fijos, el margen de
  contribución y la reserva se editan en **Configuración → Costos fijos**; la
  **cuota NO se edita ahí**: sale sola de los préstamos abiertos.
- **Metas** (`pages/Goals.tsx`, `features/goals/api.ts`, en Finanzas): metas
  mensuales de ventas, encargos y clientes nuevos. **Solo se cargan las metas**;
  el cumplimiento lo deriva el servidor. El Dashboard muestra la del **mes en
  curso** (no la del rango del filtro: una meta mensual solo significa algo
  contra su mes). La barra se recorta al 100 % pero el número no: pasarse de la
  meta es información.
- **Deuda** (`pages/Loans.tsx`, `features/loans/api.ts`, en Finanzas): préstamos
  con sus pagos, saldo y avance **derivados por el servidor**. Un pago de
  préstamo NO es un gasto y por eso esta pantalla vive fuera del ledger: el
  equipo ya está ahí como inversión.
- **Producción** (`pages/Production.tsx`, `features/equipment/usage.ts`): horas
  de máquina por equipo con su % de vida útil, tasa real de fallos y
  mantenimiento gastado vs cobrado. Se **escribe** desde el detalle del pedido
  (`features/orders/ProductionCard.tsx`).
  ⚠️ Esa tarjeta usa un input propio y NO `NumberInput`: el valor de
  `NumberInput` es `number` y el vacío colapsa a 0, pero acá **vacío significa
  "sin medir" y 0 significa "sin fallas"**. Confundirlos llenaría la tasa real
  de ceros que nadie midió.
- **Reposición de equipos** (`features/equipment/api.ts`): tarjeta por máquina
  (repuesto / falta / %), con el reparto en cascada por orden de compra. Lo
  calcula el SERVIDOR sobre toda la historia: **no depende del filtro de
  fechas**. Reemplazó a la tarjeta "Recuperación de la inversión", que sí
  dependía del rango y por eso mostraba un negocio distinto según lo elegido.
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

### Documentos del negocio (nota de entrega y cotización)
- Ambos PDF los arma el backend con **un solo formato** (ver `documents/` en
  `calc3d-api`); el front solo descarga el blob y le pone nombre de archivo.
- `QuoteDetail` tiene **dos** descargas de PDF y no hay que confundirlas:
  **"Cotización"** (`/quotes/:id/cotizacion.pdf`) es el documento que SE LE MANDA AL
  CLIENTE, y **"Desglose interno"** (`/quotes/:id/pdf`) trae costos, márgenes y
  mayoreo — es de uso propio. Los nombres de archivo llevan el N.º del documento
  (`cotizacion-007-2026.pdf` / `desglose-interno-007-2026.pdf`), no el id opaco.
- **Logo del negocio** (`features/settings/BusinessLogo.tsx`, en Configuración →
  Negocio): PNG/JPEG hasta 1 MB, se sube como data URL a `PUT /settings/logo`. La
  vista previa se pide como **blob** (`GET /settings/logo` exige sesión, así que un
  `<img src>` directo a la API no sirve) y su object URL se revoca al desmontar.
  `GET /settings` solo trae `hasLogo`, nunca los bytes.
- **Nombre del negocio**: campo `businessName` del mismo formulario; el backend lo
  escribe en la organización. Encabeza y firma ambos documentos.

### Tienda (catálogo público, panel)
- **`pages/Store.tsx` + `pages/StoreProductDetail.tsx`, `features/store/api.ts`.**
  Es un catálogo APARTE del de Productos: allá vive el costeo, acá lo que ve el
  cliente (fotos, descripción, opciones, visibilidad, enlace).
- **Dos formas de cargar**: a mano ("Nuevo producto") o con **"Publicar en la
  tienda"** desde `ProductDetail` y `QuoteDetail` — eso llama a
  `POST /store/products/from-source`, que arma el borrador con el precio y el costo
  leídos por el BACKEND del snapshot. Nace siempre como **borrador**.
- **Sin stock**: se produce bajo pedido, así que el campo es "días de producción".
  Las opciones (color/tamaño) van sin combinatoria, con recargo por opción.
- **Fotos**: subida en dos pasos (`uploadStoreImage` en `features/store/api.ts`) —
  se pide una URL firmada y el archivo va DIRECTO al bucket con `fetch` a pelo (esa
  URL no lleva ni debe llevar la sesión), y recién después se confirma contra la
  API. Si el servidor no tiene credenciales, `GET /store/status` devuelve
  `storageReady: false` y la UI lo avisa en vez de fallar al subir.
- **Categorías** (`features/store/StoreCategoriesModal.tsx`): crear, renombrar y
  borrar, con dos entradas al MISMO gestor — botón "Categorías" en la vitrina y
  "Gestionar" al lado del selector de la ficha (para no salir del producto que
  estás editando). Borrar NO borra productos: el aviso dice cuántos quedan sin
  categoría. El enlace público se deriva del nombre en el backend.
- **Reordenar** (`features/store/ReorderControls.tsx`): botones de mover, NO arrastrar
  y soltar — el arrastre nativo de HTML5 no anda en pantallas táctiles y una
  librería de DnD sería dependencia nueva para algo secundario. Sirve para la
  vitrina y para las fotos (la primera es la PORTADA, con su insignia y su botón
  "Usar como portada"). Los controles están **siempre visibles en móvil** y
  aparecen al pasar el mouse en escritorio: si dependieran del hover serían
  invisibles justo en el dispositivo por el que se descartó el arrastre. Con
  búsqueda o filtro activos se ocultan y se explica por qué: "mover antes" sobre
  una lista filtrada movría respecto a lo que se ve, no a la vitrina real.
  El backend fija la posición por el ÍNDICE, así que se manda la lista completa.
- **Margen bajo costo**: si la ficha está enlazada a un costeo y el precio queda
  por debajo, la tarjeta y la ficha lo marcan en rojo con cuánto se pierde por
  unidad. Sin enlace de costeo simplemente no hay margen que mostrar.

### Bandeja de la tienda (`pages/StoreRequests.tsx`, `features/store/requests-api.ts`)
- Los pedidos y consultas que llegan de la tienda pública **NO entran a Pedidos**:
  caen en `/store/requests`. Cualquiera con la dirección de la tienda puede
  escribir ahí, así que nada toca la operación ni el CRM hasta que el dueño
  confirma. **Confirmar** crea el contacto (o lo enlaza por teléfono) y el pedido,
  y navega a él; **descartar** solo deja constancia de que se vio.
- Los precios de las líneas los calculó el **servidor** y no son editables desde
  la bandeja: si algo está mal, se corrige en el pedido ya creado.
- El menú lleva un **contador de pendientes** (`useStoreRequestsPending`, refetch
  cada 60 s). La bandeja se llena SOLA —la escribe un visitante, no el dueño—;
  sin un aviso a la vista un pedido puede quedarse días sin que nadie lo mire.
- Confirmar invalida también `['orders']` y `['contacts']`: acaba de crear
  registros en las dos listas.

### CRM + mapa (Fase 5)
- **Contactos/CRM** (`pages/Contacts.tsx`+`ContactDetail.tsx`, `features/contacts/api.ts`):
  colores por tipo en `CONTACT_TYPE` (oro/azul/verde/rojo, SOLO para diferenciar
  pines — la paleta de marca sigue estricta en el resto). El nav movió "Clientes"
  al grupo **Directorio** como "Contactos".
- **Editar desde la lista**: cada fila de Contactos tiene su lápiz, que abre el
  mismo `ContactModal` que el detalle. Antes solo se podía editar entrando al
  contacto, y desde la lista únicamente crear uno nuevo.
- ⚠️ **Los pedidos NO se borran desde la lista** (decisión del dueño,
  2026-09-07): un tacho al lado de cada fila se toca sin querer. El endpoint
  `DELETE /orders/:id` sigue existiendo y la acción vive solo en el DETALLE del
  pedido, con confirmación.
- **Mapa interactivo** (`components/LeafletMap.tsx`, `pages/ContactsMap.tsx`):
  **Leaflet + OSM** (deps `leaflet`+`react-leaflet`). **Sin geocodificación**: la
  ubicación se fija haciendo **click en el mapa** (`LocationPicker`, marcador
  arrastrable) → guarda lat/lng. `PointsMap` pinta todos los contactos ubicados con
  capas activables por tipo. Íconos vía `L.divIcon` SVG de color (evita el bug de
  íconos rotos con bundlers). Las 3 páginas del CRM se **lazy-loadean** (Leaflet
  ~157 KB en chunk aparte). A11y: `role=application`+`aria-label` en contenedores,
  `title`/`alt` en pines.
- **Reporte en Excel**: Configuración → Datos → "Descargar reporte en Excel"
  (`GET /reports/excel.xlsx`, descarga autenticada). Es el libro que reemplazó
  al `bananolab.xlsx` que el dueño llevaba a mano: los datos se cargan en la
  app y el Excel es su salida.
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
- **Lo que reportó la plataforma** (`CampaignDetail`): alcance, conversaciones y
  visitas al perfil, con el **costo por conversación** derivado. Se cargan en el
  formulario de la campaña. Es lo único que mide una campaña que todavía no
  generó venta atribuida: ahí el ROAS es 0× y no dice nada.
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
