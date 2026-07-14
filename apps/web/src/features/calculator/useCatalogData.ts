import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';

export interface MaterialItem {
  id: string;
  name: string;
  rollPrice: string;
  rollGrams: number;
}
export interface PrinterItem {
  id: string;
  name: string;
  price: string;
  lifetimeHours: number;
  powerKw: string;
  maintPerHour: string;
}
export interface ComponentItem {
  id: string;
  name: string;
  packagePrice: string;
  unitsPerPackage: number;
  scope: 'PER_PIECE' | 'PER_ORDER';
}
export interface ClientItem {
  id: string;
  name: string;
}

function useList<T>(endpoint: string) {
  return useQuery({
    queryKey: [endpoint],
    queryFn: async () => (await api.get<T[]>(`/${endpoint}`)).data,
  });
}

export function useCatalogData() {
  return {
    materials: useList<MaterialItem>('materials'),
    printers: useList<PrinterItem>('printers'),
    components: useList<ComponentItem>('components'),
    clients: useList<ClientItem>('clients'),
  };
}
