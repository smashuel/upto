import { useEffect, useState } from 'react';
import { takeReport, markUnload, describeReport } from '../services/crashBreadcrumb';

/**
 * Reports an operation that was in flight when the app last disappeared.
 *
 * Mounted at the app root because the whole point is to survive the thing being diagnosed:
 * if the runtime is destroyed, nothing inside the page gets a chance to report anything, so
 * the report has to be read at the *next* boot from storage.
 *
 * `pagehide` is what separates the two possible causes. It fires when the document goes away
 * with JS still running (navigation, reload, a stray form submit) and cannot fire when the
 * process is killed, so its presence in the stored breadcrumb is the discriminator.
 */
export default function CrashReportBanner() {
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    const report = takeReport(window.localStorage);
    if (report) setMessage(describeReport(report));

    const onHide = () => markUnload(window.localStorage);
    // pagehide, not beforeunload: iOS Safari/WKWebView fire pagehide reliably and
    // beforeunload barely at all.
    window.addEventListener('pagehide', onHide);
    return () => window.removeEventListener('pagehide', onHide);
  }, []);

  if (!message) return null;

  return (
    <div className="crash-report-banner" role="status">
      {/* Selectable: a TestFlight build has no readable console without a Mac. */}
      <span className="crash-report-text">{message}</span>
      <button
        type="button"
        className="crash-report-dismiss"
        onClick={() => setMessage(null)}
        aria-label="Dismiss"
      >
        ×
      </button>
    </div>
  );
}
