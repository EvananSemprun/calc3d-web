import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { UnionVista } from '@calc3d/shared';
import { api } from '@/lib/api';

/**
 * UNIR dos fichas duplicadas (13/11): filamentos (desde su ficha) e insumos (desde
 * la tabla de Insumos). Las dos usan el mismo diálogo y la misma vista previa; lo
 * único que cambia es la ruta de la API y las palabras.
 */
export type TipoDeFicha = 'material' | 'insumo';

const RUTA: Record<TipoDeFicha, string> = { material: '/materials', insumo: '/components' };

/** Qué listas quedan viejas al unir: la ficha, sus compras, el conteo y los costeos de la tienda. */
const CLAVES_A_REFRESCAR: Record<TipoDeFicha, string[]> = {
  material: ['materials', 'filament-stock', 'filament-summary', 'filament-purchases', 'expenses', 'purchase-invoices', 'store', 'store-products'],
  insumo: ['components', 'expenses', 'purchase-invoices', 'store', 'store-products'],
};

const PALABRAS: Record<TipoDeFicha, { unidad: string; ficha: string }> = {
  material: { unidad: 'rollo', ficha: 'ficha' },
  insumo: { unidad: 'unidad', ficha: 'insumo' },
};

/** «1 compra» / «2 compras». */
const plural = (n: number, uno: string, varios: string) => `${n} ${n === 1 ? uno : varios}`;

/**
 * LO QUE LA UNIÓN VA A HACER, ya resuelto en filas de texto.
 *
 * Es la ÚNICA lista: el diálogo la dibuja tal cual. Enumera TODO lo que se mueve
 * —incluso lo que vale cero— porque un número pelado no deja ver que entró algo
 * que no correspondía, y dice el precio que queda y que no se puede deshacer.
 */
export function filasDeLaUnion(
  vista: UnionVista,
  tipo: TipoDeFicha,
  money: (n: number) => string,
): { clave: string; texto: string }[] {
  const { unidad, ficha } = PALABRAS[tipo];
  const destino = `«${vista.destino.name}»`;
  const filas: { clave: string; texto: string }[] = [
    {
      clave: 'compras',
      texto: `${plural(vista.compras, 'compra pasa', 'compras pasan')} a ${destino}. No cambia ningún monto ni ninguna fecha.`,
    },
    {
      clave: 'facturas',
      texto: `${plural(vista.lineasDeFactura, 'línea de factura pasa', 'líneas de factura pasan')} a ${destino}.`,
    },
  ];
  if (tipo === 'material') {
    const suman =
      vista.conteosQueSeSuman > 0
        ? ` En ${plural(vista.conteosQueSeSuman, 'mes', 'meses')} las dos fichas tenían conteo: se SUMAN los rollos.`
        : '';
    filas.push({
      clave: 'conteos',
      texto: `${plural(vista.conteos, 'conteo de rollos pasa', 'conteos de rollos pasan')} a ${destino}.${suman}`,
    });
  }
  filas.push({
    clave: 'productos',
    texto: `${plural(vista.productos, 'costeo de un producto de la tienda cambia', 'costeos de productos de la tienda cambian')} de nombre a ${destino}; su costo guardado no se toca.`,
  });
  filas.push({
    clave: 'precio',
    texto: vista.precio.deLaUltimaCompra
      ? `El costo por ${unidad} de ${destino} queda en ${money(vista.precio.despues)} (hoy ${money(vista.precio.antes)}): es el de la última compra de las dos ${ficha}s juntas.`
      : `El costo por ${unidad} de ${destino} se queda en ${money(vista.precio.antes)}: ninguna compra trae cantidad para recalcularlo.`,
  });
  filas.push({
    clave: 'origen',
    texto: `«${vista.origen.name}» se borra. Unir NO se puede deshacer.`,
  });
  return filas;
}

/** La vista previa: se pide al elegir el destino y NO escribe nada. */
export function useVistaDeUnion(tipo: TipoDeFicha, origenId: string, destinoId: string) {
  return useQuery({
    queryKey: ['union-vista', tipo, origenId, destinoId],
    enabled: !!destinoId,
    // Una vista vieja confirmaría números que ya no son: siempre fresca.
    staleTime: 0,
    gcTime: 0,
    queryFn: async () => {
      const { data } = await api.get<UnionVista>(`${RUTA[tipo]}/${origenId}/unir`, { params: { destinoId } });
      return data;
    },
  });
}

export function useUnirFichas(tipo: TipoDeFicha) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ origenId, destinoId }: { origenId: string; destinoId: string }) => {
      const { data } = await api.patch<UnionVista>(`${RUTA[tipo]}/${origenId}/unir`, { destinoId });
      return data;
    },
    onSuccess: () => Promise.all(CLAVES_A_REFRESCAR[tipo].map((k) => qc.invalidateQueries({ queryKey: [k] }))),
  });
}
