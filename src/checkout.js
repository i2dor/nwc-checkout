/**
 * NWC Checkout - checkout page script (source, built via `npm run build`)
 *
 * Responsibilities:
 *  - "Connect wallet" UI: accept paste of nostr+walletconnect:// URI
 *  - "Pay" UI: create invoice, send pay_invoice via NWC relay, poll status
 *  - Fallback: show BOLT11 QR if relay does not respond within timeout
 */

import {
  getPublicKey,
  finalizeEvent,
} from 'nostr-tools/pure';
import { nip44 } from 'nostr-tools';
import { SimplePool } from 'nostr-tools/pool';
import { hexToBytes } from '@noble/hashes/utils';
import QRCode from 'qrcode';

// ---------------------------------------------------------------------------
// Globals injected via wp_localize_script
// ---------------------------------------------------------------------------
const cfg = window.NWCCheckout || {};

// ---------------------------------------------------------------------------
// Bootstrap
// ---------------------------------------------------------------------------
document.addEventListener( 'DOMContentLoaded', () => {
  mountConnectForm();
  mountPayButton();
  mountDisconnectButton();
  interceptCheckoutSubmit();
} );

// ---------------------------------------------------------------------------
// "Connect wallet" form
// ---------------------------------------------------------------------------
function mountConnectForm() {
  const form = document.getElementById( 'nwc-connect-form' );
  if ( ! form ) return;

  form.addEventListener( 'submit', async ( e ) => {
    e.preventDefault();
    const uri    = form.querySelector( '#nwc-uri-input' )?.value?.trim() ?? '';
    const status = form.querySelector( '#nwc-connect-status' );

    if ( ! uri.startsWith( 'nostr+walletconnect://' ) ) {
      showStatus( status, cfg.i18n.error, 'error' );
      return;
    }

    setLoading( form, true );
    const res = await ajax( 'nwc_save_connection', { uri } );
    setLoading( form, false );

    if ( res.success ) {
      cfg.hasConnection = true;
      form.closest( '.nwc-connect-wrap' )?.remove();
      mountPayButton( true );
    } else {
      showStatus( status, res.data || cfg.i18n.error, 'error' );
    }
  } );
}

// ---------------------------------------------------------------------------
// Disconnect button (checkout pay template + My Account tab)
// ---------------------------------------------------------------------------
function mountDisconnectButton() {
  const btn = document.getElementById( 'nwc-disconnect-btn' );
  if ( ! btn ) return;

  btn.addEventListener( 'click', async () => {
    if ( ! confirm( 'Disconnect your Lightning wallet from this site?' ) ) return;

    btn.disabled = true;
    const res = await ajax( 'nwc_delete_connection' );
    if ( res.success ) {
      cfg.hasConnection = false;
      location.reload();
    } else {
      btn.disabled = false;
    }
  } );
}

// ---------------------------------------------------------------------------
// "Pay with connected wallet" button (shown once connection is saved)
// ---------------------------------------------------------------------------
function mountPayButton( freshlyConnected = false ) {
  const btn = document.getElementById( 'nwc-pay-btn' );
  if ( ! btn ) return;

  if ( freshlyConnected ) {
    btn.closest( '.nwc-pay-wrap' )?.classList.remove( 'hidden' );
  }

  btn.addEventListener( 'click', async ( e ) => {
    e.preventDefault();
    await runPaymentFlow( btn );
  } );
}

// ---------------------------------------------------------------------------
// Intercept WooCommerce AJAX checkout so we can auto-trigger NWC payment
// after the order is created on the thank-you / order-pay page.
// ---------------------------------------------------------------------------
function interceptCheckoutSubmit() {
  document.body.addEventListener( 'click', ( e ) => {
    const btn = e.target.closest( '#place_order' );
    if ( ! btn ) return;

    const gateway = document.querySelector( '#payment_method_nwc_checkout' );
    if ( ! gateway?.checked ) return;

    if ( ! cfg.hasConnection ) return; // Let native checkout handle connect flow.

    // WooCommerce processes the order via its own AJAX and redirects to
    // the order-received page. We attach a one-time handler to trigger
    // NWC payment as soon as the thank-you page loads.
    sessionStorage.setItem( 'nwc_autoplay', '1' );
  } );

  // On thank-you page: check for pending order.
  const orderId = getOrderIdFromUrl();
  if ( orderId && sessionStorage.getItem( 'nwc_autoplay' ) ) {
    sessionStorage.removeItem( 'nwc_autoplay' );
    runPaymentFlowForOrder( orderId );
  }
}

// ---------------------------------------------------------------------------
// Core payment flow
// ---------------------------------------------------------------------------
async function runPaymentFlow( triggerEl = null ) {
  const orderId = getOrderIdFromUrl();
  if ( ! orderId ) return;
  await runPaymentFlowForOrder( orderId, triggerEl );
}

async function runPaymentFlowForOrder( orderId, triggerEl = null ) {
  const status = document.getElementById( 'nwc-pay-status' ) ?? createStatusEl();

  try {
    // 1. Create invoice.
    showStatus( status, cfg.i18n.connecting, 'loading' );
    const invoiceRes = await ajax( 'nwc_create_invoice', { order_id: orderId } );
    if ( ! invoiceRes.success ) throw new Error( invoiceRes.data );

    if ( invoiceRes.data.already_paid ) {
      showStatus( status, cfg.i18n.paid, 'success' );
      reloadAfterDelay();
      return;
    }

    const { invoiceId, bolt11 } = invoiceRes.data;

    // 2. Get connection details.
    const connRes = await ajax( 'nwc_get_connection' );
    if ( ! connRes.success ) throw new Error( 'No wallet connection found.' );
    const conn = connRes.data;

    // 3. Send pay_invoice via NWC relay.
    showStatus( status, cfg.i18n.paying, 'loading' );
    const relayResult = await sendViaRelay( conn, bolt11 );

    if ( relayResult.error ) {
      // Wallet returned an error (e.g. insufficient funds).
      throw new Error( relayResult.error.message || cfg.i18n.error );
    }

    // 4. Poll BTCPay until confirmed or timeout.
    showStatus( status, cfg.i18n.waitingWallet, 'loading' );
    await pollUntilPaid( orderId, invoiceId, status );

  } catch ( err ) {
    console.error( '[NWC Checkout]', err );

    // Fallback: show QR if we have bolt11.
    if ( err.__bolt11 ) {
      showQRFallback( err.__bolt11, status );
    } else {
      showStatus( status, err.message || cfg.i18n.error, 'error' );
    }
  }
}

// ---------------------------------------------------------------------------
// NWC relay communication
// ---------------------------------------------------------------------------
async function sendViaRelay( conn, bolt11 ) {
  const clientSecretBytes = hexToBytes( conn.clientSecret );
  const clientPubkey      = getPublicKey( clientSecretBytes );
  const walletPubkey      = conn.walletPubkey;

  const payload = JSON.stringify( {
    method: 'pay_invoice',
    params: { invoice: bolt11 },
  } );

  const encryptedContent = nip44.encrypt( payload, nip44.getConversationKey( clientSecretBytes, walletPubkey ) );

  const event = finalizeEvent(
    {
      kind:       23194,
      created_at: Math.floor( Date.now() / 1000 ),
      tags:       [ [ 'p', walletPubkey ] ],
      content:    encryptedContent,
    },
    clientSecretBytes
  );

  return new Promise( ( resolve, reject ) => {
    const ws = new WebSocket( conn.relay );
    let settled = false;
    const timeout = setTimeout( () => {
      if ( settled ) return;
      settled = true;
      ws.close();
      const err = new Error( cfg.i18n.fallback );
      err.__bolt11 = bolt11;
      reject( err );
    }, cfg.relayTimeout ?? 15000 );

    ws.addEventListener( 'open', () => {
      // Publish request.
      ws.send( JSON.stringify( [ 'EVENT', event ] ) );
      // Subscribe for response: kind 23195 tagged to our pubkey for this event.
      ws.send( JSON.stringify( [
        'REQ',
        'nwc-res',
        { kinds: [ 23195 ], '#p': [ clientPubkey ], '#e': [ event.id ] },
      ] ) );
    } );

    ws.addEventListener( 'message', ( msg ) => {
      let parsed;
      try { parsed = JSON.parse( msg.data ); } catch { return; }

      if ( ! Array.isArray( parsed ) || parsed[ 0 ] !== 'EVENT' ) return;

      const responseEvent = parsed[ 2 ];
      if ( responseEvent?.kind !== 23195 ) return;

      let response;
      try {
        const convKey  = nip44.getConversationKey( clientSecretBytes, walletPubkey );
        const decrypted = nip44.decrypt( responseEvent.content, convKey );
        response = JSON.parse( decrypted );
      } catch ( e ) {
        return;
      }

      if ( ! settled ) {
        settled = true;
        clearTimeout( timeout );
        ws.close();
        resolve( response );
      }
    } );

    ws.addEventListener( 'error', () => {
      if ( settled ) return;
      settled = true;
      clearTimeout( timeout );
      const err = new Error( cfg.i18n.fallback );
      err.__bolt11 = bolt11;
      reject( err );
    } );
  } );
}

// ---------------------------------------------------------------------------
// Polling
// ---------------------------------------------------------------------------
async function pollUntilPaid( orderId, invoiceId, statusEl ) {
  const deadline = Date.now() + ( cfg.pollTimeout ?? 90000 );
  const interval = cfg.pollInterval ?? 3000;

  while ( Date.now() < deadline ) {
    await sleep( interval );
    const res = await ajax( 'nwc_poll_invoice', { order_id: orderId, invoice_id: invoiceId } );
    if ( ! res.success ) continue;

    if ( res.data.status === 'paid' ) {
      showStatus( statusEl, cfg.i18n.paid, 'success' );
      reloadAfterDelay( 1500 );
      return;
    }

    if ( res.data.status === 'expired' ) {
      throw new Error( 'Invoice expired.' );
    }
  }

  throw new Error( 'Payment confirmation timed out.' );
}

// ---------------------------------------------------------------------------
// QR fallback
// ---------------------------------------------------------------------------
async function showQRFallback( bolt11, statusEl ) {
  showStatus( statusEl, cfg.i18n.fallback, 'warning' );

  const wrap = document.getElementById( 'nwc-qr-fallback' ) ?? document.createElement( 'div' );
  wrap.id = 'nwc-qr-fallback';
  wrap.innerHTML = '';

  const canvas = document.createElement( 'canvas' );
  wrap.appendChild( canvas );

  const copyBtn = document.createElement( 'button' );
  copyBtn.type        = 'button';
  copyBtn.textContent = 'Copy invoice';
  copyBtn.className   = 'button nwc-copy-btn';
  copyBtn.addEventListener( 'click', () => {
    navigator.clipboard.writeText( bolt11 ).then( () => {
      copyBtn.textContent = 'Copied!';
      setTimeout( () => { copyBtn.textContent = 'Copy invoice'; }, 2000 );
    } );
  } );
  wrap.appendChild( copyBtn );

  statusEl?.after( wrap );

  await QRCode.toCanvas( canvas, bolt11.toUpperCase(), { width: 300, margin: 2 } );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function ajax( action, data = {} ) {
  const body = new URLSearchParams( {
    action,
    nonce: cfg.nonce,
    ...data,
  } );
  return fetch( cfg.ajaxUrl, { method: 'POST', body } ).then( r => r.json() );
}

function getOrderIdFromUrl() {
  // Works on /checkout/order-received/{id}/ and /checkout/order-pay/{id}/
  const m = location.pathname.match( /order-(?:received|pay)\/(\d+)\// );
  return m ? m[ 1 ] : null;
}

function showStatus( el, message, type ) {
  if ( ! el ) return;
  el.textContent  = message;
  el.className    = `nwc-status nwc-status--${type}`;
  el.style.display = 'block';
}

function setLoading( form, loading ) {
  const btn = form.querySelector( '[type="submit"]' );
  if ( btn ) btn.disabled = loading;
}

function createStatusEl() {
  const el = document.createElement( 'p' );
  el.id = 'nwc-pay-status';
  document.querySelector( '.nwc-pay-wrap' )?.appendChild( el );
  return el;
}

function sleep( ms ) {
  return new Promise( r => setTimeout( r, ms ) );
}

function reloadAfterDelay( ms = 2000 ) {
  setTimeout( () => location.reload(), ms );
}
