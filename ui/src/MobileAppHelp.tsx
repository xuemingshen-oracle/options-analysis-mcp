import { useEffect, useRef, useState } from "react";

import ThemeControls from "./ThemeControls";
import { FONT_SCALE_OPTIONS, stepFontScale } from "./preferences";
import type { FontScale, ThemePreference } from "./preferences";

interface PreferencesProps {
  theme: ThemePreference;
  onThemeChange: (theme: ThemePreference) => void;
  fontScale: FontScale;
  onFontScaleChange: (scale: FontScale) => void;
}

export function AppPreferences({
  theme,
  onThemeChange,
  fontScale,
  onFontScaleChange,
}: PreferencesProps) {
  return (
    <>
      <ThemeControls onChange={onThemeChange} theme={theme} />
      <div className="preference-card text-size-card">
        <span>Text size</span>
        <div aria-label="Text size" className="text-size-controls" role="group">
          <button
            aria-label="Decrease text size"
            disabled={fontScale === FONT_SCALE_OPTIONS[0]}
            onClick={() => onFontScaleChange(stepFontScale(fontScale, -1))}
            type="button"
          >
            A−
          </button>
          <button
            aria-label={`Reset text size, current ${fontScale} percent`}
            onClick={() => onFontScaleChange(100)}
            title="Reset text size"
            type="button"
          >
            {fontScale}%
          </button>
          <button
            aria-label="Increase text size"
            disabled={fontScale === FONT_SCALE_OPTIONS.at(-1)}
            onClick={() => onFontScaleChange(stepFontScale(fontScale, 1))}
            type="button"
          >
            A+
          </button>
        </div>
      </div>
    </>
  );
}

export default function MobileAppHelp(props: PreferencesProps) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [standalone, setStandalone] = useState(false);

  useEffect(() => {
    const displayMode = window.matchMedia("(display-mode: standalone)");
    const update = () => {
      const safari = window.navigator as Navigator & { standalone?: boolean };
      setStandalone(displayMode.matches || safari.standalone === true);
    };
    update();
    displayMode.addEventListener("change", update);
    return () => displayMode.removeEventListener("change", update);
  }, []);

  return (
    <>
      <button
        aria-haspopup="dialog"
        aria-label="Settings and app help"
        className="app-help-trigger"
        onClick={() => dialog.current?.showModal()}
        type="button"
      >
        <svg
          aria-hidden="true"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.7"
        >
          <path d="M4 7h16M4 17h16" />
          <circle cx="8" cy="7" r="3" fill="var(--surface)" />
          <circle cx="16" cy="17" r="3" fill="var(--surface)" />
        </svg>
        <span className="app-help-label">App help</span>
      </button>
      <dialog
        aria-labelledby="app-help-heading"
        className="app-help-dialog"
        onClick={(event) => {
          if (event.target === event.currentTarget) dialog.current?.close();
        }}
        ref={dialog}
      >
        <div className="app-help-content">
          <div className="app-help-heading">
            <div>
              <span className="eyebrow">Option Atlas</span>
              <h2 id="app-help-heading">Make it yours</h2>
            </div>
            <button
              aria-label="Close app help"
              onClick={() => dialog.current?.close()}
              type="button"
            >
              ×
            </button>
          </div>
          <div className="app-help-preferences">
            <AppPreferences {...props} />
          </div>
          <section
            className="app-install-help"
            aria-labelledby="app-install-heading"
          >
            <img src="/apple-touch-icon.png" alt="" width="48" height="48" />
            <div>
              <h3 id="app-install-heading">
                {standalone
                  ? "Your Home Screen workspace"
                  : "Keep Atlas on your Home Screen"}
              </h3>
              {standalone ? (
                <p>
                  You’re using the app view. Your server still needs to be
                  running and reachable to calculate results or load market
                  data.
                </p>
              ) : (
                <>
                  <p>On iPhone or iPad, open this address in Safari.</p>
                  <ol>
                    <li>
                      Tap <strong>Share</strong> in Safari’s toolbar or menu.
                    </li>
                    <li>
                      Choose <strong>Add to Home Screen</strong>.
                    </li>
                    <li>
                      Keep <strong>Open as Web App</strong> on if shown, then
                      tap <strong>Add</strong>.
                    </li>
                  </ol>
                  <p className="app-help-note">
                    Keep the server running and use its reachable address on
                    your phone. The app needs a connection for calculations and
                    market data.
                  </p>
                </>
              )}
            </div>
          </section>
          <p className="app-help-storage">
            Drafts and named setups are saved in this browser or app. Export a
            JSON backup before moving to another device or app view.
          </p>
        </div>
      </dialog>
    </>
  );
}
