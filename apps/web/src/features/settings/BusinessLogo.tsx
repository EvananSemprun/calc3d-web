import { useEffect, useRef, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ImageUp, Trash2 } from 'lucide-react';
import { LOGO_MAX_BYTES, LOGO_MIME_TYPES } from '@calc3d/shared';
import { api, apiErrorMessage } from '@/lib/api';
import { notify } from '@/components/toast';
import { Button } from '@/components/ui';
import { useSettings } from './useSettings';

/** Lee el archivo como data URL (lo que espera el endpoint). */
function toDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error('No se pudo leer el archivo'));
    reader.readAsDataURL(file);
  });
}

/**
 * Logo del negocio: encabeza la nota de entrega y la cotización. Se guarda en el
 * servidor (no en disco del navegador) y solo se acepta PNG o JPEG — el backend
 * revalida tipo, tamaño y contenido, así que esto es comodidad, no la defensa.
 */
export function BusinessLogo() {
  const { data } = useSettings();
  const qc = useQueryClient();
  const inputRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<string | null>(null);

  const hasLogo = data?.hasLogo ?? false;

  // La vista previa se pide como blob (el endpoint exige sesión, así que no se
  // puede apuntar un <img src> directo a la API).
  useEffect(() => {
    if (!hasLogo) {
      setPreview(null);
      return;
    }
    let url: string | null = null;
    let cancelled = false;
    api
      .get('/settings/logo', { responseType: 'blob' })
      .then((res) => {
        if (cancelled) return;
        url = URL.createObjectURL(res.data as Blob);
        setPreview(url);
      })
      .catch(() => setPreview(null));
    return () => {
      cancelled = true;
      if (url) URL.revokeObjectURL(url);
    };
  }, [hasLogo]);

  const upload = useMutation({
    mutationFn: async (file: File) => {
      const dataUrl = await toDataUrl(file);
      await api.put('/settings/logo', { dataUrl });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['settings'] });
      notify.success('Logo actualizado');
    },
    onError: (e) => notify.error(apiErrorMessage(e)),
  });

  const remove = useMutation({
    mutationFn: () => api.delete('/settings/logo'),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['settings'] });
      notify.success('Logo quitado');
    },
    onError: (e) => notify.error(apiErrorMessage(e)),
  });

  const pick = (file: File | undefined) => {
    if (!file) return;
    if (!(LOGO_MIME_TYPES as readonly string[]).includes(file.type)) {
      notify.error('El logo debe ser un PNG o JPEG');
      return;
    }
    if (file.size > LOGO_MAX_BYTES) {
      notify.error('El logo no puede pesar más de 1 MB');
      return;
    }
    upload.mutate(file);
  };

  const busy = upload.isPending || remove.isPending;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-4">
        <div className="flex h-24 w-56 shrink-0 items-center justify-center rounded-lg border border-dashed border-border bg-muted/40 p-2">
          {preview ? (
            <img src={preview} alt="Logo del negocio" className="max-h-full max-w-full object-contain" />
          ) : (
            <span className="text-xs text-muted-foreground">Sin logo</span>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" disabled={busy} onClick={() => inputRef.current?.click()}>
            <ImageUp className="h-4 w-4" />
            {upload.isPending ? 'Subiendo…' : hasLogo ? 'Cambiar logo' : 'Subir logo'}
          </Button>
          {hasLogo && (
            <Button variant="outline" disabled={busy} onClick={() => remove.mutate()}>
              <Trash2 className="h-4 w-4" /> Quitar
            </Button>
          )}
        </div>
      </div>
      <input
        ref={inputRef}
        type="file"
        accept={LOGO_MIME_TYPES.join(',')}
        className="hidden"
        onChange={(e) => {
          pick(e.target.files?.[0]);
          // Permite volver a elegir el MISMO archivo después de un error.
          e.target.value = '';
        }}
      />
      <p className="text-xs text-muted-foreground">
        PNG o JPEG, hasta 1 MB. Se dibuja centrado arriba de la nota de entrega y de la cotización;
        conviene una imagen recortada sin márgenes en blanco para que no se vea pequeña.
      </p>
    </div>
  );
}
