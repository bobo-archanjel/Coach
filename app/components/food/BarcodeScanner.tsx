"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { createPortal } from "react-dom";
import { BARCODE_FORMATS, parseBarcode, type BarcodeFormat } from "@/lib/barcode";
import styles from "./food.module.css";

/** Ako dlho čakať medzi dvoma pokusmi o prečítanie snímky (ms). */
const DETECT_INTERVAL_MS = 120;

type DetectedBarcode = { rawValue: string; format: string };
type Detector = { detect(source: HTMLVideoElement): Promise<DetectedBarcode[]> };
type NativeDetectorClass = {
  new (options: { formats: string[] }): Detector;
  getSupportedFormats(): Promise<string[]>;
};

let zxingPrepared = false;

/**
 * Natívny BarcodeDetector (Android Chrome), inak ZXing WASM cez `barcode-detector`
 * (iPhone — Safari ho nemá). Knižnica sa načíta až pri prvom otvorení skenera a .wasm
 * ide z vlastnej domény (/wasm/, scripts/copy-zxing-wasm.mjs), nie z CDN.
 */
async function createDetector(): Promise<Detector> {
  const formats = [...BARCODE_FORMATS];
  const Native = (globalThis as { BarcodeDetector?: NativeDetectorClass }).BarcodeDetector;
  if (Native) {
    try {
      const supported = await Native.getSupportedFormats();
      if (formats.every((f) => supported.includes(f))) return new Native({ formats });
    } catch {
      // natívny existuje, ale nefunguje (napr. desktop bez podpory) — ZXing nižšie
    }
  }
  const { BarcodeDetector, prepareZXingModule, ZXING_WASM_VERSION } = await import("barcode-detector/ponyfill");
  if (!zxingPrepared) {
    prepareZXingModule({
      overrides: {
        locateFile: (path: string, prefix: string) =>
          path.endsWith(".wasm") ? `/wasm/${path}?v=${ZXING_WASM_VERSION}` : prefix + path,
      },
    });
    zxingPrepared = true;
  }
  return new BarcodeDetector({ formats });
}

function cameraErrorMessage(err: unknown): string {
  const name = err instanceof DOMException ? err.name : "";
  if (name === "NotAllowedError" || name === "SecurityError") {
    return "Prístup ku kamere je zamietnutý. Povoľ ho v nastaveniach prehliadača (ikona pri adrese stránky) alebo zadaj číslo kódu ručne.";
  }
  if (name === "NotFoundError" || name === "OverconstrainedError") {
    return "Nenašli sme kameru. Zadaj číslo kódu ručne.";
  }
  if (name === "NotReadableError") {
    return "Kameru práve používa iná aplikácia. Zavri ju a skús znova, alebo zadaj číslo kódu ručne.";
  }
  return "Kameru sa nepodarilo spustiť. Zadaj číslo kódu ručne.";
}

const CloseIcon = () => (
  <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true">
    <path d="M5 5l10 10M15 5L5 15" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
  </svg>
);

const FlashIcon = () => (
  <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true">
    <path d="M11 2L4 11h5l-1 7 7-9h-5l1-7z" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" />
  </svg>
);

/**
 * Celoobrazovkový skener čiarových kódov (denník jedál aj builder jedálnička). Zadná kamera, rámček,
 * blesk (ak ho zariadenie má), zavrieť. Kód sa prijme až keď sa ten istý prečíta
 * v dvoch snímkach po sebe (jedno zlé prečítanie neotvorí cudzí produkt). Ručné
 * zadanie čísla je vždy k dispozícii — aj keď kamera nejde (zamietnutý prístup,
 * HTTP bez TLS, žiadna kamera). Pri zatvorení sa zastavia všetky tracky streamu.
 * `onDetected` dostane kód v jednotnom tvare (lib/barcode.ts).
 */
export function BarcodeScanner({ onDetected, onClose }: { onDetected: (code: string) => void; onClose: () => void }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const trackRef = useRef<MediaStreamTrack | null>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const [status, setStatus] = useState<"starting" | "scanning" | "error">("starting");
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [torchSupported, setTorchSupported] = useState(false);
  const [torchOn, setTorchOn] = useState(false);
  const [manual, setManual] = useState("");
  const [manualError, setManualError] = useState<string | null>(null);

  // Rodičovské callbacky sa menia pri každom renderi — efekt kamery ich číta cez ref,
  // nech sa kvôli nim stream nereštartuje.
  const onDetectedRef = useRef(onDetected);
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onDetectedRef.current = onDetected;
    onCloseRef.current = onClose;
  });

  useEffect(() => {
    let stopped = false;
    let stream: MediaStream | null = null;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const stopStream = () => {
      clearTimeout(timer);
      stream?.getTracks().forEach((t) => t.stop());
      stream = null;
      trackRef.current = null;
      if (videoRef.current) videoRef.current.srcObject = null;
    };

    (async () => {
      if (!navigator.mediaDevices?.getUserMedia) {
        setStatus("error");
        setCameraError(
          window.isSecureContext
            ? "Tento prehliadač nevie spustiť kameru. Zadaj číslo kódu ručne."
            : "Kamera funguje len cez zabezpečené pripojenie (HTTPS). Zadaj číslo kódu ručne.",
        );
        return;
      }
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          audio: false,
          video: { facingMode: { ideal: "environment" }, width: { ideal: 1280 }, height: { ideal: 720 } },
        });
      } catch (err) {
        if (stopped) return;
        setStatus("error");
        setCameraError(cameraErrorMessage(err));
        return;
      }
      if (stopped) return stopStream();

      const video = videoRef.current;
      if (!video) return stopStream();
      video.srcObject = stream;
      try {
        await video.play();
      } catch {
        // iOS niekedy odmietne play() pred prvým snímkom — srcObject + autoPlay to dobehne
      }
      const track = stream.getVideoTracks()[0] ?? null;
      trackRef.current = track;
      const caps = track?.getCapabilities?.() as (MediaTrackCapabilities & { torch?: boolean }) | undefined;
      setTorchSupported(Boolean(caps?.torch));

      let detector: Detector;
      try {
        detector = await createDetector();
      } catch (err) {
        console.error("BarcodeScanner:", err);
        if (stopped) return;
        stopStream();
        setStatus("error");
        setCameraError("Skener sa nepodarilo spustiť. Zadaj číslo kódu ručne.");
        return;
      }
      if (stopped) return stopStream();
      setStatus("scanning");

      let previous: string | null = null;
      const tick = async () => {
        if (stopped) return;
        if (video.readyState >= 2) {
          try {
            const hits = await detector.detect(video);
            const hit = hits.find((h) => (BARCODE_FORMATS as readonly string[]).includes(h.format));
            const parsed = hit ? parseBarcode(hit.rawValue, hit.format as BarcodeFormat) : null;
            if (parsed && parsed.code === previous) {
              if (stopped) return;
              stopped = true;
              stopStream();
              navigator.vibrate?.(60);
              onDetectedRef.current(parsed.code);
              return;
            }
            previous = parsed?.code ?? null;
          } catch {
            // jedna nečitateľná snímka nevadí — skúsi sa ďalšia
          }
        }
        timer = setTimeout(tick, DETECT_INTERVAL_MS);
      };
      void tick();
    })();

    return () => {
      stopped = true;
      stopStream();
    };
  }, []);

  // Escape zavrie, stránka pod oknom sa neposúva, fokus na "Zavrieť".
  useEffect(() => {
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCloseRef.current();
    };
    document.addEventListener("keydown", onKey);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = previousOverflow;
    };
  }, []);

  async function toggleTorch() {
    const track = trackRef.current;
    if (!track) return;
    const next = !torchOn;
    try {
      await track.applyConstraints({ advanced: [{ torch: next } as MediaTrackConstraintSet] });
      setTorchOn(next);
    } catch {
      setTorchSupported(false);
    }
  }

  function submitManual(e: FormEvent) {
    e.preventDefault();
    const parsed = parseBarcode(manual);
    if (!parsed) {
      setManualError("Neplatný kód — zadaj 8, 12 alebo 13 číslic spod čiarového kódu.");
      return;
    }
    onDetected(parsed.code);
  }

  const hint =
    status === "starting" ? "Spúšťam kameru…" : status === "scanning" ? "Namier kameru na čiarový kód na obale." : null;

  const overlay = (
    <div className={styles.scanOverlay} role="dialog" aria-modal="true" aria-label="Skenovanie čiarového kódu">
      <video ref={videoRef} className={styles.scanVideo} playsInline muted autoPlay aria-hidden="true" />
      {status !== "error" && (
        <div className={styles.scanShade} aria-hidden="true">
          <div className={styles.scanFrame} />
        </div>
      )}

      <div className={styles.scanTop}>
        <button ref={closeRef} type="button" className={styles.scanIconBtn} onClick={onClose} aria-label="Zavrieť skener">
          <CloseIcon />
        </button>
        {torchSupported && (
          <button
            type="button"
            className={`${styles.scanIconBtn} ${torchOn ? styles.scanIconBtnOn : ""}`}
            onClick={toggleTorch}
            aria-pressed={torchOn}
            aria-label="Blesk"
          >
            <FlashIcon />
          </button>
        )}
      </div>

      <div className={styles.scanBottom}>
        {hint && (
          <p className={styles.scanHint} role="status">
            {hint}
          </p>
        )}
        {cameraError && (
          <p className={styles.scanError} role="alert">
            {cameraError}
          </p>
        )}
        <form className={styles.scanManual} onSubmit={submitManual} noValidate>
          <label htmlFor="scan-manual-code" className={styles.scanManualLabel}>
            Číslo pod čiarovým kódom
          </label>
          <div className={styles.scanManualRow}>
            <input
              id="scan-manual-code"
              className={styles.scanManualInput}
              type="text"
              inputMode="numeric"
              autoComplete="off"
              maxLength={18}
              placeholder="napr. 8586000201234"
              value={manual}
              onChange={(e) => {
                setManual(e.target.value);
                if (manualError) setManualError(null);
              }}
            />
            <button type="submit" className="btn btn-primary">
              Hľadať
            </button>
          </div>
          {manualError && <p className={styles.scanError}>{manualError}</p>}
        </form>
      </div>
    </div>
  );

  // Nad celou stránkou (nie vnútri karty denníka); v dizajne v6 do jeho koreňa kvôli tokenom témy.
  return createPortal(overlay, document.querySelector("[data-v6-root]") ?? document.body);
}
