import { useEffect, useState } from 'react';
import { takeReport, markCleanExit, describeReport } from '../services/crashBreadcrumb';

/**
 * Reports how the previous session ended, when it ended abnormally.
 *
 * Mounted at the app root because the whole point is to outlive the thing being diagnosed: if
 * the runtime is destroyed there is no chance to report anything from inside that session, so
 * the report is read at the *next* boot out of storage.
 *
 * `pagehide` is half the discriminator — it fires when the document unloads with JS alive and
 * cannot fire when the process is killed. See `crashBreadcrumb` for the rest.
 */
export default function CrashReportBanner() {
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    const report = takeReport(window.localStorage, Date.now());
    if (report) setMessage(describeReport(report));

    const onHide = () => markCleanExit(window.localStorage);
    // pagehide, not beforeunload: iOS Safari and WKWebView fire pagehide reliably and
    // beforeunload barely at all.
    window.addEventListener('pagehide', onHide);
    return () => window.removeEventListener('pagehide', onHide);
  }, []);

  if (!message) return null;

  return (
    <div className="crash-report-banner" role="status">
      <div className="crash-report-heading">Diagnostic — previous session</div>
      {/* Selectable: a TestFlight build has no readable console without a Mac. */}
      <div className="crash-report-text">{message}</div>
      <button
        type="button"
        className="crash-report-dismiss"
        onClick={() => setMessage(null)}
      >
        Dismiss
      </button>
    </div>
  );
}
