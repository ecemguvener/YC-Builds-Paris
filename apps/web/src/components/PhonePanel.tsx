import { Phone } from "lucide-react";

const provisionedPhoneNumber = "+1 (415) 555-0198";

export function PhonePanel({ siteName }: { siteName: string }) {
  return (
    <div className="payments-panel-view">
      <header className="site-detail-page__header">
        <div>
          <h1 id="siteDetailTitle">Phone</h1>
          <p className="payments-screen__subtitle">
            {siteName} can place outbound calls through its identity when a task is handled in Chat.
          </p>
        </div>
        <div className="payments-card">
          <Phone size={18} aria-hidden="true" />
          <div>
            <span className="payments-card__brand">{provisionedPhoneNumber}</span>
            <span className="payments-card__meta">mock ElevenLabs · active</span>
          </div>
        </div>
      </header>

      <div className="payments-panel">
        <h2 className="payments-panel__title">Calling capability</h2>
        <dl className="payments-policy">
          <div>
            <dt>Provider</dt>
            <dd>mock ElevenLabs</dd>
          </div>
          <div>
            <dt>Outbound calls</dt>
            <dd>active</dd>
          </div>
          <div>
            <dt>Routing</dt>
            <dd>handled through Chat</dd>
          </div>
        </dl>
      </div>

      <div className="payments-panel">
        <h2 className="payments-panel__title">Call history</h2>
        <p className="payments-empty">No call history yet.</p>
      </div>
    </div>
  );
}
