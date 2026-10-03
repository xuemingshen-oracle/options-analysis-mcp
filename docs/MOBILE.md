# Option Atlas on your phone

Option Atlas keeps the same green visual theme on phones, with larger touch
controls and separate **Position**, **Analysis**, and **Plan & saves** sections.
The bottom action calculates your changes and takes you to the results. Option
legs collapse into summaries so that longer positions remain manageable. The
desktop workbench continues to show its broader layout.

## Start on your computer

From the repository, the usual command remains:

```sh
.venv/bin/options-analysis-web
```

Visit **http://127.0.0.1:8000** on that computer. The default listens only on
the computer itself.

To open the app on a phone connected to the **same trusted Wi-Fi network**, stop
the server with Ctrl+C and restart it with explicit network access:

```sh
.venv/bin/options-analysis-web --host 0.0.0.0
```

On your Mac, find its local IP address in **System Settings → Wi-Fi → Details →
TCP/IP**. For example, if the address is `192.168.1.25`, open
**http://192.168.1.25:8000** in Safari on your phone. Use your actual address.
`0.0.0.0` is the listening setting, not the address to enter in Safari;
`127.0.0.1` on your phone refers to the phone, not your Mac.

Keep the computer awake and the server running. If the page does not open,
check that both devices use the same network, that the Mac firewall permits
the Python server, and that your Wi-Fi does not isolate devices from each
other. A guest network may prevent this connection. If your computer's local
IP address changes, reopen the app at its new address and update the shortcut.

An optional port is supported, for example
`.venv/bin/options-analysis-web --host 0.0.0.0 --port 8080`; use the same port in
the phone's address. `--help` lists the options.

The server has no authentication. Network binding makes it available to other
devices that can reach that computer; use a trusted network. Do not forward
its port to the public internet. Access away from home needs a separate access
setup; a public deployment would also need authentication and HTTPS.

## Add it to your iPhone Home Screen

1. Open the working Option Atlas address in **Safari** on your iPhone.
2. Open **Share**, then **Add to Home Screen**. If it is not listed, use
   **Edit Actions** to add the action.
3. Leave **Open as Web App** enabled if your iOS version shows that option.
4. Keep the name **Option Atlas** and tap **Add**.

Launch the new icon to open the app in its own window. These steps follow
[Apple's iPhone guide](https://support.apple.com/guide/iphone/open-as-web-app-iphea86e5236/ios).
The app supplies a manifest, Home Screen icons, standalone display metadata,
and safe-area spacing for phones with a home indicator or display cutout.

Adding an icon does not move the Python server onto your phone. Pricing,
scenario analysis, and market data still need the running server. This version
does not provide offline calculations or offline page caching. The same-network
setup therefore remains dependent on your computer and Wi-Fi after installation.

## A comfortable mobile workflow

1. In **Position**, enter the underlying, spot, valuation date, and legs. Tap a
   leg summary to edit it. Numeric fields use an appropriate phone keyboard;
   option dates use the browser's date picker.
2. Tap **Analyze position**. **Analysis** shows the risk summary and payoff
   graph, followed by price/date scenarios and review findings. **View analysis**
   returns to existing results when the inputs have not changed.
3. Use **Plan & saves** to record your thesis and review date, save a named setup,
   and export a backup or review brief.

Wide analysis tables scroll horizontally within their own area. The page stays
within the screen. Appearance and text-size settings also remain available.

Saved setups and the current draft live in browser storage for that address.
Your phone, your Mac, and a different port or address have separate libraries;
the Home Screen app may also have its own storage context. Use **Export backup**
and **Import backup** to carry a setup library between them. Export before
changing the address, clearing website data, or removing the installed app.

## Mobile development and checks

```sh
cd ui
npm ci
npx playwright install chromium webkit
npm run test:e2e
```

The existing desktop suite runs in Chromium. Dedicated mobile tests run with
an iPhone/WebKit profile and an Android/Chromium profile. To run only mobile:

```sh
cd ui
npm run build
npx playwright test --project=mobile-safari --project=mobile-chrome
```

When keeping downloaded test browsers outside the normal cache, prefix both
the install and test commands with
`PLAYWRIGHT_BROWSERS_PATH=/tmp/options-analysis-browsers`.

The tests cover touch-oriented editing and analysis, 16px minimum text in input
controls, primary target sizes, narrow/landscape layouts, a reduced-height
editing viewport, simulated keyboard visibility, settings, saved plans,
backup/import, large-position chart labels, and manifest/icon delivery. These
are browser simulations; the native Safari share sheet, installation flow,
physical screen cutouts, and
actual iOS software keyboard still require a real-device check.
