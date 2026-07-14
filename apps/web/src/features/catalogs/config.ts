import {
  ClientSchema,
  ComponentSchema,
  MaterialSchema,
  PrinterSchema,
  ProviderSchema,
  type CatalogOptionKind,
} from '@calc3d/shared';
import type { ZodSchema } from 'zod';

export interface CatalogField {
  name: string;
  label: string;
  type: 'text' | 'number' | 'select' | 'combobox';
  step?: string;
  options?: { value: string; label: string }[];
  /** Para 'combobox': lista administrada de la que salen las opciones. */
  optionsKind?: CatalogOptionKind;
  hint?: string;
  optional?: boolean;
}

export interface CatalogColumn {
  key: string;
  label: string;
  kind?: 'money' | 'number' | 'text';
  /** Columna calculada (no es un campo del registro). 'rolls' = nº de rollos comprados. */
  computed?: 'rolls';
}

export interface CatalogConfig {
  /** segmento de la ruta (/catalogs/:resource) */
  route: string;
  /** endpoint del API */
  endpoint: string;
  title: string;
  singular: string;
  schema: ZodSchema;
  fields: CatalogField[];
  columns: CatalogColumn[];
  /** true = definición de costo: se crea SOLO vía gasto (sin "Agregar" suelto). */
  costDefinition?: boolean;
  /** Filtros a mostrar en la página (solo materiales por ahora). */
  filters?: Array<'brand' | 'color' | 'date'>;
}

export const catalogs: Record<string, CatalogConfig> = {
  materials: {
    route: 'materials',
    endpoint: 'materials',
    title: 'Materiales / Filamentos',
    singular: 'material',
    schema: MaterialSchema,
    fields: [
      { name: 'name', label: 'Nombre', type: 'text' },
      { name: 'brand', label: 'Marca', type: 'combobox', optionsKind: 'MATERIAL_BRAND', optional: true },
      { name: 'type', label: 'Tipo (PLA, PETG…)', type: 'combobox', optionsKind: 'MATERIAL_TYPE', optional: true },
      { name: 'rollPrice', label: 'Precio del rollo', type: 'number', step: '0.01' },
      { name: 'rollGrams', label: 'Gramos del rollo', type: 'number', step: '1', hint: 'Ej. 1000' },
      { name: 'color', label: 'Color', type: 'combobox', optionsKind: 'MATERIAL_COLOR', optional: true },
    ],
    columns: [
      { key: 'brand', label: 'Marca' },
      { key: 'type', label: 'Tipo' },
      { key: 'rollPrice', label: 'Precio rollo', kind: 'money' },
      { key: 'rollGrams', label: 'Gramos', kind: 'number' },
      { key: 'color', label: 'Color' },
      { key: 'rolls', label: 'Rollos', computed: 'rolls' },
    ],
    costDefinition: true,
    filters: ['brand', 'color', 'date'],
  },
  printers: {
    route: 'printers',
    endpoint: 'printers',
    title: 'Impresoras',
    singular: 'impresora',
    schema: PrinterSchema,
    fields: [
      { name: 'name', label: 'Nombre', type: 'text' },
      { name: 'price', label: 'Precio', type: 'number', step: '0.01' },
      { name: 'lifetimeHours', label: 'Vida útil (horas)', type: 'number', step: '1', hint: 'Ej. 5000' },
      { name: 'powerKw', label: 'Potencia (kW)', type: 'number', step: '0.01', hint: 'Ej. 0.12' },
      { name: 'maintPerHour', label: 'Mantenimiento por hora', type: 'number', step: '0.01', optional: true },
    ],
    columns: [
      { key: 'name', label: 'Nombre' },
      { key: 'price', label: 'Precio', kind: 'money' },
      { key: 'lifetimeHours', label: 'Vida útil (h)', kind: 'number' },
      { key: 'powerKw', label: 'kW', kind: 'number' },
    ],
    costDefinition: true,
  },
  components: {
    route: 'components',
    endpoint: 'components',
    title: 'Insumos',
    singular: 'insumo',
    schema: ComponentSchema,
    fields: [
      { name: 'name', label: 'Nombre', type: 'text' },
      { name: 'packagePrice', label: 'Precio del paquete', type: 'number', step: '0.01' },
      {
        name: 'unitsPerPackage',
        label: 'Unidades por paquete',
        type: 'number',
        step: '1',
        hint: 'Ej. 100 argollas por bolsa',
      },
      {
        name: 'scope',
        label: 'Aplica',
        type: 'select',
        options: [
          { value: 'PER_PIECE', label: 'Por pieza' },
          { value: 'PER_ORDER', label: 'Por pedido' },
        ],
      },
    ],
    columns: [
      { key: 'name', label: 'Nombre' },
      { key: 'packagePrice', label: 'Precio paquete', kind: 'money' },
      { key: 'unitsPerPackage', label: 'Uds/paquete', kind: 'number' },
      { key: 'scope', label: 'Aplica' },
    ],
    costDefinition: true,
  },
  clients: {
    route: 'clients',
    endpoint: 'clients',
    title: 'Clientes',
    singular: 'cliente',
    schema: ClientSchema,
    fields: [
      { name: 'name', label: 'Nombre', type: 'text' },
      { name: 'contact', label: 'Contacto (correo/teléfono)', type: 'text', optional: true },
    ],
    columns: [
      { key: 'name', label: 'Nombre' },
      { key: 'contact', label: 'Contacto' },
    ],
  },
  providers: {
    route: 'providers',
    endpoint: 'providers',
    title: 'Proveedores',
    singular: 'proveedor',
    schema: ProviderSchema,
    fields: [
      { name: 'name', label: 'Nombre', type: 'text' },
      { name: 'contact', label: 'Contacto (correo/teléfono)', type: 'text', optional: true },
    ],
    columns: [
      { key: 'name', label: 'Nombre' },
      { key: 'contact', label: 'Contacto' },
    ],
  },
};
