import { useEffect, useRef, useState } from 'preact/hooks';
import { t } from '../../i18n';
import { Button } from '../../ui/components';
import { secretFromLink } from '../../shared/planShare/secret';

/** Camera scan with jsqr (iOS Safari has no BarcodeDetector). Starts only after the tap; stops the camera on close or on a read. */
/** Plan sharing passes `onSecret`; the gym connection passes `onText` (the raw QR text, checked by the caller). */
export function Scanner({ onSecret, onText, onClose }: { onSecret?: (secret: Uint8Array) => void; onText?: (text: string) => void; onClose: () => void }) {
  const video = useRef<HTMLVideoElement>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let stop = false;
    let stream: MediaStream | null = null;
    let timer = 0;
    (async () => {
      if (!navigator.mediaDevices?.getUserMedia) return setErr(t('ps.scan.nocam'));
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' }, audio: false });
      } catch {
        return setErr(t('ps.scan.denied'));
      }
      if (stop) return stream.getTracks().forEach((tr) => tr.stop());
      const v = video.current;
      if (!v) return;
      v.srcObject = stream;
      await v.play().catch(() => undefined);
      const { default: jsQR } = await import('jsqr');
      const canvas = document.createElement('canvas');
      const tick = () => {
        if (stop) return;
        if (v.videoWidth > 0) {
          const w = Math.min(480, v.videoWidth);
          const h = Math.round((v.videoHeight / v.videoWidth) * w);
          canvas.width = w;
          canvas.height = h;
          const ctx = canvas.getContext('2d', { willReadFrequently: true });
          ctx?.drawImage(v, 0, 0, w, h);
          const img = ctx?.getImageData(0, 0, w, h);
          const hit = img ? jsQR(img.data, w, h) : null;
          if (hit && onText) return onText(hit.data);
          const s = hit && onSecret ? secretFromLink(hit.data) : null;
          if (s && s.ok) return onSecret!(s.value);
        }
        timer = window.setTimeout(tick, 250);
      };
      tick();
    })();
    return () => {
      stop = true;
      window.clearTimeout(timer);
      stream?.getTracks().forEach((tr) => tr.stop());
    };
  }, []);

  return (
    <div class="sf-ps__scan">
      {err ? <p class="sf-rt__err" role="alert">{err}</p> : <video ref={video} class="sf-ps__video" playsInline muted aria-label={t('ps.scan.label')} />}
      <Button variant="secondary" onPress={onClose}>{t('rb.cancel')}</Button>
    </div>
  );
}
