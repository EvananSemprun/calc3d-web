// Sincroniza packages/shared (su `src/` Y la versión de su package.json) desde la
// copia CANÓNICA (calc3d-api). Evita que las dos copias del motor de cálculo se
// desincronicen.
// Uso:  pnpm sync:shared            (usa ../calc3d-api por defecto)
//       pnpm sync:shared --from <ruta-al-packages/shared-canónico>
// Si la ruta no existe, NO falla: conserva la copia local ya versionada.
//
// ⚠️ La versión se ESCRIBE, no se recuerda. Antes este script copiaba solo `src/`
// y terminaba pidiendo por consola que alguien revisara el package.json a mano —
// aunque su comentario de arriba decía que también lo sincronizaba. Ese aviso se
// perdió una vez y dejó `version.ts` en 0.6.0 contra un package.json en 0.5.0, con
// el test de anclaje en rojo y el contrato front↔back declarando dos versiones
// distintas. Un paso manual que rompe el contrato no es un paso: es una bomba.
import { cpSync, existsSync, rmSync, readFileSync, writeFileSync } from 'node:fs';
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
console.log(`[sync:shared] shared/src sincronizado desde ${srcDir}.`);

// El campo `version` se reescribe con una sustitución de texto en vez de
// JSON.parse + stringify: así el orden de las claves, la indentación y los saltos
// del package.json quedan intactos y el diff es de UNA línea. El patrón está
// anclado a principio de línea (con `m`) para no tocar un "version" que viviera
// anidado dentro de otra clave.
const ver = JSON.parse(readFileSync(resolve(from, 'package.json'), 'utf8')).version;
const pkgPath = resolve('packages/shared/package.json');
const pkgRaw = readFileSync(pkgPath, 'utf8');
const verLocal = JSON.parse(pkgRaw).version;

if (verLocal === ver) {
  console.log(`[sync:shared] version: ${ver} (ya coincidía, sin cambios).`);
} else {
  const actualizado = pkgRaw.replace(/^(\s*"version":\s*)"[^"]*"/m, `$1"${ver}"`);
  // Si el patrón no encontró nada, fallar RUIDOSAMENTE: dejar el package.json
  // desincronizado en silencio es justo el bug que este script existe para evitar.
  if (actualizado === pkgRaw) {
    console.error(`[sync:shared] ERROR: no pude reescribir "version" en ${pkgPath}.`);
    console.error(`[sync:shared] Ponela a mano en ${ver} y volvé a correr: pnpm test:shared`);
    process.exit(1);
  }
  writeFileSync(pkgPath, actualizado);
  console.log(`[sync:shared] version: ${verLocal} → ${ver} (escrita en package.json).`);
}

console.log('[sync:shared] Verificá con: pnpm test:shared');
