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

> ⚠️ **Si cambia la FORMA de una respuesta de la API, se despliega primero la
> API y después el panel.** Se despliegan por separado: un panel nuevo leyendo
> la respuesta vieja se cae al dibujar. Pasó en desarrollo el 2026-09-13 con la
> reposición por color (shared 0.11.0): la pantalla se actualizó en caliente,
> React Query conservaba el resumen viejo sin `brands` y `RestockCard` rompió en
> `g.brands.length`. En local se arregla recargando; en producción no.

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
    `GoldText`. ⚠️ `BeamBorder` ya no se usa (2026-09-13): en el precio de la
    calculadora el haz asomaba corrido en las esquinas y se reemplazó por un
    borde dorado fijo. Todo respeta `prefers-reduced-motion` (guard JS `useReducedMotion`
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
  - **UI / navegación** — sidebar con grupos en ACORDEÓN (`AppLayout`, desde el
    2026-09-14, decisión del dueño): abrir un grupo cierra el que estaba abierto y
    tocar el abierto lo cierra. El grupo de la página actual se abre solo (también
    al llegar por el buscador o un enlace), y el último abierto se recuerda en
    localStorage `nav-open-group` (la clave vieja `nav-collapsed` ya no se usa).
    **Reorganizado el 2026-10-02**: Finanzas tenía 11 de los 23 ítems, con tres
    que no son dinero. Quedó con Dashboard · Mostrador · Gastos · Encargos ·
    Por cobrar · Caja · Deuda · Metas, y nacieron **OPERACIONES** (Producción),
    **MARKETING** (Publicidad) y **TIENDA** (Tienda · Bandeja, que es trabajo
    entrante y no un catálogo). **Definiciones → CATÁLOGOS**, que es lo que
    tiene adentro y coincide con las rutas `/catalogs/*`.
    ⚠️ **El badge de la Bandeja BURBUJEA al encabezado cuando el grupo está
    cerrado** (`GroupPendingBadge`). Con el acordeón de uno a la vez, "Tienda"
    va a estar cerrado casi siempre y el contador quedaría invisible — y un
    contador que no se ve no avisa de nada, que es justo lo que esa bandeja
    necesita porque se llena sola.
  - **Barras de filtros: SIEMPRE `FilterBar`** (`components/ui.tsx`, desde el
    2026-09-14, decisión del dueño). Toda lista con filtros —las que existen y las
    que se hagan— los pone dentro de `<FilterBar>`, NUNCA en un `flex-wrap` suelto
    con anchos fijos: en el teléfono quedaba un control por fila, cada uno de un
    ancho distinto. En el teléfono es una grilla `auto-fit` de ~9rem por columna
    (dos por fila); desde `sm`, en línea. Reglas: cada control con
    `w-full sm:w-XX`; el buscador, un control que quede solo en su fila y el
    `DateRangePicker` (envuelto en `<div className="col-span-full sm:col-span-1">`)
    van con `col-span-full`. `DateRangePicker` ya ocupa el ancho disponible hasta
    `sm`. Si la fila también lleva `Stat` de totales, van en
    `grid w-full grid-cols-2 gap-3 sm:flex sm:w-auto`. Usan `FilterBar`:
    Catálogos, Ventas, Gastos, Compras de filamento, Publicidad y Stock del mes.
  - **KPIs que no se cortan** (2026-09-14) — la cifra de `Stat` escala con el ancho
    de SU tarjeta (`container-type: inline-size` + `font-size: clamp(1.125rem,
    13cqi, 1.875rem)`), no con la ventana: con `text-2xl` fijo, "$103.56" se cortaba
    en una tarjeta de media pantalla de teléfono. No volver a ponerle un tamaño fijo.
  - **Gráficos con nombres largos: barras HORIZONTALES** (`CampaignCharts`,
    2026-09-14) — el nombre va a la izquierda en un renglón (tick propio: el de
    Recharts parte el texto al ancho del eje), cortado a 16 letras con el nombre
    entero en el tooltip, y el alto crece con las filas. En vertical los nombres
    se inclinaban y se encimaban en el teléfono. Un texto de opción de filtro
    tiene que entrar en media fila de teléfono: "Plataforma: todas", no "Todas las
    plataformas".

### Fechas: guardar en UTC, preguntar "qué día es hoy" en LOCAL

Las dos cosas conviven en el proyecto y confundirlas ya rompió dos pantallas.

- **Guardar y formatear** una fecha ya guardada (entrega, conteo del mes) va en
  **UTC**: se almacenan a medianoche UTC, y formatearlas en la zona local
  imprimía el día ANTERIOR (`documents/document-format.ts` en la API).
- **Preguntar qué día es hoy** va en la zona **LOCAL**, con
  `todayKey()` / `currentMonthKey()` de `lib/today.ts`.

⚠️ **`new Date().toISOString().slice(0, 10)` NO es "hoy"**: es hoy en UTC. En
Venezuela (UTC−4) eso significa que **desde las 20:00 la app cree que ya es
mañana**. Se detectó el 2026-09-07 en el calendario, que marcaba el 8 siendo las
20:45 del 7, y estaba en SIETE lugares: el calendario, la fecha por defecto de
un abono y de un pago de préstamo (quedaban fechados al día siguiente), el mes
en curso del Dashboard y de Metas (el último día del mes saltaban al siguiente),
la fecha de una campaña nueva y el nombre del archivo del reporte.

⚠️ **El backend ya NO acepta un día que no existe en NINGÚN campo de fecha**
(shared 0.41.0 las ocho puertas de dinero, 0.42.0 las tres que faltaban:
`startDate`/`endDate` de campaña, `startDate`/`nextDueDate`/`closedAt` de
préstamo y `deliveryDate` de un encargo). `'2026-02-30'` devuelve **400** con
"Ese día no existe en el calendario" en vez de guardarse corrido al 2 de marzo.
**El panel no hubo que tocarlo**: ya mandaba `AAAA-MM-DD` o `null` en todos
(`<Input type="date">`, `todayKey()` o `.slice(0, 10)`). Lo que esto implica
para una pantalla nueva: un campo de fecha va con `<Input type="date">` y se
manda `valor || null` si es opcional — **nunca** un `''` ni un ISO con hora,
porque los dos los rechaza el servidor. `null`/ausente sí, en los opcionales.
⚠️ Y cuidado con una excepción: `startDate` de campaña y `date` de las puertas
de dinero son **obligatorios**, así que vaciar ese input manda `''` y la
petición falla con 400 — el formulario tiene que exigirlo antes de enviar.

### Regla de overlays (IMPORTANTE)
- **NO usar `AnimatePresence` para overlays con hijo condicional; renderizar
  condicional directo.** Un hijo directo SIN `key` NO se desmonta al cerrar (el
  overlay se queda abierto). Se resuelve con **render condicional directo**
  (`if (!open) return null`) conservando la animación de entrada. Afectó a
  `CommandPalette` y al **drawer móvil de `AppLayout`** (backdrop y X no cerraban).

### Regla de `sticky` y `overflow` en el layout (IMPORTANTE)

El header del panel (`AppLayout.tsx`) está declarado `sticky top-0` desde el
split del repo y **no se pegó nunca, en ninguna pantalla**: se iba con la página
al scrollear. Arreglado el 2026-10-05.

- **`overflow` distinto de `visible` en UN eje hace que el otro compute `auto`**,
  y eso convierte al elemento en **contenedor de scroll**. Un `sticky`
  descendiente se ancla a ESE contenedor, no al viewport. Como `<main>` es
  `min-h-screen` y crece con el contenido, **nunca scrollea él mismo** (el que
  scrollea es el documento), así que el header se iba con la página.
- **La solución es `overflow-x-clip`, no `overflow-x-hidden`.** `clip` recorta
  igual pero **no crea scrollport**, así que el `sticky` vuelve a anclarse al
  viewport.
- ⚠️ **`clip` obliga a poner `min-w-0` a mano.** Era `hidden` quien le suprimía
  al flex item su `min-width: auto`; `clip` no lo hace. Sin `min-w-0`, `<main>`
  crece hasta el ancho intrínseco de su contenido (medido: **512 px en /cash y
  481 en /loans** con viewport de 375) y el desborde que antes se recortaba pasa
  a ser **scroll horizontal de toda la página**. Es el error fácil de cometer al
  "arreglar" esto.
- ⚠️ **Ese `overflow-x` SÍ está tapando desborde real**: `/loans` tiene una tabla
  con `min-w-[26rem]` (416 px) y `/settings` botones que llegan a 528 px, con
  viewport de 375. No lo saques "porque no hace falta".
- **Piso de navegador**: `overflow: clip` es Chrome/Edge 90+, Firefox 81+,
  **Safari 16+** (2022). En Safari viejo la declaración se descarta y esas dos
  pantallas scrollean de lado; se degrada, no se rompe. No hay `browserslist`
  declarado en el repo.
- ⚠️ **Para medir scroll hay que forzar `behavior: 'instant'`.** `index.css` pone
  `html { scroll-behavior: smooth }`, y un `window.scrollTo(0, N)` seguido de una
  lectura inmediata devuelve **`scrollY: 0`** — parece que la página no scrollea
  y no es cierto. Perdí dos mediciones así.
- **El panel del escritorio de Claude no scrollea nunca** (renderiza a altura
  completa) y sus capturas salen en negro a tamaño móvil: esto se verifica con
  un Chrome real (Playwright), no con el pane.
- Verificado tras el arreglo en **17 rutas a 375×812 y 9 a 1440×900**: cero
  desborde horizontal, header pegado en las 14 que scrollean, y la sidebar
  (`sticky h-screen`, que sí funcionaba) sin cambios.

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
- **`ProgressBar`** — la barra de avance del proyecto (`value` 0..1, `tone`
  gold/success/danger). ⚠️ Su riel lleva **borde**, no solo fondo: con
  `bg-muted` queda del mismo color que la tarjeta en oscuro (los dos son navy)
  y una barra en **0 % no se ve nada**, con lo que la fila parece rota en vez de
  "todavía en cero". Pasaba en las impresoras sin reponer y en los meses futuros
  de Metas. Usarla siempre en vez de escribir el div a mano.
- **`FieldGrid`** — la grilla de TODO formulario con campos lado a lado (desde
  el 2026-09-13, en las 19 grillas de la app). Pone tantas columnas como entren
  con un ancho mínimo por campo y baja el que no cabe: mira el ancho
  DISPONIBLE, no la ventana. **No usar `grid-cols-2` ni `sm:`/`lg:grid-cols-N`
  para campos.** Dos fallas que reemplazó:
  - Los modales usaban `grid-cols-2` **sin breakpoint**: en un teléfono, dos
    columnas de ~150 px con las etiquetas partidas.
  - En la calculadora `lg:grid-cols-4` se activaba aunque el formulario
    compartiera el ancho con el panel del precio.
  El `min` va según la etiqueta MÁS LARGA de esa grilla, con su "Obligatorio":
  **`11rem` en un modal** (`Dialog` es `max-w-md`; así entran dos columnas en PC
  y una en el teléfono) y el default de `15rem` en una página. Las etiquetas
  de `Field` no se parten, y si igual no entran se cortan con "…" y el texto
  completo va en el `title`. Un campo a todo el ancho va en un div
  `col-span-full` — **nunca `col-span-2`**: con una sola columna crea una
  columna fantasma y desborda.
- **Skeletons** — `Skeleton`/`TableSkeleton`/`PageSkeleton` (ya NO queda texto
  "Cargando…") y `EmptyState` (ícono + descripción + acción/CTA). Úsalos en listas.
- **Dialog** — limita el alto a `100dvh` y scrollea el cuerpo (los modales no se
  salen de pantalla). Modales con `<form onSubmit>` + botón `type="submit"` dan
  **Enter=Guardar**; el primer input lleva `autoFocus`.
- **Encargos = TRES pestañas en la URL** (2026-10-02): `/orders` (Lista),
  `/orders/calendario` y `/orders/por-cobrar`. Las tres leen `useOrders()`: son
  vistas del MISMO dato, no pantallas hermanas. `/calendar` y `/receivables`
  quedan como redirect. El **filtro de fecha vive solo en Lista**, con selector
  entrega/creación y un aviso clickeable para los encargos **sin fecha de
  entrega** (ocultarlos en silencio es perder justo el pedido que más fácil se
  olvida). Las líneas de artículo van SIEMPRE con
  `features/orders/OrderLinesEditor` (encabezados una vez en escritorio,
  bloques con etiqueta en móvil, `aria-label` por input, subtotal y total en
  vivo): antes eran dos `spinbutton` sin nombre y se creaba un encargo sin ver
  cuánto sumaba. Lo usan "Nuevo encargo" y "Editar artículos" del detalle.
- **Encargo = pedido (2026-09-14, shared 0.16.0)** — la pantalla `/orders` se
  llama **Encargos** en todo el panel (menú, títulos, botones, Dashboard,
  Calendario, Por cobrar, Campañas, Producción, bandeja de la tienda). Ventas es
  SOLO mostrador: el formulario ya no tiene "Tipo" y la API rechaza `ENCARGO`. Su
  tarjeta "Cobrado de encargos" = abonos del periodo + ventas ENCARGO viejas
  ("Encargo anterior": historial semanal del Excel, sin detalle). No volver a
  ofrecer "encargo" como tipo de venta: se contaba dos veces con el pedido.
- **Filtros = SELECTS, no buscador de texto** (decisión del dueño, 2026-09-14). Las
  listas filtran con `Select` sobre valores cerrados (Pedidos: Estado/Cliente;
  Contactos: Tipo/Ciudad; Catálogo: Nombre; Tienda: Categoría/Estado; Compras de
  filamento: Filamento/Proveedor; Gastos: Tipo/Proveedor; Stock:
  Color/Marca/Tipo/Estado). Opciones con
  `uniqueSorted` (`lib/utils.ts`) y siempre un **valor "seguro"**: si lo guardado ya
  no existe, cae a "todos" (si no, select en blanco y lista vacía). **Única
  excepción: Contactos** lleva `SearchInput` solo por nombre y teléfono (por
  dígitos), además de Tipo/Ciudad — en un directorio se busca a alguien puntual.
  En el resto de las listas no reintroducir buscadores de texto.
- **Ordenar / recordar filtros / móvil** — `SortHeader` (cabecera `<th>` ordenable); hooks `lib/useSortable.ts`
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
  `CalculatorScreen` (layout), `sections.tsx` (las 8 secciones de entrada, en el
  orden del Excel; "Luz" se separó de "Máquina"), `ResultPanel` (el precio y su semáforo), `analysis.tsx`
  (comparador de redondeos, mayoreo, producción), `parts.tsx` (bloques
  reutilizables). **`Wizard.tsx` y `steps/` fueron eliminados.**
- **Layout** (cambió el 2026-09-13): formulario ARRIBA y a todo el ancho, el
  panel de precio DEBAJO; en móvil el precio sigue ARRIBA del formulario.
  Después: redondeos, mayoreo y producción. Antes el precio iba en una columna
  `sticky` a la derecha, que no servía —con el cobro en bolívares y el desglose
  el panel mide más que la pantalla— y dejaba cada campo de ~150 px.
- **Grillas de campos: `FieldGrid`** (`components/ui.tsx`), no
  `sm:`/`lg:grid-cols-N`. Pone tantas columnas como entren con un mínimo por
  campo (15rem) y baja el que no cabe; las etiquetas no se parten, así que los
  inputs de una fila quedan alineados. `Field` fija además el alto de la fila de
  la etiqueta: la insignia "Obligatorio" la hacía ~5 px más alta que la del
  campo vecino. Un control que no es input (el interruptor de la luz) va dentro
  de un `Field` con un contenedor `h-10`, el alto de un input.
- **Datos OBLIGATORIOS del trabajo** (los da el laminador, no los catálogos):
  unidades, **gramos de la tanda**, precio del rollo y horas de impresión. Van con
  `RequiredTag` + `REQUIRED_INPUT`, y `missing` (del provider) bloquea guardar.
- **La impresora NO se puede apagar; la LUZ sí, y arranca apagada**
  (2026-09-13). Sin máquina no hay pieza, así que desgaste y horas de la tanda
  cuentan siempre: el interruptor que la quitaba del cálculo se eliminó. La
  electricidad es su propia sección ("Luz", con el consumo en kW y la tarifa)
  y solo se cobra si se activa. El contrato de `shared`
  sigue aceptando `printer` opcional (se edita en `calc3d-api`), pero la
  calculadora lo manda siempre.
- **Un solo margen objetivo** y **un solo precio final**, editable a mano. El
  semáforo (`price.status` → `PRICE_STATUS_LABEL`, ambos de shared) marca
  PIERDES DINERO / Margen bajo / Por debajo de tu objetivo / OK. **No
  re-implementar esos umbrales en la UI**: vienen del motor.
- **Mayoreo por DESCUENTO** (`discountPct`), no por margen. Cada tramo muestra el
  margen real que deja.
- **Mayoreo que se lee solo** (2026-09-13, shared 0.10.0): la tabla muestra cada
  tramo como RANGO ("De 5 a 9 u", "25 u o más"), ordenado, con los avisos de
  `tierRanges` — desde 1 (baja el precio de lista sin que se note), cantidad
  repetida, o un descuento que no mejora al anterior. **"Sugerir"** llama a
  `suggestTiers(c.input)`: el mayor descuento entero que deja el margen en el
  piso o arriba, en tres escalones desde una tanda completa (o 5 u). Si ya hay
  tramos pide confirmación; está deshabilitado mientras falten datos del
  trabajo. "+ Tramo" nunca nace "desde 1": arranca después del último.
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
- ⚠️ **Los breakpoints de Tailwind miran el VIEWPORT, no el contenedor.** Un
  `sm:grid-cols-2` se activa aunque el contenedor sea angosto y trunca las
  etiquetas. Por eso el formulario usa `FieldGrid` y `ResultPanel` reparte sus
  tarjetas con `repeat(auto-fit, minmax(…))` (28rem: la tabla de bolívares
  necesita 440 px), las dos cosas atadas al ancho disponible.
- **EL FILAMENTO SE COTIZA POR TIPO, NO POR COLOR** (2026-10-10, decisión del
  dueño, shared 0.43.0). Al abrir la calculadora el precio del rollo **ya está
  puesto**: es el promedio del tipo que más se compra (el PLA), y el campo lleva
  debajo el renglón que dice qué significa ese número.
  - **Por qué**: medido en producción, el PLA tiene 47 fichas y casi todas valen
    20 — el color no compraba precisión. Entre tipos sí (PLA PURE 13 contra PLA
    SILK 22,84).
  - **Son DOS desplegables sobre UN solo estado** (`c.filamentSource`, en el
    provider): "Elegir un tipo…" y "…o un color exacto". ⚠️ Elegir en uno
    **vacía el otro por construcción** (cada select muestra `filamentSource`
    solo si la clave es de su grupo), así que no hay dos controles que puedan
    contradecirse. El `Select` de la casa **ignora `<optgroup>`** —solo mira los
    `option` directos—, que es por lo que no es un único control agrupado.
  - **Escribir el precio o los gramos a mano suelta la opción** (`pickFilament('')`):
    si no, el renglón seguiría diciendo "promedio del PLA" sobre un número que
    no lo es.
  - ⚠️ **`filamentSource` vive FUERA de `filament`**: ese objeto se manda tal
    cual como `input.filament` en cada `POST /calc` y se guarda en el
    presupuesto, así que un campo de más viajaría en todas las peticiones.
  - ⚠️ **La siembra inicial corre UNA sola vez** (ref `sembrado`) y solo si el
    dueño no tocó nada: sin ese candado, recargar los catálogos le pisaría el
    precio que acabó de escribir.
  - El nombre que queda es **`"PLA (promedio)"`**, no `"PLA"`: ese nombre viaja
    al presupuesto y a la cotización del cliente, y "PLA" a secas afirmaría un
    rollo concreto que nadie eligió.
  - ⚠️ **Acá no se calcula ningún promedio**: lo deriva el servidor
    (`GET /filament/type-prices` → `useCatalogData().filamentTypes`). La
    pantalla solo arma opciones y elige. El renglón menciona **el rollo
    regalado** a propósito: su exclusión es invisible, y sin decirla el promedio
    se lee como un error de cuentas.
  - ⚠️ **El renglón dice la VENTANA, y lo dice DISTINTO cuando el número viene
    de afuera** (2026-10-10, shared 0.46.0). El servidor promedia los últimos 6
    meses (`MESES_DE_LA_VENTANA`, que el texto lee de shared en vez de escribir
    "6" a mano) y marca con `stale` + `lastPurchase` al tipo que no tuvo
    compras dentro. Los dos textos de `textoDeOrigen`:
    - Dentro: *"Promedio de PLA de los últimos 6 meses, sobre 47 rollos
      comprados. El rollo regalado no cuenta."*
    - Afuera: *"ABS no se compra desde enero de 2026: es el precio de esa
      última compra, no un promedio de los últimos 6 meses."* (sin fecha de la
      última compra, no se inventa el mes). **No puede decir "promedio"**: un
      tipo que no se compra hace rato no se presenta como precio de hoy.
  - ⚠️ **La ficha SIN PRECIO sigue en la lista, marcada, y al elegirla la
    pantalla AVISA** (2026-10-10). `PLA Creality Azul oscuro` aparece en $0.00
    porque fue un **regalo**: su compra en $0 es verdadera y se queda.
    Esconderla taparía un dato que hay que ver, así que la etiqueta dice
    *"— sin precio: su compra fue en $0"* (en el TEXTO y no en un color: el
    desplegable no dibuja estilos por opción en todos los navegadores) y al
    elegirla sale un `role="alert"` ámbar que dice que el material va GRATIS y
    que hay que escribir el precio a mano.
    - ⚠️ **El criterio es `rollPrice <= 0` ("no tiene precio"), NO "es
      barato"**: el PLA PURE a $13 contra el PLA a $20 es un precio real y
      legítimo — es justo el dato que hace que cotizar por tipo valga la pena.
      El test *"una ficha BARATA de verdad NO se marca"* está para que nadie
      lo convierta después en un filtro de atípicos. Un `rollPrice` ilegible
      (`''`, texto) también cuenta como sin precio: `Number('')` da 0 y
      cotizaría gratis igual.
  - Tests: `features/calculator/materialOptions.spec.ts` (34, vitest) —
    `opcionesDeFilamento`, `buscarOpcion`, `textoDeOrigen`, `avisoSinPrecio` y
    las reglas viejas de `quotableMaterials`/`materialLabel`, que **no se
    perdieron**: las descontinuadas siguen sin ofrecerse y las que cerraron en 0
    van al final — más `features/calculator/Filamento.pantalla.spec.tsx` (5,
    jsdom) para el CABLEADO: que el renglón salga del mismo `PrecioPorTipo` que
    puso el número en el campo y que el aviso se dibuje al elegir el regalo.
    Medido por mutación: pasarle `[]` a `textoDeOrigen` desde la pantalla tumba
    5 tests y dejar de preguntar por el aviso, 1 — **ninguno de los dos lo
    atrapaban los tests de función pura**.
  - ⚠️ **La clave de caché del promedio cuelga del prefijo `filament-purchases`**
    (`['filament-purchases','type-prices']`, no `['filament/type-prices']`). El
    promedio SALE de las compras, así que todo lo que las cambia tiene que
    invalidarlo: registrar una compra en Gastos (`ExpenseModal`), corregirla o
    borrarla (`EditarCompra`), recibir una línea de factura
    (`useInvoiceMutation`) y corregir el tipo de una ficha
    (`useInvalidarFichas`). Esos cuatro lugares **ya** invalidan
    `['filament-purchases']` y React Query invalida **por prefijo**, así que
    queda cubierto sin sumar una clave más a cuatro listas — que es
    exactamente como se quedan viejos los números en este panel. Con una clave
    propia, registrar una compra dejaba la calculadora cotizando con el
    promedio anterior hasta volver a montar la pantalla.
  - ⚠️ **Dos `if` de guarda se escribieron y se borraron el mismo día** porque
    ninguna mutación los tumbaba (código muerto, como el `if (guardado ===
    TODOS)` de `tipoSeguro`): `if (!key) return undefined` en `buscarOpcion` y
    `if (!key) return A_MANO` en `textoDeOrigen`. Los dos caen por el camino
    normal al mismo valor. Los tests se quedaron.
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

- **Categoría propia del menú, "Filamento"** (2026-09-13), con TRES páginas y
  su propia dirección: **Stock del mes** (`/filament/stock`), **Compras**
  (`/filament/compras`) y **Análisis** (`/filament/analisis`). **Materiales ya no
  tiene página** (2026-09-14): `/catalogs/materials` redirige a Stock. Antes eran pestañas de una
  sola página en Definiciones: no se podía enlazar a una ni volver con "atrás".
  `/filament` sola redirige a Stock, para no romper enlaces viejos. Las tres
  comparten encabezado (`FilamentShell` en `pages/Filament.tsx`) y reusan los
  componentes de `features/filament/` (`StockTab`/`PurchasesTab`/`AnalysisTab`,
  que conservan el nombre). Vive aparte de Catálogos (alta de fichas) y de
  Gastos (dinero que sale): acá se responde "cuánto me cuesta el filamento y
  cuánto me queda".
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
  **Filtros** (2026-09-14): selects de Color (acotado al Tipo elegido), Marca, Tipo
  y Estado (arranca en **Todas**; `filament:stock:color|brand|type|status`). Un
  valor guardado que ya no existe cae a "todos". ⚠️ Solo cambian lo que
  SE VE: cerrar el mes guarda TODAS las fichas. Con fichas ocultas hay aviso
  ("Se ven X de Y… Quitar filtros") y la confirmación de cierre lo repite; no
  arrancar en "Activas": una descontinuada con rollos se cerraría en 0 sin verla.
  La cabecera de cada color suma TODAS sus marcas aunque el filtro oculte
  algunas ("1 de 3 marca(s)").
- **En el conteo solo salen las fichas que HAY** (2026-10-01, decisión del
  dueño, shared 0.18.0): las que tenían rollos al cierre del mes anterior o se
  compraron en este. `exhausted` en `GET /filament/stock` = el mes ANTERIOR
  (CERRADO) no la tenía —en 0 **o fuera de su conteo**: 11 fichas importadas
  con compras del 31/08 nunca entraron al cierre de agosto—, no se compró en
  este y no tiene rollos anotados. Se esconden con un aviso "N ficha(s) se acabaron en … Mostrarlas"
  (`verAgotadas`, no persistente); una a la que se le escriben rollos en el
  borrador no se esconde. Al cerrar se guardan igual, en 0, y la confirmación
  lo dice. Comprarla en Gastos la hace volver.
- **Una TARJETA por ficha** (2026-10-01, pedido del dueño: con filas sueltas
  "se pierde" y se escribía en una creyendo que era otra). Grilla `auto-fill`
  de ~20rem: cada tarjeta lleva muestra del color (`Muestra`/`MUESTRAS`, un
  DATO como los pines de Contactos, no paleta de marca), "PLA Amarillo" y la
  marca debajo, el total grande y tres `Contador` con − / + y, debajo de CADA
  casilla, lo que tenía el mes anterior ("sep. 1"). La tarjeta donde se escribe
  se ilumina en oro (`focus-within`). "· cambió" solo aparece con dato (mes
  cerrado o algo cargado): antes de contar, todo vale 0 y sería ruido. Con
  varias marcas del mismo color, cada tarjeta dice el total del color.
- **Cómo cerró el mes anterior** (2026-10-01, decisión del dueño): `previous`
  en `GET /filament/stock` (null si ese mes no está cerrado). Cada marca muestra
  "Agosto: 1 por acabarse" con un botón **"Igual que agosto"**, y hay un
  **"Copiar todo agosto"** (pide confirmación si ya hay casillas llenas). ⚠️ Se
  COPIA a pedido, NO se precarga: precargado, una ficha que no se miró se
  cerraría con el número viejo como si se hubiera contado.
- **El mes se CIERRA, no se guarda casilla por casilla** (2026-09-13, shared
  0.13.0). Lo escrito vive en un borrador del navegador
  (`filament:stock:draft:AAAA-MM`) hasta tocar **"Guardar y cerrar"**, que manda
  todas las fichas juntas (`POST /filament/stock/close`). Sin ningún rollo
  cargado, la confirmación avisa en tono destructivo que queda TODO en 0. Si el
  cierre falla, el borrador NO se borra; si el mes YA está cerrado (se pudo
  cerrar desde otro dispositivo), el borrador de ese mes se descarta y al
  reabrir se ve lo guardado en la base, no un borrador viejo. Un mes cerrado
  queda de solo lectura y se corrige con **"Reabrir mes"** (con confirmación).
  El botón se habilita desde el último día del mes en hora de Venezuela
  (`canCloseMonth`), pero el límite REAL está en el servidor. Un mes abierto no
  muestra total, consumo ni reposición. Spec:
  `calc3d-api/docs/superpowers/specs/2026-09-13-cierre-mensual-stock-design.md`.
- ⚠️ **Casillas vacías = no hay** (2026-09-13, decisión del dueño, como se lee el
  Excel): al cerrar, lo que no se marcó queda en 0. `counted` es "el mes está
  CERRADO"; un mes abierto (nunca cerrado o reabierto) es "sin dato" y su total
  no se pinta en rojo. Por eso no hay aviso de "X de Y colores".
- La **lista de reposición va POR TIPO + COLOR, no por marca** (2026-09-13,
  shared 0.11.0): la marca cambia de un mes a otro, el color es lo que se maneja.
  Tres columnas (`RestockCard` en `StockTab.tsx`), cada una de más comprado a
  menos: **Sin rollos** (rojo), **Por acabarse** (ámbar) y **Conviene reponer**
  (los colores comprados MÁS que el promedio por color, con 1 rollo o menos —
  decisión del dueño). La tarjeta "Hay que reponer" cuenta solo las dos
  primeras y anuncia las sugeridas aparte. Los descontinuados nunca entran.
  Se descontinúan desde la ficha (tocando la marca en Stock del mes).
- **"Armar pedido con lo que falta"** (2026-10-10, shared 0.38.0) — el botón de
  la `RestockCard` que cierra el circuito stock → pedido: navega a Compras
  (`/compras`) y abre el diálogo de la factura nueva **ya cargado**. Quién entra
  lo decide `suggestRestockLines` de shared sobre la **misma** `resumen.restock`
  que la tarjeta está mostrando (acá no se clasifica nada); el JSX solo cambia
  de forma y navega.
  - ⚠️ **Una línea por COLOR, no por ficha**, con una ficha activa del grupo
    (gana la que ya se compró alguna vez). En la base real 10 de 34 colores
    tienen más de una ficha activa y el PLA Negro tiene CUATRO marcas: por
    ficha, el pedido pedía negro cuatro veces.
  - ⚠️ Solo **Sin rollos** y **Por acabarse**. "Conviene reponer" queda afuera:
    no es un faltante.
  - ⚠️ **Es una PROPUESTA**: el diálogo lo dice, se pueden sacar líneas y
    cambiar cantidades, y **nada se escribe hasta Guardar**.
  - ⚠️ La ficha **sin compra previa** (o con `rollPrice` en 0 — hay una real,
    importada del Excel con monto 0) entra con el precio **en blanco**, y
    `Borrador.unitPrice` es `number | null` para poder representarlo: el botón
    Guardar se bloquea y el aviso dice cuántas faltan. **Ese campo NO usa
    `NumberInput`**, que mapea el campo vacío a 0 — con él, vaciar el precio
    dejaba la línea en $0 y guardable, o sea cargada como si el rollo fuera
    gratis.
  - ⚠️ La propuesta viaja en el **estado de la navegación** y se **limpia en el
    acto** (`navigate(pathname, { replace: true, state: null })`): si quedara,
    recargar o volver atrás reabriría el diálogo con una propuesta vieja.
- Los **rollos por identificar** (`needsBrandCheck`, los que vinieron del Excel sin
  marca) se listan aparte; el aviso se apaga al CERRAR el mes (el cierre escribe
  `needsBrandCheck: false` en todas las fichas), no al contarlos a mano.
- **Análisis** (`AnalysisTab`): la parte de la hoja "Resumen" que mira las
  compras — rollos e inversión **por marca** (con costo promedio por rollo y
  participación), **colores más comprados** y reparto por material. Usa el helper
  puro `groupPurchases` de shared sobre las MISMAS compras que la pestaña de al
  lado; no hay endpoint propio, para que los totales no puedan discrepar.
- ⚠️ `capitalize` de Tailwind pone mayúscula en CADA palabra ("Septiembre De
  2026"): para un mes en español va `first-letter:uppercase`.

### Dashboard + finanzas (`pages/Dashboard.tsx`, `Sales.tsx`, `Expenses.tsx`; `features/finance/`)
- KPIs (ventas, gastos, **resultado de la operación**, ticket), la **cadena de
  caja** ("venías con … te queda …", ver abajo), recuperación de inversión y 4
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
  - ⚠️ **"Además debés $X de facturas de compra" va AL LADO, no adentro**
    (2026-10-10, shared 0.40.0). La tarjeta cierra con esa nota cuando hay
    facturas con saldo, y el texto dice explícitamente que es **un compromiso
    puntual y no un costo mensual** y que **no está sumado arriba**. No es
    adorno: una factura se paga una vez, y si entrara entre los costos fijos el
    equilibrio saltaría cada vez que llega una compra grande, justo el número
    con el que se ponen precios. El cálculo es `equilibrioYCompromiso` de shared
    —los niveles salen de ahí ya calculados SIN el compromiso, el JSX no suma
    nada— y el monto es `totals.proveedores` de `useLoansOverview()`, el **mismo
    endpoint** que dibuja la pantalla Deuda. Lo pagado de más no se resta.
    Estilo: la misma nota en caja gris que usa Deuda para "pagado de más", a
    propósito — es la misma idea ("este número no está en el de arriba").
    Regresión en shared: `breakeven-compromiso.spec.ts`.
- **Metas** (`pages/Goals.tsx`, `features/goals/api.ts`, en Finanzas): metas
  mensuales de ventas, encargos y clientes nuevos. **Solo se cargan las metas**;
  el cumplimiento lo deriva el servidor. El Dashboard muestra la del **mes en
  curso** (no la del rango del filtro: una meta mensual solo significa algo
  contra su mes). La barra se recorta al 100 % pero el número no: pasarse de la
  meta es información.
  - **Selector de mes y "Sugerir metas"** (2026-10-07, shared 0.25.0).
  - ⚠️ **Sugerir NO guarda.** Rellena el formulario y nada se escribe hasta
    "Guardar". El endpoint (`GET /goals/suggestion`) es de solo lectura y hay un
    test que recorre el mock exigiendo que en ese camino no exista ni un método
    de escritura. El hook es **lazy**: cero peticiones hasta tocar el botón.
  - ⚠️ **La explicación NOMBRA los meses usados**, no solo los cuenta. La base
    son los últimos 3 completos que existen **hoy**, no los 3 anteriores al mes
    elegido: el dueño carga con meses de anticipación y los previos a enero
    todavía no terminaron. Cargando enero puede estar sugiriendo sobre
    julio-septiembre — defendible solo si se ve.
  - **Tres estados de mes**, decididos en hora local con `currentMonthKey()`:
    **futuro** muestra la meta y "Aún no empezó" (sin porcentaje ni barra: un
    0 % al lado de una meta de $450 se lee como un fracaso que no ocurrió),
    **en curso** muestra el avance parcial rotulado, **cerrado** como siempre.
  - Un mes **sin meta** igual muestra su resultado, con "Sin meta definida".
    Para eso existe `GET /goals/actuals`, aparte de `GET /goals?month=`:
    ⚠️ **esa devuelve `null` sin meta y el Dashboard cuenta con eso** para no
    dibujar su tarjeta.
  - El aviso de temporada va **arriba de Guardar**, y cuando no hay un año de
    historial lo dice: *que no haya aviso no quiere decir que no pase*. El
    primer mes medible es febrero 2027.
- **Deuda** (`pages/Loans.tsx`, `features/loans/api.ts`, en Finanzas): préstamos
  con sus pagos, saldo y avance **derivados por el servidor**. Un pago de
  préstamo NO es un gasto y por eso esta pantalla vive fuera del ledger: el
  equipo ya está ahí como inversión.
  - **Muestra LAS TRES DEUDAS** (la tercera, 2026-10-10): lo que le debés al
    **prestamista**, lo que el negocio le debe a la **contraparte** (obligación
    por obligación) y lo que le debés a los **proveedores**. Caja muestra el
    resumen por fuente; acá se ve **cuál** gasto concreto sigue sin devolverse.
    ⚠️ Las tres las deriva el servidor y salen de los MISMOS servicios que usan
    Caja y Compras: si esta pantalla recalculara, el día que un filtro cambie
    dirían cosas distintas.
  - ⚠️ **El total de arriba es la suma de los tres bloques y lo suma el
    SERVIDOR** (`totals` de `GET /loans/overview`). `TotalDeLaPantalla` dibuja
    el total **con sus tres sumandos a la vista**, y cada bloque muestra el
    mismo número que el servidor usó para sumar (el del prestamista salía de un
    `reduce` local y pasó a `totals.prestamista`). **No volver a sumar acá**:
    con dos caminos al mismo número, un total que no cuadra con lo que tiene
    debajo se lee como la verdad, porque nadie suma a ojo.
  - **Proveedores** (`DeudaConProveedores`): una fila por proveedor con lo que
    le debés y cuántas facturas suyas están sin pagar, con enlace a
    **`/compras`**. ⚠️ **Acá no se gestiona nada** —abonar, recibir y anular
    viven en Compras— o habría dos puertas para la misma escritura.
    - ⚠️ **El SALDO A FAVOR se muestra APARTE y se dice que no se descuenta
      solo.** Restarlo del total diría que debés menos de lo que debés mientras
      esa plata sigue en poder del proveedor. Es un cartel al pie del bloque, no
      un número metido en la suma.
      - ⚠️ Desde el saldo a favor (2026-10-10, shared 0.45.0) la columna se
        llama **"Tiene a favor"** y es lo **DISPONIBLE**, no lo que se pagó de
        más alguna vez: el servidor ya le resta lo aplicado. Y el cartel dice
        **qué hacer** —usarlo abonando una factura de ese mismo proveedor y
        eligiendo *tomarlo del saldo a favor*, en Compras—: antes informaba una
        plata atrapada sin salida.
    - Una factura **sin proveedor anotado** aparece igual, como "Sin proveedor
      anotado" en gris: esconderla por no tener nombre sería perder plata que se
      debe.
    - El agrupado, la regla de la factura anulada, la del abono anulado y la de
      no compensar viven en la API (`deuda-por-proveedor.ts` +
      `loans.service.spec.ts`, 36 tests entre las dos suites). Acá quedó solo el
      JSX. (Se escribió cuando `apps/web` todavía no tenía runner; hoy lo tiene,
      pero la lógica sigue bien donde está: es del servidor.)
    - ⚠️ **`useInvoiceMutation`** (`features/purchases/api.ts`) **no invalida
      `['loans']`**, así que abonar con Deuda abierta en otra pestaña deja el
      bloque viejo hasta el próximo montaje. Es una línea en esa lista de claves
      y conviene sumarla.
  - **"Faltan X" son DOS lecturas**, al ritmo objetivo y al real. Una sola miente
    con pagos irregulares, que es el caso real.
  - **Anular reemplaza a borrar**: el pago queda tachado en el historial con su
    motivo y el saldo vuelve a subir.
  - Que un pago personal **genere deuda se pregunta**: la casilla aparece solo
    cuando lo puso una persona, no la caja.
  - ⚠️ **Quién paga una cuota NO es el acreedor del préstamo.** Las 4 cuotas
    históricas las puso el **propietario**, no el prestamista. Una versión del
    puente resolvía el nombre contra `loan.counterparty` y las cuatro filas
    pasaron a decir "Una contraparte" apenas el backfill llenó
    `counterpartyId`. Hoy el **nombre viaja CON el pago** (`p.counterparty`):
    buscarlo por separado ya se leyó mal una vez. `null` = la caja.
    **Con `counterpartyId` nulo el bug no se veía**: apareció recién al correr
    el backfill contra la base local, no en los tests.
  - ⚠️ **El Dashboard y esta pantalla pasan los préstamos por `paraEquilibrio()`**
    antes de `monthlyLoanPayments`: la cuota viene en SU frecuencia y hay que
    normalizarla. Pasar el préstamo crudo contaría una cuota semanal de $50 como
    $50 al mes.
- **Caja** (`pages/Cash.tsx`, `features/cash/api.ts`, en Finanzas; rediseñada el
  2026-10-05, shared 0.21.0): saldo del negocio, lo que se le debe a la
  contraparte y al prestamista, las **conciliaciones** y los movimientos de
  plata pura. Todo lo DERIVA el servidor; las mutaciones devuelven el resumen y
  se guardan directo en la caché `['cash']`. ⚠️ Las compras que paga la
  contraparte NO se cargan acá: van en **Gastos** con **"¿Quién lo pagó?"**
  (la contraparte, también editable desde la columna "Pagó"), y las cuotas en
  **Deuda** con el mismo campo. Categoría de gasto: **Diseño**.
  - ⚠️ **La cuenta es COMPARTIDA: son CUATRO números, no dos.** Esperado del
    negocio · total de la cuenta · personal declarado · real del negocio
    (`total − personal`). **Nunca** se compara el total contra el esperado. Lo
    personal **lo declara el dueño**; el sistema no puede saberlo (su plata
    entra y sale por fuera). Se sugiere el de la conciliación anterior.
  - **Conciliar es en DOS pasos**: "Guardar borrador" y, viendo las cuatro
    líneas y el reparto, "Confirmar". El diálogo no se cierra al guardar, o el
    paso de previsualización nunca se vería.
  - ⚠️ **El reparto NO se calcula en el front**: viene en `reconciliation.plan`,
    que el servidor arma por el mismo camino que `confirm()`. Deducirlo de
    `obligations` (sin filtro de fecha, contraparte por defecto) mostraría
    deudas que el servidor va a ignorar al conciliar una fecha pasada.
  - **Elegir la deuda destino del faltante** (fase 4, 2026-10-06, shared
    0.24.0): un `Select` en el diálogo, con "La más antigua (automático)" por
    defecto. Lo alimenta **`useShortfallPlan`** (`features/cash/api.ts`), que
    pega a `GET /cash/reconciliations/:id/plan?targetSource&targetSourceId`.
    - ⚠️ **Las opciones salen de `obligations` de ESE endpoint, nunca de
      `summary().obligations`.** Es el mismo bug de la fase 1 corrido a la
      lista de opciones: la del resumen viene sin filtro de fecha y con la
      contraparte por defecto de la organización, así que ofrecería deudas que
      confirmar rechaza con un 400.
    - ⚠️ **Si va a atribuir lo decide el servidor** (`willAttribute`), no una
      copia de la regla en el front. Mientras esa consulta no responda, el
      botón **Confirmar va deshabilitado**: confirmar a ciegas mandaría
      `attributeShortfall: false` y saltearía la atribución en silencio.
    - El endpoint es **caro** (arma el ledger entero): la consulta solo corre
      con el diálogo abierto y con un borrador, lleva la deuda elegida en la
      `queryKey` con `staleTime` de 60 s —volver a una elección reciente no
      pide nada— y **se apaga mientras se confirma**, porque si no la
      invalidación de `useCashMutation` dispara una previsualización de un
      borrador que acaba de dejar de serlo y el servidor la rechaza con un 400.
    - ⚠️ **`useCashMutation` también invalida `['cash','shortfall-plan']`**, por
      lo mismo que invalida `breakdown`: corregir un borrador NO cambia su id,
      así que sin eso quedaría en pantalla el reparto del total anterior.
    - El texto de la opción por defecto **sigue a `applicationOrder`** ("La más
      reciente" con `NEWEST_FIRST`): fijarlo en "la más antigua" nombraría
      justo la deuda contraria a la que cobra primero.
    - ⚠️ Con opciones tan largas, el popup del `Select` **sobresale ~9 px del
      viewport a 375** (el primitivo no le pone `collisionPadding`). Medido: el
      texto y el tilde de la opción elegida se ven enteros y la página no
      scrollea de lado, así que se dejó; si alguna vez hay que arreglarlo, va
      en el primitivo, no en esta pantalla.
  - La atribución automática del faltante está **apagada por defecto** y es por
    cuenta; una diferencia **a favor no ofrece nada**. Anular revierte el ajuste
    y deja la fila tachada en el historial.
  - **Nombres dinámicos en TODO el panel** (fase 2, 2026-10-05): `grep -rn
    "Vanan" apps/web/src` da **vacío**. `PAID_BY_LABELS` pasó a ser la función
    `paidByLabels(nombre)` — con una constante volvía el nombre propio al
    código — y en 2026-10-09 se borró del todo: los nombres salen ahora de la
    contraparte de cada fila. El del dueño sale de **`useOwnerName()`**
    (`features/cash/api.ts`), que lee `useCounterparties()`: ⚠️ **no uses
    `useCash()` para esto**, ese resumen trae el ledger entero, las obligaciones
    y todas las conciliaciones. Es un hook: va en el cuerpo del componente,
    nunca dentro de un `map` ni un callback.
  - **Configuración → Caja** (sección propia, no bajo "Moneda": las tasas son
    presentación y esto es quién pone la plata). Dos tarjetas en
    `features/cash/`: `CounterpartiesCard` (contrapartes, con sus 409 del
    servidor mostrados tal cual vía `apiErrorMessage`) y `CashAccountsCard`
    (cuentas + reglas de conciliación).
    - ⚠️ La casilla de **atribución automática** escala a ámbar con icono
      cuando se enciende: el riesgo se vuelve real justo ahí, y una advertencia
      gris constante se lee como pie de página.
    - ⚠️ El selector de contraparte **incluye la inactiva que ya tiene atada la
      cuenta**. Filtrando solo activas, editar una cuenta vieja mostraría el
      select en blanco y guardar le cambiaría la contraparte sin que nadie lo
      pida.
    - ⚠️ **No hay hook compartido para guardar settings**: cada tarjeta arma su
      `useMutation` con `api.patch('/settings', ...)` e invalida `['settings']`.
    - El límite de multicuenta va **al pie de la tarjeta**, no escondido: solo se
      concilia la cuenta principal.
  - **Se lee en el teléfono y cada línea se abre** (fase 3, 2026-10-05, shared
    0.23.0). Las tres tablas de Caja tienen **tarjetas bajo `sm` y tabla desde
    `sm`**.
    - ⚠️ **Lo que no se puede duplicar es la LÓGICA, no el markup.** Cada
      tarjeta arma primero un array de filas **ya resueltas** —`money()` ya
      llamado, decisiones ya tomadas, handlers ya cerrados sobre su dato— y lo
      mapea dos veces con JSX tonto. Nada de `hidden sm:block` con dos árboles
      escritos a mano, y nada de conmutar con `matchMedia` (salto de hidratación
      y JS para algo que resuelve el CSS).
    - **"De dónde sale el saldo" es desplegable**: `GET /cash/breakdown/:cat`
      vía `useCashBreakdown`, **lazy** (`enabled: category != null`) y **una
      sola categoría abierta por vez**. El pie de cada lista muestra el total
      del detalle: si alguna vez no coincide con la línea, el dueño lo ve.
    - ⚠️ **`useCashMutation` NO invalida: pisa la caché con
      `setQueryData(['cash'], data)`.** Por eso hay que invalidar
      `['cash','breakdown']` ahí explícitamente, o el detalle queda viejo
      mientras la línea de arriba ya cambió. Las mutaciones que sí hacen
      `invalidateQueries(['cash'])` **no** necesitan nada: React Query invalida
      por prefijo.
    - ⚠️ **El `total` del endpoint viene SIN signo** (los `amount` son
      positivos; el signo lo pone `CASH_SIGN` del motor). La línea y el detalle
      salen **los dos** de `CASH_SIGN`: los literales `-b.expenses`,
      `-b.filament`… murieron, eran una segunda fuente de signos conviviendo
      con el motor.
    - Una categoría en 0 **no se dibuja** (filtro preexistente), así que toda
      categoría que se puede abrir vale ≠ 0 y **un detalle vacío es siempre un
      BUG**: se dice con esas palabras, no con un "sin movimientos"
      tranquilizador.
    - Badge **"Importado"** solo donde `source === 'EXCEL_IMPORT'`.
      `MIGRATION` y `RECONCILIATION` no son importaciones y una insignia de más
      vuelve ruido a todas.
    - "Ajustada con $X" enlaza al `OwnerMovement` que la ajustó
      (`#mov-{id}` + `scroll-mt-24` + realce con `:target`).

> ⚠️ **Verificar Caja en local es difícil y el modo honesto está acotado.** Los
> datos locales **no tienen** ninguna conciliación ajustada, ninguna fila
> `EXCEL_IMPORT` ni ningún retiro parcialmente aplicado, y **cuatro de las nueve
> categorías valen 0**, así que no se dibujan. Para medir esos casos: inyectar
> el dato **en el render** con un bloque temporal, medir, revertir y confirmar
> con `grep`. **Nunca escribirlo en la base del dueño.**
>
> ⚠️ **El panel del escritorio de Claude no scrollea** (renderiza a altura
> completa) y las capturas del pane salen en negro a tamaño móvil. Para medir
> scroll o sacar una captura hace falta un Chrome real. Medir el **DOM**, no la
> foto.
- **Producción** (`pages/Production.tsx`): dos mediciones que se cargan en dos
  lugares, y no da lo mismo:
  - **Horas** → `ReadingsCard` en esa misma pantalla: una lectura por mes con
    lo que MARCA el contador de cada máquina, igual que el conteo de rollos.
    NO se suman las horas de los pedidos, porque también se imprime fuera del
    negocio y eso gasta vida útil. Guarda al salir del campo (`onBlur`) y avisa
    en rojo si el número es MENOR que el del mes anterior (un contador no baja).
  - **Fallos** → `features/orders/ProductionCard.tsx`, en el detalle del pedido.
  ⚠️ Esa tarjeta usa un input propio y NO `NumberInput`: el valor de
  `NumberInput` es `number` y el vacío colapsa a 0, pero acá **vacío significa
  "sin medir" y 0 significa "sin fallas"**. Confundirlos llenaría la tasa real
  de ceros que nadie midió. Lo mismo vale para la lectura: sin lectura,
  `lifeUsed` es **null**, no 0 %.
- **Reposición de equipos** (`features/equipment/api.ts`): tarjeta por máquina
  (repuesto / falta / %), con el reparto en cascada por orden de compra. Lo
  calcula el SERVIDOR sobre toda la historia: **no depende del filtro de
  fechas**. Reemplazó a la tarjeta "Recuperación de la inversión", que sí
  dependía del rango y por eso mostraba un negocio distinto según lo elegido.
- ⚠️ **La UTILIDAD se mide contra los gastos OPERATIVOS**, no contra todo lo
  que salió (`agg.gastosOperativos` = gastos − inversión). Comprar una impresora
  no es perder ese dinero: es inversión que el negocio devuelve, y es la misma
  definición que usa Reposición de equipos. Restándola, el KPI contaba las
  máquinas como gasto mientras el texto de esa tarjeta, en la MISMA pantalla,
  decía "las impresoras no son gasto: son inversión". El KPI "Gastos" muestra el
  operativo y anuncia la inversión aparte en su renglón de apoyo, para que la
  resta se pueda seguir a ojo. Lo mismo en **Gastos** (`pages/Expenses.tsx`):
  el total incluye la inversión y la tarjeta "De inversión" es un
  SUBCONJUNTO, no un segundo monto — sin decirlo, se leen como dos cubetas que
  se suman.
- ⚠️ **En Gastos los tres KPIs se calculan sobre LO QUE SE VE** (2026-10-10),
  la misma regla que ya seguía Ventas. La tabla mostraba `visibleRows` y los
  totales sumaban `rows`: con el filtro de proveedor puesto se veían 2 gastos y
  un "Total del periodo" que seguía siendo el de los 87. Los deriva
  `totalesGastos(visibleRows)`, pura y exportada (`pages/Expenses.tsx`).
  - ⚠️ **La ETIQUETA cambia con el número**: con filtros puestos dice "Total de
    lo que se ve" y su pie, "N de M gastos"; además un renglón nombra los
    filtros activos y ofrece "Quitar filtros". Dejar el cartel "Total del
    periodo" sobre un número filtrado es cambiar una mentira por otra.
  - **Las opciones del filtro de proveedor salen de las FILAS CARGADAS**, no del
    directorio entero (el patrón de `PurchasesTab`), así que no se puede elegir
    un proveedor que deje la tabla vacía; se agrupan por **id** y no por nombre,
    y el select **no se dibuja** si ninguna fila del rango tiene proveedor.
  - **El vacío distingue los dos casos**: "sin gastos en este periodo" vs
    "ninguno de los M pasa el filtro", y en el segundo el botón es "Quitar
    filtros" y no "Registrar gasto" — mandaría a cargar un gasto que ya existe.
  - ⚠️ Los textos de los tipos viven en `TIPOS_DE_GASTO`, una sola lista que
    alimenta el desplegable **y** el aviso de filtros: con el texto escrito dos
    veces, renombrar una opción deja al aviso diciendo el nombre viejo.
  - **LO QUE DERIVA ESTA PANTALLA VIVE EN `features/finance/expenses-view.ts`**
    (2026-10-10), como Ventas con `sales-view.ts`: `TIPOS_DE_GASTO`, `TODOS`,
    `tipoSeguro`, `pasaTipo`, `totalesGastos`, `filaDeGasto` y el tipo
    `FilaGasto`. La pantalla se queda con el JSX, los hooks y las mutaciones.
    ⚠️ No es prolijidad: mientras vivían dentro de `pages/Expenses.tsx`, su spec
    las importaba DESDE la pantalla y arrastraba React, React Query y axios para
    probar una suma — un import roto en cualquier rincón de la pantalla tumbaba
    el test de una función intacta y el fallo señalaba al lugar equivocado.
    `matchesType` era un closure de 9 ramas **sin un solo test**: salió tal cual
    como `pasaTipo(filtro, gasto)` y hoy tiene las nueve cubiertas.
  - ⚠️ **"General" NO incluye las inversiones** (2026-10-10, decisión del
    dueño): significa *lo que no es filamento, ni impresora, ni inversión*.
    Hasta ese día la rama `general` de `pasaTipo` no miraba `isInvestment`, así
    que una impresora marcada como inversión y **sin ficha enlazada** aparecía
    en "General" **y** en "Inversión" a la vez: las partes sumaban más que el
    total y ninguna de las dos etiquetas significaba lo que decía.
    - El test que fijaba el comportamiento anterior estaba puesto **a
      propósito** (la mudanza a `expenses-view.ts` no cambiaba nada de lo que la
      pantalla hacía) justo para que este cambio no pasara en silencio. Hizo su
      trabajo: se cambió con su comentario, que ahora dice la regla nueva.
    - ⚠️ **Quedan DOS superposiciones más, sin tocar porque son decisión de
      producto**, y las dos por el mismo motivo: el desplegable mezcla EJES
      distintos en una sola lista. **"Los puso una persona"** cruza con todos
      (es *quién pagó*, no *qué se compró*) e **"Inversión"** cruza con
      Impresoras / Filamentos / Insumos cuando el gasto está enlazado a una
      ficha (es *cómo se cuenta*). Separarlas de verdad pide dos filtros, no
      nueve opciones en uno. Anotadas en el comentario de `pasaTipo`.
  - **LOS DOS FILTROS SE RECUERDAN** (2026-10-10): `usePersistentState` con
    `expenses:tipo` y `expenses:proveedor`, como el resto del panel (el rango de
    fechas de esta pantalla ya lo hacía, con `daterange:expenses:*`). Los dos
    pasan por su **valor seguro** antes de usarse.
    - ⚠️ **El de tipo no lo tenía, y persistir sin eso es el bug.** En un
      `useState` arrancaba siempre en "todos" y un valor imposible no podía
      existir; guardado en localStorage sí puede —una opción retirada o
      renombrada, un valor de una versión anterior— y entonces ningún gasto pasa
      el filtro: **la tabla se abre vacía, con el desplegable en blanco y sin
      nada que explique por qué**. Lo cierra `tipoSeguro` (pura, con test), que
      cae a "todos" igual que el de proveedor.
    - El test de `tipoSeguro` **recorre TODA la lista** `TIPOS_DE_GASTO`: una
      opción nueva que se olvide de la función rompe el test en vez de vaciar la
      tabla.
    - ⚠️ `TODOS` (= `'ALL'`) es el centinela de "no filtrar" de **los dos**
      filtros, en una constante. Es un valor y no la ausencia de uno porque el
      `Select` de marca prohíbe `value=""`.
    - ⚠️ No hay caso especial para `TODOS` dentro de `tipoSeguro`: no está en la
      lista, cae por el camino normal y el respaldo **es ese mismo valor**. Un
      `if (guardado === TODOS) return TODOS` arriba sería **código muerto** —
      devuelve lo mismo y ninguna mutación puede tumbarlo—; se escribió y se
      borró el mismo día.
  - **TARJETAS EN EL TELÉFONO** (2026-10-10): era la última lista de finanzas sin
    ellas. Medido ese día: a 375 px la tabla medía **884 px dentro de un
    contenedor de 341**, o sea el 39 % de la fila a la vista y el resto de
    costado. Patrón de la casa: `hidden md:block` para la tabla,
    `md:hidden divide-y` para las tarjetas.
    - ⚠️ **Lo que no se duplica es la LÓGICA.** Hay **UN** array de filas ya
      resueltas (`filaDeGasto`, pura y con tests: día recortado, etiqueta,
      monto ya pasado por `money()`, duración ya armada, `deFactura`,
      `pagadorId`) que las dos presentaciones mapean con JSX tonto, y los cuatro
      controles —`EtiquetaDeTipo`, `MarcaDeFactura`, `SelectorDePagador`,
      `BotonBorrar`— existen **una sola vez**. Con dos árboles escritos a mano,
      el día que cambie una columna se arregla uno y se olvida el otro; acá lo
      que se olvidaría es justo lo que cuida la plata: la fila **de factura** va
      **sin tacho** y con el pagador **`disabled`**, porque la API rechaza las
      dos cosas con un 400.
    - ⚠️ En la fila resuelta, **ausencia y cero son cosas distintas**:
      `cantidad` es `string | null` y el guion lo pone cada presentación (la
      tabla tiene que llenar la celda; la tarjeta no dibuja la línea). Con
      `quantity || …` una compra de **0 rollos** dejaría de verse. Tiene test.
- ⚠️ **El punto de equilibrio se compara contra los INGRESOS** (`agg.ingresos`
  = ventas + abonos de pedidos), no contra `agg.ventas`. Con solo las ventas de
  mostrador, la tarjeta decía "vendiste $5,00 · 3 %" mientras la de Metas, justo
  debajo, decía "$68,50 · 27 %": dos números distintos para lo mismo en la misma
  pantalla.
- **Alertas proactivas**: `ProfitabilityAlert` (productos por debajo del margen
  mínimo → `/products`), `CampaignAlert` (campañas `LOSS`/`AT_RISK` con inversión
  > 0 **y VIGENTES** → `/campaigns`; ver abajo) y **`AtrasoDeCompraAlert`**
  (facturas de compra que no llegaron cuando dijeron → `/compras`, 2026-10-10).
  ⚠️ **Las tres comparten caja, ícono y forma** (`Link` ámbar, número en
  negrita, detalle apagado al lado): un cuarto estilo de cartel en la misma
  pantalla hace que ninguno se lea como un aviso. ⚠️ Y **ninguna calcula**: el
  atraso lo decide `facturasAtrasadas` de shared, la MISMA función que destaca
  las facturas en Compras, con `todayKey()` como "hoy". Si el Dashboard contara
  por su cuenta, el día que la regla cambie el aviso diría "3" y la pantalla a
  la que lleva mostraría 2.

#### Ventas → «Ventas de mostrador» (2026-10-02)

Renombre **solo de front**: el `kind` de la base y la API no se tocan (la API ya
rechaza crear `ENCARGO`). Lo demás:
- ⚠️ **Las 25 ventas `ENCARGO` se ocultan tras el interruptor «Ver histórico
  importado»** (`sales:ver-historico`, apagado por defecto), o el título mentiría
  sobre 25 de las filas. **Los tres KPIs (Total vendido · Cantidad · Ticket
  promedio) se calculan sobre LO QUE SE VE**: si no, la tabla mostraría 97 filas
  y el total sumaría 122, y el ticket volvería a dividir entre 25 "ventas" que
  son semanas enteras. La columna "Tipo" solo aparece cuando hay histórico a la
  vista de verdad. Se fue el KPI «Cobrado de encargos»: mezclaba dos flujos y
  contradecía el título (ese dato vive en el Dashboard y en Encargos).
- **Sin columna «Cliente»** (casi siempre vacía): el cliente va debajo de la
  nota cuando existe, en tabla y en tarjetas.
- **Dos vistas sobre los MISMOS datos** (`sales:vista`): **Registros** (la tabla)
  y **Resumen semanal** (semanas lunes→domingo, mejor día en oro, día sin ventas
  con borde punteado y un tercer estado para los días fuera del rango — que no
  son "sin ventas"). ⚠️ **No existe el dato de "días que no se trabajó"** (en el
  Excel se pintaba a mano), así que el promedio se calcula **por día con venta**
  y la pantalla lo dice: dividir entre 30 días cuando se trabajaron 20 da un
  número que no significa nada.
- Filtros `Select` de Cliente, Canal y Campaña (`sales:cliente|canal|campana`),
  con valor seguro. ⚠️ **Solo se dibujan cuando hay algo que elegir**: hoy las
  122 ventas tienen `clientId`/`originChannel`/`campaignId` en null, así que no
  se ven hasta que se carguen ventas con esos datos.
- ⚠️ **`formatStoredDay` de `lib/today.ts` da `30/9/2026`, no `30/09/2026`**
  (`es-VE` sin `2-digit`). Ventas usa `formatoDiaVenta` de
  `features/finance/sales-view.ts`, con la MISMA regla UTC y dos dígitos.
  Unificarlos cambiaría la fecha en todas las pantallas que ya usan el otro.
- ⚠️ **`SaleRow` (en `features/finance/api.ts`) miente por omisión**: no declara
  `originChannel` ni `campaignId` aunque la API los manda siempre. Está
  extendido en `sales-view.ts` (`SaleRowFull`); conviene moverlo al tipo base.

#### La CADENA de caja (2026-10-10, shared 0.35.0)

Reemplaza las dos tarjetas que se contradecían. Con el filtro en "Este mes" el
Dashboard mostraba juntas **"Resultado de caja −61.20"** y **"Saldo en caja
102.83"**; el dueño leyó la primera como un saldo y se creyó en rojo teniendo
$102.83. Y ese −61.20 **no era plata**: ignoraba los $50 que puso de su
bolsillo, los $29.19 que se le devolvieron y contaba el Cyan por los $25 que
cuesta en vez de los $15 que salieron. Octubre, en caja, fue **−30.39**: venía
con 133.22 y le quedaban 102.83.

- **La cadena** (`CadenaDeCaja`, arriba de las tarjetas de Caja): "venías con $X
  · este mes $Y · te queda $Z", con **UNA sola definición, la de Caja**.
  - ⚠️ **Los tres cierran: `Z = X + Y`**, porque el del medio lo **DERIVA**
    `cashChain(antes, ahora)` de shared (saldo al final − saldo al principio).
    **No calcularlo por otro camino**: dos caminos distintos es exactamente cómo
    nació este bug, y no cierran el día que uno cambia.
  - ⚠️ **QUÉ DOS SALDOS PEDIR lo decide `cashChainCuts(from, to, todayKey())`**
    de shared (0.37.0, 2026-10-10), no el JSX. Los dos extremos son el MISMO
    `businessCash` con otra fecha de corte, así que se piden los dos con
    `useCashBalanceAt(...)` → `GET /cash/balance?at=`. Acá no hay con qué
    reconstruirlos (el saldo de Caja es de toda la historia y las listas traen
    solo el rango).
  - ⚠️ **Z era el saldo de HOY, siempre, y con un rango pasado la cadena
    mentía** (arreglado el 2026-10-10): elegías septiembre y el tramo del medio
    **se comía octubre entero**. La razón que se había dado para no arreglarlo
    —"Z tiene que dar el mismo número que la tarjeta Saldo en caja"— no se
    sostenía: pedir el saldo al final del rango no es otra definición de saldo.
    - Rango **ABIERTO** (termina hoy o después): `end: null` → el saldo de hoy,
      **no el de su `to`** (el 31 de octubre todavía no llegó). La pantalla
      normal no cambia de aspecto, no paga una consulta de más y su extremo
      derecho es al centavo el de la tarjeta de al lado.
    - Rango **CERRADO** (`to < hoy`): corta en su `to` y `closed: true`.
      ⚠️ **La palabra acompaña al número**: dice **"cerró con"**, agrega el día
      (`al 30/9/2026`) y **"hoy en caja $X"**. "Te queda" sobre el saldo del 30
      de septiembre afirma que esa plata está ahora en la cuenta.
    - La tarjeta **"Saldo en caja" no se toca**: sigue siendo el saldo de hoy.
      Son dos números distintos a propósito y cada uno dice cuál es.
    - ⚠️ **Mientras el saldo al cierre viaja, la cadena NO se dibuja** con el de
      hoy de relleno: ese relleno ES la mentira que se cerró, y además
      parpadearía de un número al otro.
  - ⚠️ Las fechas de corte van en **UTC** (`previousDay`, dentro de
    `cashChainCuts`) y el "hoy" en **LOCAL** (`todayKey()`): son las dos clases
    de fecha del proyecto, y cambiar una por la otra corre la cadena un día.
  - ⚠️ **Con el filtro en "Todo" —o un rango sin inicio— la cadena NO se
    dibuja**: no hay un "antes", los cortes vienen en null y
    `cashChain(null, …)` devuelve `null`. Se muestra solo el saldo.
  - ⚠️ **`useCashMutation` invalida también `['cash','balance']`**, por lo mismo
    que invalida `breakdown`: el resumen se pisa con `setQueryData`, así que
    nada refresca esa clave sola y la cadena quedaría con el "venías con" viejo.
- **«Resultado de caja» → «Resultado de la operación»**, y su pie dice qué
  **NO** incluye (aportes, devoluciones, cuotas del préstamo). La cuenta no
  cambió: sigue respondiendo "¿el taller se paga solo?". Lo que cambió es que ya
  no se hace pasar por caja.
- ⚠️ **El color de ALARMA es del SALDO, no del mes.** `Stat` ganó
  `accent="danger"` y lo usa el saldo cuando es negativo. Un mes en contra con
  plata en la cuenta no es una emergencia, y pintarlo igual que un saldo vacío
  enseña a ignorar el color.
- Toda la lógica de la cadena vive en funciones puras de shared (`cashChain`,
  `cashChainCuts`, `previousDay`, `isCalendarDay`) y en la API, que sí se
  testean; acá solo quedó el armado del JSX y la elección de la palabra a partir
  de `closed`. (Se mudó a shared porque `apps/web` no tenía runner; desde el
  2026-10-10 lo tiene, pero esas funciones son del motor y se quedan ahí.)

#### Cambios del 2026-10-02 (hay que conocerlos antes de tocar el Dashboard)

- ⚠️ **"Utilidad" se llamó «Resultado de caja»** (hoy «Resultado de la
  operación», ver arriba) y "Vendiste $X" pasó a
  "Ingresos cobrados". **Ningún número cambió**: la cuenta incluye abonos de
  encargos todavía no entregados, cuyo costo se registra después, así que es un
  resultado de CAJA y no una ganancia contable. Se evaluó pasar la app a
  devengado y se descartó (toca Dashboard, Encargos, Caja, Por cobrar,
  equilibrio, Metas, Reposición y el Excel, para corregir una distorsión chica
  con los montos actuales). Si algún día se hace, ese es el alcance real.
- ⚠️ **El punto de equilibrio mira SIEMPRE el mes en curso**, con sus propias
  consultas (`rangoDelMes`), no el filtro de arriba. Los tres niveles son
  mensuales y con "Todo" seleccionado la tarjeta decía que lo habías cumplido al
  400 %. Es la misma regla que ya seguía Metas.
- ⚠️ **Las 25 ventas `kind: 'ENCARGO'` NO entran en los gráficos por DÍA ni en el
  ticket promedio.** Son totales SEMANALES importados del Excel y están **todas
  fechadas el lunes** (la hoja no registraba el día): el lunes parecía el mejor
  día del negocio por $1.323 que son 25 semanas enteras, y el ticket promedio
  dividía entre 25 "ventas" de ~$53. Sí cuentan en los totales de plata y en el
  bloque **mensual**, donde una semana cae dentro de un mes. El gráfico lo dice
  al pie (`ChartCard` acepta `footnote`): un dato excluido en silencio es peor
  que uno mal dibujado.
- **Gráficos por CANAL**: "Ingresos por día" e "Ingresos por día de la semana"
  son barras **apiladas** (Mostrador oro / Encargos azul) y hay **UN solo
  selector de canal** para toda la sección (`dashboard:canal`) — con un control
  por gráfico se puede terminar comparando dos tarjetas filtradas distinto.
- **"Gasto por tipo de recurso" excluye la inversión**, igual que el KPI: con
  ella, la misma pantalla usaba dos definiciones de "gasto" y una impresora de
  $600 dominaba el gráfico mientras el KPI afirmaba que no era gasto.
- ⚠️ **La dona "Mostrador vs encargo" se colorea por la CLAVE (`kind`), no por
  la etiqueta.** Comparaba `entry.name === 'Encargo'` y la etiqueta pasó a ser
  "Encargo anterior" el 2026-09-14: la condición dejó de dar verdadera y los dos
  segmentos salían del mismo color, sin fallar ni avisar. El texto cambia cuando
  cambia el negocio; la clave no.
- ⚠️ **La dona la reparte `repartoPorCanal` de shared** (2026-10-10, shared
  0.36.0), no un `Map` sobre `Sale.kind`. **Encargos = ventas `ENCARGO` + los
  ABONOS del periodo; mostrador = ventas `COUNTER`**, así que su total es
  exactamente los KPIs "Ventas" + "Cobrado de encargos" de la misma pantalla.
  - Armada solo con `Sale.kind` era **ciega a los encargos**: las 25 ventas
    `ENCARGO` son el histórico semanal del Excel y se cortan el 2026-08-24;
    desde que la app manda, un encargo cobra **abonos**, no ventas. Con el
    filtro en octubre decía **100 % mostrador** ($26.75) mientras entraban
    $114.05 en 4 abonos: faltaba el **81 %** justo en el gráfico cuyo único
    trabajo es comparar los dos canales, y afirmaba lo contrario de la verdad.
    `byDay`, `byWeekday` y el KPI ya usaban `paymentRows`; la dona quedó afuera.
  - ⚠️ **Los abonos NO se convierten en `Sale` ni se suman dos veces**: entran
    una sola vez, del lado de encargos. El doble conteo es lo que la app evita a
    propósito desde shared 0.16.0.
  - ⚠️ **Sus etiquetas NO son `SALE_KIND_LABELS`** (`CANAL_LABELS`, local): ahí
    `ENCARGO` es "Encargo anterior", correcto en la tabla de Ventas y **falso**
    en la dona, donde el tramo ya incluye los abonos de hoy.
  - ⚠️ **La dona NO sigue al selector de canal, y lo dice en su pie.** Filtrada
    a un canal, una dona de dos tramos solo puede decir "100 %" — justo la
    mentira que se acaba de arreglar. El selector sí filtra bien los otros dos
    gráficos: sus series `encargos` salen de `paymentRows`, así que "Solo
    encargos" muestra los abonos (no hacía falta tocarlo).
  - ⚠️ **Sus dos colores son los MISMOS que los de los otros tres gráficos por
    canal** (mostrador oro / encargos azul). Venían al revés: en la misma
    pantalla el oro significaba mostrador en las barras y encargos en la dona.
  - El reparto vive en shared (`channels.ts`, 8 tests con números a mano,
    incluido "un mes solo con abonos no puede dar 100 % mostrador") y acá quedó
    solo el JSX.
- **`AnnualIncome` — "Ingresos por mes"** (la tabla del Excel del dueño): bloque
  al final con **su propio selector de año** (derivado de los datos) y, como
  Metas/equilibrio/Reposición, **no responde al filtro de arriba**. Tabla con los
  12 meses (los que no llegaron, marcados) ordenable por mes o por monto, y
  barras apiladas por canal + línea del total. ⚠️ **La línea se corta en el mes
  actual**: dibujar noviembre y diciembre en $0 la desploma y se lee como un
  derrumbe, cuando esos meses todavía no pasaron.
- ⚠️ **`CampaignAlert` avisa SOLO de campañas vigentes** (`isCampaignVigente`).
  Avisaba de campañas terminadas el 23/09 pidiendo "revisalas antes de seguir
  invirtiendo": pedir una acción imposible enseña a ignorar el aviso. El estado
  que se MUESTRA en la lista y el detalle también es el derivado
  (`campaignDisplayStatus`), porque nada mueve el `status` guardado a FINISHED
  cuando pasa la fecha de fin.

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
- Los dos PDF viven en pantallas distintas y no hay que confundirlos:
  **"Cotización"** en el detalle del PEDIDO es lo que SE LE MANDA AL CLIENTE, y
  **"Desglose interno"** en la ficha del catálogo trae costos, márgenes y
  mayoreo — es de uso propio.
- **Logo del negocio** (`features/settings/BusinessLogo.tsx`, en Configuración →
  Negocio): PNG/JPEG hasta 1 MB, se sube como data URL a `PUT /settings/logo`. La
  vista previa se pide como **blob** (`GET /settings/logo` exige sesión, así que un
  `<img src>` directo a la API no sirve) y su object URL se revoca al desmontar.
  `GET /settings` solo trae `hasLogo`, nunca los bytes.
- **Nombre del negocio**: campo `businessName` del mismo formulario; el backend lo
  escribe en la organización. Encabeza y firma ambos documentos.

### Tienda (catálogo público, panel)
- **`pages/Store.tsx` + `pages/StoreProductDetail.tsx`, `features/store/api.ts`.**
  Es el catálogo ÚNICO desde 2026-09-07: la ficha guarda lo que ve el cliente
  (fotos, descripción, opciones, visibilidad, enlace) **y** su costeo. La
  pantalla "Productos" y su modelo se eliminaron; la calculadora guarda acá.
- **Dos formas de cargar**: desde la **calculadora** ("Guardar producto", que
  manda el `CalcInput` y el backend calcula el costo) o a mano ("Nuevo
  producto", sin costeo — para un servicio o algo que no se imprime). Nace
  siempre **oculta**: registrar no es publicar.
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
- **Registro dinámico de gastos** (`features/finance/ExpenseModal.tsx`, usado por
  `pages/Expenses.tsx`): un modal elige el **tipo** y, si mapea
  a catálogo, deja **reusar** un item existente o **crearlo inline** (reusa
  `features/catalogs/config.ts`) → crea catálogo + gasto enlazado en una acción. Check
  "usar como precio de referencia" → `PATCH` PARCIAL al item (**no en Filamento**: el
  precio del rollo sale de monto ÷ rollos, lo fija el servidor, y el formulario de
  ficha nueva no pide precio; en su lugar se ve "El precio del rollo para cotizar
  queda en $X"). El tipo **Publicidad** con
  "pagué en bolívares" elige una tasa VES + monto Bs y guarda `amount` en USD base
  (= Bs ÷ tasa) + `rate`/`currencyCode='VES'` para presentación.
  - **Cada compra se registra EN SU ÁREA** (2026-10-09): el filamento en
    `/filament/compras`, la impresora y el insumo en su catálogo. Antes había
    que salir a Gastos y volver a decir de qué era — un dato que la pantalla de
    la que venías ya sabía. El modal vive en `features/finance/ExpenseModal.tsx`
    justamente para poder abrirse desde las tres; con `tipoFijo` el selector de
    tipo **no se dibuja** y el título dice "Registrar compra de X".
  - ⚠️ **`zona` en `EXPENSE_TYPES` y el desplegable de Gastos son un PAR.** El
    tipo que tiene `zona` NO se ofrece en Gastos (`TIPOS_SIN_ZONA`), porque
    habría dos caminos para lo mismo. Si agregás un botón en una pantalla
    nueva, marcá su tipo con `zona`; si sacás el botón, sacá la marca, o **el
    tipo se queda sin ninguna puerta**. Hoy Gastos ofrece solo Mantenimiento,
    General, Diseño y Publicidad.
  - En los catálogos con `costDefinition` (impresoras, insumos) **no hay botón
    "Agregar"**: la ficha nace al registrar la compra. Ese botón es ahora
    "Registrar compra" y abre el mismo modal, en vez de mandarte a Gastos.
- **Compras** (`pages/Purchases.tsx`, `features/purchases/api.ts`, en Finanzas,
  2026-10-09): facturas y encargos de **filamento e impresoras**. Lo que
  pediste, lo que abonaste y lo que falta llegar. Está al lado de "Por cobrar"
  a propósito: es su espejo — lo que VOS debés.
  - ⚠️ **Son DOS estados, no uno**, y la tarjeta muestra los dos: una factura
    puede estar *Pagada* y *Sin llegar*, que es lo normal cuando encargás algo.
    Un solo "estado" tendría que elegir cuál de las dos verdades contar.
  - ⚠️ **LO QUE NO LLEGÓ** (2026-10-10, shared 0.39.0): una factura con fecha
    esperada **pasada** y mercadería pendiente se destaca —borde ámbar,
    insignia *Atrasada*— y **dice hace cuánto**: *"No llegó: la esperabas hace
    12 días. Quedó para el 28/9 y faltan 2 unidades."* Antes `expectedAt` se
    guardaba y nadie lo miraba.
    - El atraso lo calcula **`facturasAtrasadas(facturas, todayKey())`** de
      shared, no la pantalla; el "hoy" se arma acá en día **LOCAL** y entra
      como parámetro (el motor es puro y no decide husos).
    - ⚠️ **Dice hace cuánto y cuánto falta, no solo que está atrasada**: con un
      "revisá esta factura" a secas hay que abrirla para saber si son dos días
      o tres semanas, y un aviso que obliga a investigar se deja para después.
    - ⚠️ La tercera tarjeta de resumen ("No llegaron cuando dijeron") **se
      pinta siempre, aunque diga 0**: un cero dicho es la respuesta a "¿se me
      atrasó algo?". Si solo apareciera con atrasos, no habría forma de
      distinguir "nada atrasado" de "esta pantalla no lo mira", que es justo el
      estado del que viene.
    - Con la factura atrasada, el subtítulo **deja de repetir** `· llega X`: es
      la misma fecha dos veces y en el tiempo verbal equivocado.
  - ⚠️ **Cargar la factura NO mueve la Caja; abonar SÍ.** El formulario lo dice
    en el pie. Y al recibir, el diálogo aclara que *la plata ya se contó al
    abonar*: si no, el dueño vería entrar mercadería y esperaría que el saldo
    bajara otra vez.
  - Una línea puede ser **algo que todavía no tenés**: la ficha se crea al
    recibirla, con el precio de la compra. ⚠️ **El formulario pregunta si es
    filamento o impresora** (`nuevoTipo`, shared 0.34.0) y la lista de líneas
    dice qué va a nacer. Hasta el 2026-10-10 no lo preguntaba y la recepción
    creaba **siempre** un filamento: encargar una impresora nueva —que por
    definición NO está en el catálogo, o sea el caso normal— dejaba un rollo
    llamado "Impresora A2". Los **gramos del rollo solo se piden si lo que nace
    es filamento**; para una impresora el diálogo avisa que las horas de vida y
    el consumo se corrigen desde Catálogos → Impresoras. El contrato Zod exige
    el tipo con `nombreNuevo` y lo prohíbe sin él, así que mandar la línea sin
    elegir es un 400.
  - **Recepción parcial**: pediste 10, llegaron 6, la línea queda esperando 4.
    El campo se recorta solo a lo que falta.
  - ⚠️ **EL PRECIO QUE TE COBRARON** (2026-10-10, shared 0.44.0). El diálogo de
    recibir pregunta **"¿a cuánto te lo cobraron?"**, con el precio pedido ya
    puesto, y **avisa cuando difiere**: *"Te cobraron más de lo que pediste:
    $0,50 más por unidad. Esta entrega suma $3,00 al total de la factura."* En la
    lista, la línea muestra *"· te cobraron 6 × $7,50"* al lado de lo pedido.
    - ⚠️ **No es adorno: cambia el TOTAL de la factura** (de $70 a $73 en el caso
      del spec). Un número de plata que se mueve sin que la pantalla diga por qué
      miente de la peor manera, la que nadie nota.
    - ⚠️ **Ese campo NO usa `NumberInput`**, que mapea el campo vacío a 0: con él,
      borrar el precio registraría la entrega **como si te la hubieran regalado**
      —y 0 es un precio válido de verdad, así que nada lo frenaría—. Es
      `number | null` con `<Input type="number">`, y **vacío significa "no informo
      nada"**: no viaja en el cuerpo y el servidor usa el de la línea. Misma
      trampa que en el precio de las líneas propuestas.
    - **La línea sigue pidiendo a lo pactado** y el diálogo lo dice: lo que falta
      llegar se cuenta a ese precio. El monto de la compra que se previsualiza usa
      el precio informado.
    - ⚠️ **Acá no se calcula el total**: lo deriva el servidor
      (`invoiceTotals` con las `recepciones` de cada línea). La pantalla solo
      decide **qué decir**, con dos funciones puras en
      `features/purchases/precio-real.ts` —`avisoDePrecio` (antes de guardar) y
      `preciosRealesDeLaLinea` (después)— y sus **14 tests de vitest**.
      `preciosRealesDeLaLinea` **calla las entregas que llegaron a lo pactado**:
      repetir el mismo número al lado del pedido es ruido que entrena a no leer.
    - ⚠️ Las dos comparan **redondeando a 4 decimales**, la precisión del motor:
      un precio que vuelve de la base como 7,4999999 es el mismo $7,50 y el
      cartel aparecería siempre.
    - **No hay clave de caché nueva**: `useReceiveLine` ya pasa por
      `useInvoiceMutation`.
  - Abonar de más **no se bloquea** —esa plata salió— pero se avisa antes de
    guardar y la factura queda marcada como *Pagada de más*.
  - ⚠️ **USAR EL SALDO A FAVOR DEL PROVEEDOR** (2026-10-10, shared 0.45.0).
    Pagaste $100 de una factura de $85: esos $15 son plata tuya que el proveedor
    te debe. Hasta acá la pantalla los **mostraba y no se podían usar**.
    - **Dónde se ve cuánto hay:** en la tarjeta de cada factura de ese
      proveedor, en caja gris — *"StratoFill te debe $15,00 de facturas que
      pagaste de más"* — con la instrucción de qué hacer, distinta según si esa
      factura tiene saldo pendiente o no. Y en la línea de totales, cuando ya se
      usó parte: *"Pagaste $15,00 de más · quedan $9,00 sin usar"*.
    - **Cómo se usa:** en **Abonar**, el campo *"¿Con qué lo pagás?"* ofrece
      *"Con plata"* o *"Del saldo a favor de la factura del 05/10 ($15,00)"*.
      Solo aparece si el proveedor tiene saldo: un desplegable con una sola
      opción es ruido.
    - ⚠️ **Lo que el modal tiene que decir no es "se usa el saldo": es que la
      CAJA NO SE MUEVE.** Un abono que baja la deuda sin bajar el saldo se lee
      como un error si nadie explica por qué.
    - ⚠️ Con el saldo elegido, el campo **"¿Quién lo pagó?" desaparece**: nadie
      puso plata. Mostrarlo invitaría a mandar un dato que el servidor rechaza
      —y con razón: la Caja le quedaría debiendo a quien no puso nada—.
    - Al elegir el origen, el **monto se recorta** a lo que de verdad hay
      (`min(lo que falta, lo disponible)`): el default es lo que falta de esa
      factura, que puede ser más, y dejarlo en rojo esperando que el dueño lo
      corrija es ofrecerle un error. Igual se avisa y el botón se apaga si lo
      sube a mano.
    - **La factura que se está abonando no aparece como origen**: una factura no
      se paga con su propio saldo a favor. El servidor lo rechaza igual;
      sacarla de la lista evita ofrecer un error.
    - ⚠️ **EL SALDO QUE SALTA DE UNA FACTURA A LA OTRA** (2026-10-10, decisión
      del dueño). Tomás $15 de saldo y los aplicás a una factura donde debés $5:
      paga los $5 y **los otros $10 quedan a favor en la factura nueva**. Se
      puede —la plata ni se pierde ni se inventa— **pero no sin decirlo**: antes
      de confirmar, el diálogo dice cuánto va a quedar a favor en esta factura.
      - ⚠️ **NO es una guarda que corte**: el botón sigue habilitado y el aviso
        usa el mismo estilo que el de "pagado de más", que también es legítimo y
        también deja guardar. El único que apaga el botón sigue siendo el de
        tomar más de lo DISPONIBLE, que el servidor rechaza igual — y **gana**
        sobre este, porque hablar de lo que va a quedar a favor cuando el monto
        no existe es hablar de una plata que no hay.
      - Texto: *"Estás tomando $15,00 y a esta factura le faltan $5,00: los
        $10,00 de diferencia quedan a favor en ESTA factura. Se registra igual
        —no se pierde nada, el saldo pasa de una factura a la otra— pero vas a
        tener que volver a usarlo desde acá. Bajá el monto si no era eso lo que
        querías."*
      - ⚠️ **Una factura YA PAGA tiene su propia frase** (*"Esta factura ya está
        paga, así que los $15,00 que tomes quedan enteros a favor en ELLA"*).
        Es el único camino donde el aviso sale **sin que nadie suba el monto**:
        no hay "lo que falta" para proponer, así que el formulario propone lo
        disponible y el saldo salta entero. Con la frase general diría "le
        faltan $0,00", que se lee como un error de la pantalla.
      - ⚠️ **Por qué pasaba en silencio**: los tres avisos del monto eran tres
        condiciones INDEPENDIENTES en el JSX y esta combinación no caía en
        ninguna. Ahora la decisión es **UNA función pura**,
        `avisoDeAbono` (`features/purchases/aviso-de-abono.ts`, **11 tests**), y
        el JSX solo dibuja lo que devuelve. Compara **al centavo**, la precisión
        del motor: sin eso, un residuo de coma flotante (2,9 − 2,7 =
        0,2000000000000002) mostraba el cartel en un abono exacto.
      - ⚠️ Y va con su **test de pantalla** (`pages/Purchases.abonar.spec.tsx`,
        6 tests): una función pura sin test de cableado prueba la mitad —ya pasó
        con `pasaTipo` en Gastos—. Prueban que el diálogo la llame con los tres
        números correctos, que el default sea silencioso y que el botón **no**
        se apague.
      - Los dos controles del diálogo llevan `aria-label`: la etiqueta de
        `Field` no está asociada al control (no tiene `htmlFor`), así que sin eso
        no tienen nombre accesible — ni para un lector de pantalla ni para un
        test.
    - En la lista de abonos, el que salió del saldo lleva la insignia **"Del
      saldo a favor"** en vez de "La caja": decir "la caja" ahí contaría la
      misma plata dos veces en el renglón que se lee para saber de dónde salió.
    - ⚠️ **No hay endpoint nuevo ni clave de caché nueva.** Cada factura ya
      viaja con su `aFavorDisponible`, y el rollup por proveedor lo hace la
      MISMA función pura que usa el servidor (`saldoAFavorPorProveedor`), en un
      `useMemo` sobre las facturas ya cargadas. Una consulta aparte sería una
      segunda cuenta para el mismo número, y el día que una cambie la tarjeta y
      el modal dirían distinto.
  - **Una compra de filamento se CORRIGE desde su lista** (2026-10-09,
    `features/filament/EditarCompra.tsx`): el lápiz en la tabla, la tarjeta
    entera en el teléfono. Se puede cambiar todo, incluso a qué ficha se le
    cargó, y borrarla. ⚠️ **El precio del rollo lo recalcula el SERVIDOR** a
    partir de la última compra; la pantalla solo muestra en cuánto queda ESTA.
    Si lo decidiera el formulario, corregir una compra vieja pisaría el precio
    con uno viejo.
    - ⚠️ **La que nació de una FACTURA no se corrige ni se borra**
      (2026-10-10, shared 0.33.0): la API la rechaza con un 400 porque su monto
      es el espejo de la línea recibida. La fila lo dice (`fromInvoice` → marca
      "de factura" con tooltip "se corrige en Compras"), la tabla no muestra el
      lápiz y la tarjeta del teléfono va `disabled`. Lo mismo en **Gastos**
      (`pages/Expenses.tsx`, por `purchaseInvoiceLineId` de `ExpenseRow`): sin
      tacho y con el `Select` de "quién pagó" apagado — **ese select manda un
      PATCH en cada cambio**, así que vivo solo sabría tirar 400. `EditarCompra`
      conserva una red: si igual se lo abre, explica y no deja guardar.
      ⚠️ **Y la salida está en Compras**: ese tooltip no manda a una puerta
      cerrada desde que existe "Deshacer recepción" (ver abajo).
  - ⚠️ **"Deshacer recepción"** (2026-10-10, por línea con algo recibido): la
    salida del callejón que dejó la guarda de arriba. Hasta acá una línea
    recibida por error no se podía corregir por **ninguna** puerta y los
    mensajes se mandaban unos a otros en círculo.
    - La confirmación dice **qué pasa y qué NO**: lo último que entró sale del
      inventario y su compra se borra, pero la **plata no se mueve** (lo que
      salió fueron los abonos) y la **ficha del catálogo se queda**, porque
      puede estar usada en una cotización o un encargo. Las dos cosas que no
      pasan son justo las que uno teme al apretar, y un "¿estás seguro?" pelado
      no deja decidir.
    - ⚠️ **`useUnreceiveLine` comparte `useInvoiceMutation` con
      `useReceiveLine`**: invalida las MISMAS claves (caja, gastos, materiales,
      stock, compras de filamento, facturas). Si limpiara menos, la pantalla
      quedaría mostrando el rollo en el inventario y el gasto en la lista
      después de borrarlos.
    - Va **sin cuerpo**: no hay nada que elegir, se revierte exactamente la
      recepción que se hizo. Un `quantity` del cliente podría no coincidir con
      ninguna recepción real.
  - **Proveedores: una sola puerta, la del directorio** (2026-10-09). Había una
    página `/catalogs/providers` con su propia tabla de dos campos, y además el
    tipo "Proveedor" de Contactos, que guarda teléfono, RIF, ciudad y mapa. Se
    fue la página: la ruta **redirige a `/contacts`** (podía estar en
    favoritos) y el campo "Proveedor (opcional)" del gasto lista los contactos
    con `type === 'SUPPLIER'`. Mezclar los clientes haría crecer ese
    desplegable sin control.
  - La opción **"Otro (escribirlo)…"** abre un campo de texto y manda
    `providerName`: el servidor crea el contacto al guardar. Es el mismo
    principio que el alta inline de la ficha de filamento — no cortarte el
    formulario para mandarte a otra pantalla. **Se manda el id O el nombre,
    nunca los dos**: el servidor prioriza el id y el nombre escrito se
    perdería sin avisar.
  - **"¿Quién lo pagó?" son CONTRAPARTES, no un enum** (2026-10-08, shared
    0.26.0): la columna de la tabla y el campo del formulario listan las
    contrapartes reales (`useCounterparties()`), con `''` = la caja. Ya no hay
    una opción "El préstamo" suelta: si lo puso un prestamista, se elige al
    prestamista. El filtro dejó de ser "Pagados por X" y pasó a **"Los puso una
    persona"**, porque ahora incluye al prestamista y no solo al dueño.
  - Entre el 08 y el 10 de octubre hubo un puente, `contraparteDe()`, que
    deducía quién pagó cuando `counterparty` venía nulo: sin él, los gastos que
    el dueño había puesto de su bolsillo aparecían como "la caja del negocio",
    **exactamente al revés** de lo que decían. **Ya no está**: con el enum
    borrado, `counterparty` nulo significa la caja y punto.
  - ⚠️ **El `Select` de `components/ui.tsx` no pasaba `aria-label` al trigger de
    Radix.** Siete llamadas lo mandaban y se perdía en silencio —no estaba
    declarado en las props, así que el objeto desestructurado lo descartaba— y
    el lector de pantalla leía solo el valor. Arreglado el 2026-10-08; se ve con
    `document.querySelectorAll('[aria-label]')` en una pantalla con desplegables.
  - **El `Select` trae BUSCADOR solo si la lista es larga** (2026-10-09,
    `MINIMO_PARA_BUSCAR = 8`). Debajo de eso un campo de texto arriba de cuatro
    opciones estorba; arriba, encontrar un filamento entre 53 a fuerza de
    scroll es el problema real. No hay que pedirlo en cada llamada: sale solo.
    Busca **sin acentos y sin mayúsculas** (`senora nandu` encuentra `Señora
    Ñandú`) y aplana el `label`, que es un `ReactNode`: sin aplanarlo, una
    opción con formato no coincidiría NUNCA y el buscador la escondería.
  - ⚠️ **Tres cosas que Radix hace y hay que contrarrestar**, todas verificadas
    en pantalla:
    1. **Se lleva el foco** a la opción marcada DESPUÉS de montar el contenido,
       así que `autoFocus` no alcanza: el input se enfoca en el tick siguiente.
    2. **`Select.Value` sin hijos lee la etiqueta del `Select.Item` montado.**
       Al filtrar, el elegido deja de estarlo y **el select se quedaba en
       blanco mientras escribías**. Por eso la etiqueta se le pasa a mano.
    3. Su **"escribí para saltar"** se come las teclas: el contenedor del input
       frena la propagación de todo salvo flechas, Enter, Escape y Tab — esas
       tienen que llegar a la lista para poder navegarla sin soltar el teclado.
  - ⚠️ **La lista se salía de la pantalla en el teléfono**: tenía `min-w` del
    trigger pero ningún `max-w`, así que crecía con la opción más larga (medido:
    431 px de lista en 375 de ancho). Ahora se acota al ancho disponible que
    calcula Radix, con `collisionPadding`.
- **La ficha de un filamento vive en Stock del mes** (2026-09-14, shared 0.15.0;
  antes era la página Materiales, que se quitó por decisión del dueño). Tocar la
  marca de una fila abre `FichaDialog` (`features/filament/FichaDialog.tsx`):
  **corregir nombre, color, marca y tipo** (`PATCH /materials/:id`; `<form>` con
  Enter=Guardar y `autoFocus`). ⚠️ Marca y tipo entraron el 2026-10-09
  revirtiendo la decisión del 2026-09-14: sin ellos, un rollo cargado como "PLA
  mate" que era otra cosa no tenía arreglo. **Gramos y precio siguen fuera**:
  los gramos reescriben el costo por gramo de todas sus compras pasadas.
  Corregir marca o tipo **reagrupa el análisis**, que sale de
  `filament-purchases` y ya está en la lista que se invalida. También:
  **Descontinuar / Reactivar** con confirmación (`PATCH /materials/:id/status`) y
  **Borrar** solo si `canDelete` (sin compras ni conteos; si no, la API da 409).
  Cada acción invalida `materials`, `filament-stock`, `filament-summary` y
  `filament-purchases`; cerrar o reabrir un mes también invalida `materials`. La
  **calculadora no ofrece** descontinuadas y pone **al final** las que cerraron el
  último mes en 0 sin compra posterior, con "— 0 al cierre de agosto"
  (`outAtLastClose`, `quotableMaterials`/`materialLabel` en
  `features/calculator/materialOptions.ts`; lo ya cotizado no cambia: se copian
  precio y gramos). En **Gastos** las descontinuadas siguen visibles con
  "(descontinuado)" y **registrar una compra con rollos la reactiva** (lo hace el
  servidor). `features/catalogs/config.ts` conserva `materials` SOLO para el alta de
  ficha en Gastos (sin `rollPrice`, `columns: []`). Spec:
  `calc3d-api/docs/superpowers/specs/2026-09-14-quitar-pagina-materiales-design.md`.

### Cotizar a un cliente (ya NO hay Presupuestos)

La pantalla de Presupuestos se eliminó el 2026-09-07: **cotizar es el primer
estado de un pedido**. Se crea el pedido en estado "Cotizado" y desde su detalle
se baja el botón **"Cotización"** (`GET /orders/:id/cotizacion.pdf`) — el
documento con logo, precios y SIN costos que se le manda al cliente.

El **desglose interno** (costos, márgenes, mayoreo) vive ahora en la ficha del
catálogo, y solo aparece si tiene costeo: ⚠️ **ese PDF no se le manda al
cliente**, publica la ganancia del negocio.
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
  con `refreshPromise`) y reintenta; `AuthContext` hace logout server-side. **No hay
  registro público** (`AuthContext` solo expone `login`).
- **Dónde viven los tokens lo decide «Recuérdame»** (2026-10-02,
  `lib/auth-storage.ts`): marcado (default) → `localStorage`, la sesión sobrevive
  a cerrar el navegador; desmarcado → `sessionStorage`, muere al cerrarlo.
  ⚠️ **`getToken`/`getRefreshToken` consultan LOS DOS almacenes y `clearTokens`
  limpia LOS DOS siempre**; al guardar, el almacén que NO corresponde se borra.
  Si solo se mirara el que dice la preferencia, desmarcar dejaría el token viejo
  en `localStorage` y la sesión no moriría: la casilla parecería andar y no
  andaría. La preferencia (`calc3d_recordarme`) y el último correo con login
  exitoso (`calc3d_ultimo_correo`, **nunca la contraseña**) van siempre en
  `localStorage`. Todo acceso va envuelto en `try/catch`: en modo privado lanza.
  `clearToken` pasó a llamarse **`clearTokens`**.
- **Fallos de red** (`lib/network-errors.ts`, puro): el cartel distingue sin
  conexión (`navigator.onLine`), corte por tiempo (`ECONNABORTED`/`ERR_CANCELED`)
  y "el servidor no responde", y solo en `import.meta.env.DEV` menciona levantar
  el backend — ese texto se le mostraba al usuario final en Pages, donde no puede
  correr nada. Antes de mostrarlo se **reintenta 2 veces (1 s y 3 s)**, y ⚠️ **solo
  los GET**: reintentar un POST/PATCH/PUT/DELETE que se cortó sin respuesta puede
  duplicar un cobro o un alta. Tampoco se reintenta si hubo respuesta (un 400 o un
  500 no mejora repitiendo).
- Páginas de auth: `Login` / `ForgotPassword` / `ResetPassword`, sobre
  `components/AuthShell.tsx` (split panel de marca + form glass). El `Login` tiene
  ojo para ver la contraseña (`type="button"` — si no, Enter lo dispararía en vez
  de enviar el formulario —, `aria-label` que alterna + `aria-pressed`, y el cursor
  se conserva al alternar).

## Comandos (desde la raíz de este repo)
- `pnpm install`
- `pnpm sync:shared` — trae `packages/shared/src` desde calc3d-api (fuente de verdad).
  **Solo copia `src`**: recompilá `shared` después (el `postinstall`/build regenera
  `dist/esm`, que es lo que importa Vite) y verificá con `pnpm test:shared`.
- `pnpm test:shared` — tests del motor (tras sincronizar).
- `pnpm dev` — levanta el panel en **5180** (fijado en `vite.config.ts` con
  `strictPort`). Un solo puerto para la web: el 5173 se retiró el 2026-09-09.
- `pnpm -r build` / `pnpm -r lint` / `pnpm -r test`
- `pnpm --filter @calc3d/web test` — **los tests de `apps/web`** (vitest).

## Tests de `apps/web` (vitest, desde el 2026-10-10)

Hasta ese día este paquete **no tenía runner**: `vitest` figuraba en
`devDependencies`, instalado y sin configurar, y por eso toda la lógica que
hiciera falta probar se mudaba a `packages/shared` aunque no tuviera nada que
ver con el motor de cálculo. Lo pagamos en cada pantalla (la cadena de caja, el
reparto por canal, los totales de Gastos).

- Script `test` = `vitest run`; configuración en **`apps/web/vitest.config.ts`**,
  aparte de `vite.config.ts` a propósito (ese lleva el proxy del dev server, que
  no hace falta para los tests). Lo único compartido es el alias `@`: tiene que
  decir lo mismo en los dos archivos. El plugin de React tampoco se usa:
  `tsconfig.json` declara `jsx: "react-jsx"` y el esbuild de Vite ya transforma
  el JSX con eso.
- Los specs van **junto a su fuente**, como en shared.
  `describe`/`it`/`expect` se **importan de `vitest`** (sin globals, así no hay
  que declarar tipos en `tsconfig.json`). Ojo: `include: ["src"]` del tsconfig
  significa que `tsc --noEmit` del build **también revisa los specs**.
- `pnpm -r test` desde la raíz corre los dos paquetes: jest en `packages/shared`
  y vitest en `apps/web`.
- **DOS entornos, elegidos por la EXTENSIÓN del archivo** (`test.projects`,
  desde el 2026-10-10):

  | Archivo | Proyecto | Entorno | Para qué |
  |---|---|---|---|
  | `*.spec.ts` | `node` | `node` | funciones puras (derivaciones, filtros, totales) |
  | `*.spec.tsx` | `dom` | `jsdom` | componentes renderizados (testing-library) |

  Correr uno solo: `pnpm --filter @calc3d/web test -- --project dom`. El patrón
  es la extensión y **no una lista de rutas** porque una lista hay que acordarse
  de actualizarla: un spec de componente nuevo que no estuviera en ella correría
  en `node`, fallaría con "document is not defined", y la tentación sería mandar
  TODO a jsdom. Al revés también importa: un spec puro en jsdom levanta un DOM
  entero por archivo para no usarlo, y los puros son los que conviene que sigan
  siendo instantáneos.
- **Dependencias de los tests de componente** (aprobadas por el dueño el
  2026-10-10): `jsdom`, `@testing-library/react` y `@testing-library/jest-dom`,
  devDependencies de `apps/web`. El setup (`src/test/setup-dom.ts`, solo lo
  carga el proyecto `dom`) monta los matchers de jest-dom, un `cleanup`
  explícito —con `globals` apagado el auto-cleanup de testing-library **no se
  registra**, y sin él cada `render` deja su árbol en el mismo `document` y un
  `getAllBy…` cuenta también las filas del test anterior— y dobles de
  `matchMedia` (lo consulta la capa de motion) y `ResizeObserver`, que jsdom no
  trae.
- ⚠️ **En jsdom NO hay CSS: las dos presentaciones se dibujan a la vez.** El
  patrón tabla↔tarjetas de este panel (`hidden md:block` + `md:hidden`) no
  esconde nada en un test, así que **cada control aparece DOS veces**. Lejos de
  ser un estorbo es la mitad del valor: el riesgo real de ese patrón es arreglar
  una presentación y olvidarse de la otra, así que los conteos van **exactos**
  (`toHaveLength(2)`), nunca `toBeTruthy()`.
- **Qué mockear en un test de pantalla: `@/lib/api` y nada más.** Con los hooks
  mockeados el test pasa aunque la derivación de cada fila mienta; mockeando el
  cliente axios, los hooks de React Query, los componentes y las derivaciones
  son los de verdad. La pantalla se envuelve en `QueryClientProvider` (con
  `retry: false`) y en `TooltipProvider`, igual que `AppLayout`. Dos trampas:
  `vi.mock` se evalúa **antes** del cuerpo del archivo (los dobles van en
  `vi.hoisted`), y React Query **rechaza `undefined`** como dato de una
  consulta, así que el doble devuelve `null` para lo que no interesa.
- ⚠️ **Un filtro persistido se siembra en `localStorage` antes de montar**, y se
  limpia en el `beforeEach`: sin limpiar, un tipo elegido en un test deja la
  lista vacía en el siguiente y los `queryAllBy…` dan 0 por el motivo
  equivocado.
- Qué hay hoy (**total: 101**, 7 archivos):
  `features/finance/expenses-view.spec.ts` (24) — `totalesGastos`, `tipoSeguro`,
  `filaDeGasto` y `pasaTipo` —, `pages/Expenses.pantalla.spec.tsx` (7, el primer
  test de componente) — la fila de factura sin tacho y con el pagador apagado, y
  que los filtros de tipo guardados se apliquen (Filamentos, General,
  Inversión) —, `features/calculator/materialOptions.spec.ts` (34) — el selector
  de filamento por tipo, la ventana de 6 meses y la ficha sin precio —,
  `features/calculator/Filamento.pantalla.spec.tsx` (5, jsdom) — el cableado de
  ese selector —, `features/purchases/precio-real.spec.ts` (14) — el aviso de
  que el proveedor te cobró otro precio —,
  `features/purchases/aviso-de-abono.spec.ts` (11) — qué avisar sobre el monto
  de un abono, los tres casos — y `pages/Purchases.abonar.spec.tsx` (6, jsdom) —
  el cableado de ese aviso en el diálogo "Abonar".
- ⚠️ **Un `Select` de Radix se abre en jsdom con `fireEvent.keyDown(trigger,
  { key: 'Enter' })` y se elige con `fireEvent.click` sobre el texto de la
  opción.** No hace falta `user-event` ni shims de pointer capture; lo que sí
  hace falta es el `ResizeObserver` que ya está en `setup-dom.ts`. Las opciones
  **no existen en el DOM hasta abrirlo** (van en un portal), así que un
  `getByText` de una opción sin abrir el desplegable falla siempre.
- ⚠️ **Nueve ramas testeadas no prueban que alguien las llame bien.** El test
  del filtro de tipo en la pantalla existe porque una mutación lo pidió: con
  `pasaTipo` probada rama por rama, cambiar la llamada de la pantalla a
  `pasaTipo(TODOS, e)` —o sea, dejar de filtrar— **no tumbaba ni un test**. Al
  extraer un closure a función pura, el cableado necesita su propio test.

## A qué API le habla el panel

`VITE_API_URL` decide contra qué backend corre el panel.

**En desarrollo va RELATIVO: `/api`** (en `apps/web/.env.local`, que no se
versiona). Con eso el navegador solo habla con el origen del panel y **Vite
reenvía al 3001 por dentro** (el `proxy` de `vite.config.ts`). Dos problemas
desaparecen de una:

- **No hay CORS**: es el mismo origen.
- **El navegador no necesita alcanzar un segundo puerto.** Los navegadores
  embebidos —el del chat de Claude, por ejemplo— cargan el 5180 pero pueden no
  llegar al 3001, y ahí el login falla con *"no se pudo conectar con el
  servidor"* **con el backend perfectamente levantado**.

En producción sí va la URL completa del backend. Ver "Producción en Cloudflare Pages" abajo. El **fallback** de `lib/api.ts`
(`http://localhost:3001/api`) queda de red de seguridad si no hay variable.

⚠️ **Siempre `localhost:5180`, nunca `127.0.0.1:5180`.** Vite escucha en `[::1]`
y el `WEB_ORIGIN` de la API es el origen `http://localhost:5180`; por IP la
página no carga y, si cargara, el login moriría en CORS.

⚠️ **Hasta el 2026-09-09 los tres decían `3000`** —el puerto viejo de la API— y
el `.env.example` también. Arrancar el panel sin `VITE_API_URL` daba *"no se
pudo conectar con el servidor"* en el login **con el backend perfectamente
levantado**, que es el peor tipo de error: el mensaje apunta al lugar
equivocado.

## Producción en Cloudflare Pages (desde 2026-10-01)

El panel vive en **`https://calc3d-web.pages.dev`** (proyecto `calc3d-web` en
Workers y Pages, conectado a este repo, despliega solo en cada push a `main`) y
le habla a la API en **Render**: `https://calc3d-api.onrender.com/api` (la base
está en Railway; detalle en el `CLAUDE.md` de `calc3d-api`).

| Configuración de compilación | Valor |
|---|---|
| Valor preestablecido del marco | Ninguno |
| Comando de compilación | `pnpm install --frozen-lockfile && pnpm --filter @calc3d/web build` |
| Directorio de salida | `apps/web/dist` |
| Directorio raíz | vacío |

| Variable (tipo **Texto**) | Valor |
|---|---|
| `VITE_API_URL` | `https://calc3d-api.onrender.com/api` |
| `NODE_VERSION` | `22.18.0` |
| `PNPM_VERSION` | `11.6.0` |

- ⚠️ **Sin comando de compilación ni directorio de salida, Pages publica el REPO
  TAL CUAL** y lo da por "exitoso": la raíz respondía 404 y en cambio
  `/package.json` y `/README.md` daban 200. Si el sitio da 404 con el deploy en
  verde, mirar esto primero.
- `VITE_API_URL` va como **Texto**, no Secreto: se escribe DENTRO del bundle que
  baja cualquier visitante (no es secreta), y un secreto puede no estar en el
  build — el panel quedaría apuntando al fallback `localhost:3001`.
- `NODE_VERSION`/`PNPM_VERSION`: pnpm 11 exige Node ≥ 22.13 (lo mismo que rompió
  el `Dockerfile` de la API en Render).
- `apps/web/public/_redirects` (`/* /index.html 200`) es el fallback SPA: sin él,
  recargar en `/filament/stock` daría 404.
- Del lado de la API, `WEB_ORIGIN` en Render tiene que ser
  `https://calc3d-web.pages.dev` exacto (sin barra final) o el login muere en CORS.
- Un cambio de configuración en Pages NO se aplica a lo ya publicado: hay que
  "Reintentar implementación".
- La API del plan free de Render se duerme a los 15 min y despertarla tardó
  más de 2 minutos (2026-10-02). `Login.tsx` la despierta apenas se abre la
  página (`GET /health`, no toca la base) y, si el login pasa de 6 s, explica la
  espera en vez de un "Entrando…" mudo. La solución de fondo es un ping cada
  10 min a `/api/health` (cron-job.org): 744 h/mes entran en las 750 gratis con
  UN solo servicio en Render.

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
