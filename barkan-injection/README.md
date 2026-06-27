# Barkan Injection

Unpacked Chrome extension for injecting Barkan into allowed HTTPS pages:

- `https://platform.openai.com/*`
- `https://mail.google.com/*`
- `https://notion.so/*`
- `https://www.notion.so/*`

## Why this extension proxies requests

The normal snippet points at an HTTP Tailscale address:

```html
<script async src="https://100.81.152.74:4001/widget.js" data-barkan-site="site_3qS7_idTrWUdS4rtbEzlBor9mfmJeUdD"></script>
```

Chrome blocks HTTP active content on an HTTPS page before CORS is involved. This extension loads the widget as local extension code, then proxies Barkan API requests through the extension background worker to the allowed local/Tailscale origins.

## Install

1. Open `chrome://extensions`.
2. Enable Developer mode.
3. Click `Load unpacked`.
4. Select this `barkan-injection` folder.
5. Open or refresh an allowed page, such as `https://platform.openai.com/`, `https://mail.google.com/`, or `https://www.notion.so/`.

The content script inserts a non-executing placeholder script with the original `data-barkan-site`, then runs the bundled widget. The widget should appear on allowed pages and use `Alt+C` as usual.

## Automation Authorization

Automation mode shows an inline Gmail authorization card in the chat. No OAuth values are required: clicking `Authorize Gmail` shows a 0.5s loading state, marks Gmail as authorized, and continues the deployment sequence.

## Update The Widget

If the main widget changes, rebuild/copy it again:

```sh
npm --workspace @barkan/widget run build
cp packages/widget/dist/widget.js barkan-injection/vendor/barkan-widget.js
```

Then click the reload button for the unpacked extension in `chrome://extensions` and refresh the target tab. Chrome keeps the previous content script running until the extension is reloaded.
