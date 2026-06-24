=== NWC Checkout for WooCommerce ===
Contributors: i2dor
Tags: lightning, bitcoin, nostr, woocommerce, payment gateway
Requires at least: 6.4
Tested up to: 7.0
Stable tag: 1.1.1
Requires PHP: 8.1
License: GPL-2.0-or-later
License URI: https://www.gnu.org/licenses/gpl-2.0.html

One-click Lightning payments via Nostr Wallet Connect. Customers connect once - no QR scanning on future purchases.

== Description ==

NWC Checkout adds a Lightning Network payment gateway to WooCommerce using the [Nostr Wallet Connect](https://nwc.dev) protocol (NIP-47).

**How it works**

1. Customer connects their NWC-compatible wallet once (Primal, Alby, Mutiny, etc.) via a `nostr+walletconnect://` URI.
2. On future checkouts, payment is sent automatically in the background - no QR code scanning required.
3. The order is marked complete as soon as the Lightning invoice is settled.

**Requirements**

* A BTCPay Server instance with a Lightning node (creates invoices and settles payments).
* A BTCPay API key with `btcpay.store.cancreateinvoice` and `btcpay.store.canviewinvoices` permissions.

**Supported wallets**

Any NIP-47 compliant wallet, including:

* [Primal](https://primal.net) (NIP-04 encryption)
* [Alby](https://getalby.com) (NIP-04 encryption)
* [Mutiny](https://mutinywallet.com) (NIP-44 encryption)

The plugin auto-detects the wallet's preferred encryption (NIP-44 or NIP-04) via the wallet info event (kind 13194), so it works with any compliant wallet without manual configuration.

**Features**

* One-click payment flow for returning customers
* QR code fallback for customers without an NWC wallet or guests
* BTCPay Server webhook integration: orders complete server-side, independent of browser
* Auto-detection of NIP-44 vs NIP-04 encryption
* HPOS (High-Performance Order Storage) compatible

== Installation ==

1. Upload the `nwc-checkout` folder to `/wp-content/plugins/`.
2. Activate the plugin through the **Plugins** menu in WordPress.
3. Go to **WooCommerce > Settings > Payments** and enable **Lightning (NWC)**.
4. Enter your BTCPay Server URL, API key, and Store ID.
5. Save settings.

Customers can connect their NWC wallet via **My Account > Lightning Wallet**.

== Frequently Asked Questions ==

= Which Lightning backends are supported? =

Currently BTCPay Server via the Greenfield API. Support for additional backends (LNbits, phoenixd) is planned.

= Do I need a BTCPay Server? =

Yes. BTCPay Server creates the Lightning invoices and handles payment settlement. You need a BTCPay instance with a Lightning node configured.

= What permissions does the BTCPay API key need? =

`btcpay.store.cancreateinvoice` and `btcpay.store.canviewinvoices`. No other permissions are required.

= Is the NWC connection stored securely? =

Yes. The `nostr+walletconnect://` URI is encrypted using AES-256-CBC before being stored in the WordPress database. The encryption key is generated on activation and stored as a WordPress option.

= Does it work for guest checkouts? =

Guests see a QR code fallback. NWC one-click payment requires a user account to store the wallet connection.

= Which Nostr relays are used? =

The relay is specified in the wallet's NWC URI. No relay is hardcoded - the plugin connects to whatever relay the customer's wallet advertises.

== Changelog ==

= 1.1.1 =
* Auto-detect wallet encryption (NIP-44 vs NIP-04) via kind 13194 wallet info event.
* Default to NIP-04 when wallet does not advertise a preference (Primal/Alby compatibility).
* Subscribe for response before publishing request to avoid relay race condition.

= 1.1.0 =
* Switch request encryption to NIP-04 for Primal compatibility.
* Add NIP-44 / NIP-04 dual-attempt decryption for responses.
* Extend polling timeout to 60 minutes.

= 1.0.9 =
* BTCPay webhook: complete orders server-side on invoice settlement.
* Fix thank-you page showing "cannot be paid" when webhook completes order before page loads.

= 1.0.6 =
* Switch to BTCPay Checkout Invoice API (invoices now appear in BTCPay dashboard).
* Fix payment-methods field name (`paymentMethodId` vs `paymentMethod`).

= 1.0.0 =
* Initial release.

== Upgrade Notice ==

= 1.1.1 =
Improves compatibility with all NWC wallets by auto-detecting encryption. Update recommended.
