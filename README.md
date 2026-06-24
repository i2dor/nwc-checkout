# NWC Checkout for WooCommerce

One-click Lightning payments via [Nostr Wallet Connect](https://nwc.dev) (NIP-47). Customers connect their wallet once — no QR scanning on future purchases.

## Requirements

- WordPress 6.4+, PHP 8.1+, WooCommerce 8.0+
- BTCPay Server with a Lightning node
- BTCPay API key with `btcpay.store.cancreateinvoice` + `btcpay.store.canviewinvoices`

## How it works

1. Customer connects a NWC-compatible wallet (Primal, Alby, Mutiny, etc.) via **My Account > Lightning Wallet**
2. On checkout, the plugin sends the Lightning invoice directly to the wallet via Nostr relay
3. Wallet pays automatically — order completes without the customer lifting a finger
4. BTCPay webhook completes the order server-side if the browser closes before polling finishes

## Installation

> **Note:** This plugin adds its own payment gateway ("Lightning (NWC)") separately from the official BTCPay for WooCommerce plugin. Both can coexist — they operate independently.

1. Upload the plugin to `/wp-content/plugins/nwc-checkout/`
2. Activate via **Plugins > Installed Plugins**
3. Go to **WooCommerce > Settings > Payments > Lightning (NWC)**
4. Enter your BTCPay Server URL, Store ID, and an API key with:
   - `btcpay.store.cancreateinvoice`
   - `btcpay.store.canviewinvoices`

## Encryption

Wallet connections are stored encrypted (AES-256-CBC) in the WordPress database. The plugin auto-detects whether the wallet uses NIP-44 or NIP-04 encryption via the wallet info event (kind 13194).

## Building from source

```bash
npm install
npm run build
```

Output: `assets/js/nwc-checkout.js`

## License

GPL-2.0-or-later
