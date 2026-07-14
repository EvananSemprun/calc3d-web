// Sincroniza packages/shared/src y su package.json desde la copia CANÓNICA
// (calc3d-api). Evita que las dos copias del motor de cálculo se desincronicen.
// Uso:  pnpm sync:shared            (usa ../calc3d-api por defecto)
//       pnpm sync:shared --from <ruta-al-packages/shared-canónico>
// Si la ruta no existe, NO falla: conserva la copia local ya versionada.
import { cpSync, existsSync, rmSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const i = process.argv.indexOf('--from');
const from = i !== -1 ? process.argv[i + 1] : '../calc3d-api/packages/shared';
const srcDir = resolve(from, 'src');
const destDir = resolve('packages/shared/src');

if (!existsSync(srcDir)) {
  console.warn(`[sync:shared] No encontré la copia canónica en ${srcDir}.`);
  console.warn('[sync:shared] Conservo la copia local ya versionada (sin cambios).');
  process.exit(0);
}

rmSync(destDir, { recursive: true, force: true });
cpSync(srcDir, destDir, { recursive: true });

const ver = JSON.parse(readFileSync(resolve(from, 'package.json'), 'utf8')).version;
console.log(`[sync:shared] shared/src sincronizado desde ${srcDir} (v${ver}).`);
console.log('[sync:shared] Revisá que packages/shared/package.json tenga la misma versión y corré: pnpm test:shared');
