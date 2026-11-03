import { useEffect, useRef, useState } from "react";
import { BrickBreaker, saveApkFile } from "@/game/engine";

export function BrickGame() {
  const ref = useRef<HTMLCanvasElement>(null);
  const [note, setNote] = useState("Saves BrickBreakerBold.apk to Downloads");

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const game = new BrickBreaker(canvas);
    game.start();
    return () => game.stop();
  }, []);

  return (
    <main className="shell">
      <div className="apk-bar">
        <button
          type="button"
          className="apk-save"
          onClick={() => {
            setNote("Saving the APK...");
            void saveApkFile().then((result) => {
              if (result === "shared") {
                setNote("Choose Files or Downloads, then open the APK and tap Install.");
              } else if (result === "saved") {
                setNote("Open Downloads, tap BrickBreakerBold.apk, then tap Install.");
              } else {
                setNote("If a page opened, go back and tap Download APK again.");
              }
            });
          }}
        >
          Download APK
        </button>
        <p>{note}</p>
      </div>
      <canvas ref={ref} className="stage" aria-label="BrickBreaker Bold" />
    </main>
  );
}
