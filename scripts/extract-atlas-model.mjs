// Phase 60: one-off extractor. Reads the owner's prototype (reference/prototypes/holo_body_3d.html) and writes the
// 3D model as plain files under public/atlas/ (no base64 in JS): body.bin and fit.bin are the prototype's gzip blobs
// byte for byte, meta.json holds the two mesh tables. Run: node scripts/extract-atlas-model.mjs
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const html = readFileSync(join(root, 'reference/prototypes/holo_body_3d.html'), 'utf8');

function between(start, end, from = 0) {
  const a = html.indexOf(start, from);
  if (a < 0) throw new Error(`missing ${start}`);
  const b = html.indexOf(end, a + start.length);
  if (b < 0) throw new Error(`missing ${end} after ${start}`);
  return [html.slice(a + start.length, b), b];
}
const [metaTxt, e1] = between('const META=', ';\nconst B64="');
const [b64, e2] = between('const B64="', '";', e1);
const [meta2Txt, e3] = between('const META2=', ';\nconst B64X="', e2);
const [b64x] = between('const B64X="', '";', e3);
const meta = JSON.parse(metaTxt);
const fit = JSON.parse(meta2Txt);
const body = Buffer.from(b64, 'base64');
const fitBin = Buffer.from(b64x, 'base64');
if (body[0] !== 0x1f || body[1] !== 0x8b || fitBin[0] !== 0x1f || fitBin[1] !== 0x8b) throw new Error('blobs are not gzip');

const out = join(root, 'public/atlas');
mkdirSync(out, { recursive: true });
writeFileSync(join(out, 'body.bin'), body);
writeFileSync(join(out, 'fit.bin'), fitBin);
writeFileSync(join(out, 'meta.json'), JSON.stringify({ body: meta, fit }));
console.log(JSON.stringify({ bodyBytes: body.length, fitBytes: fitBin.length, bodyMeshes: meta.meshes.length, fitMeshes: fit.meshes.length }));
