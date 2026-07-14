import { useQuery } from '@tanstack/react-query';
import type { ContactTypeDto } from '@calc3d/shared';
import { api } from '@/lib/api';

export interface Contact {
  id: string;
  name: string;
  type: ContactTypeDto;
  contact: string | null;
  phone: string | null;
  rif: string | null;
  address: string | null;
  municipality: string | null;
  city: string | null;
  notes: string | null;
  lat: number | null;
  lng: number | null;
  createdAt: string;
}

export interface ContactHistory {
  quotes: { id: string; name: string; status: string; createdAt: string; totals: unknown }[];
  orders: {
    id: string;
    code: number;
    status: string;
    createdAt: string;
    total: number;
    paid: number;
    balance: number;
  }[];
  sales: { id: string; date: string; amount: string; kind: string }[];
}

export interface ContactDetail extends Contact {
  history: ContactHistory;
}

/** Etiqueta y color de cada tipo de contacto (el color se usa en los pines del mapa). */
export const CONTACT_TYPE: Record<ContactTypeDto, { label: string; color: string }> = {
  CLIENT: { label: 'Cliente', color: '#FFC300' },
  SUPPLIER: { label: 'Proveedor', color: '#3b82c4' },
  ALLY: { label: 'Aliado', color: '#22c55e' },
  COMPETITOR: { label: 'Competencia', color: '#ef4444' },
};

export const CONTACT_TYPE_OPTIONS = Object.entries(CONTACT_TYPE).map(([value, v]) => ({
  value: value as ContactTypeDto,
  label: v.label,
}));

export function useContacts() {
  return useQuery({
    queryKey: ['clients'],
    queryFn: async () => (await api.get<Contact[]>('/clients')).data,
  });
}

export function useContact(id: string) {
  return useQuery({
    queryKey: ['clients', id],
    queryFn: async () => (await api.get<ContactDetail>(`/clients/${id}`)).data,
    enabled: !!id,
  });
}
