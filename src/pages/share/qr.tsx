import qrcode from 'qrcode-generator';
import { t } from '../../i18n';

/** QR drawn on the phone as one SVG path (no image, no network). Colours come from the stylesheet. */
export function QrSvg({ text }: { text: string }) {
  const q = qrcode(0, 'M');
  q.addData(text);
  q.make();
  const n = q.getModuleCount();
  let d = '';
  for (let r = 0; r < n; r += 1) for (let c = 0; c < n; c += 1) if (q.isDark(r, c)) d += `M${c + 2} ${r + 2}h1v1h-1z`;
  const size = n + 4;
  return (
    <svg class="sf-ps__qr" viewBox={`0 0 ${size} ${size}`} role="img" aria-label={t('ps.qr.label')} shape-rendering="crispEdges">
      <path d={d} class="sf-ps__qr-dark" />
    </svg>
  );
}
