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
import { nip44, nip04 } from 'nostr-tools';
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
  // NIP-44 browser self-test (remove after debugging)
  try {
    const _k = nip44.getConversationKey(
      hexToBytes( '0000000000000000000000000000000000000000000000000000000000000001' ),
      '79be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798'
    );
    const _e = nip44.encrypt( 'test', _k );
    const _d = nip44.decrypt( _e, _k );
    console.log( '[NWC] NIP-44 self-test:', _d === 'test' ? 'PASS' : 'FAIL' );
  } catch ( _err ) {
    console.log( '[NWC] NIP-44 self-test FAIL:', _err.message );
  }

  mountConnectForm();
  mountPayButton();
  mountDisconnectButton();
  interceptCheckoutSubmit();

  // PHP detected a pending NWC order on the order-received page - auto-pay.
  if ( cfg.autoOrderId ) {
    runPaymentFlowForOrder( String( cfg.autoOrderId ) );
  } else {
    // TY page hook rendered #nwc-ty-wrap with the order ID.
    const tyWrap = document.getElementById( 'nwc-ty-wrap' );
    if ( tyWrap?.dataset.orderId ) {
      runPaymentFlowForOrder( tyWrap.dataset.orderId );
    }
  }
} );

// ---------------------------------------------------------------------------
// "Connect wallet" form
// ---------------------------------------------------------------------------
function mountConnectForm() {
  // Use event delegation - WooCommerce re-renders payment fields via AJAX
  // (update_checkout), replacing DOM nodes and invalidating direct listeners.

  async function handleConnect() {
    const btn    = document.getElementById( 'nwc-connect-btn' );
    const input  = document.getElementById( 'nwc-uri-input' );
    const status = document.getElementById( 'nwc-connect-status' );
    if ( ! input ) return;

    const uri = input.value.trim();

    if ( ! uri.startsWith( 'nostr+walletconnect://' ) ) {
      showStatus( status, cfg.i18n.error, 'error' );
      return;
    }

    if ( btn ) btn.disabled = true;
    const res = await ajax( 'nwc_save_connection', { uri } );
    if ( btn ) btn.disabled = false;

    if ( res.success ) {
      cfg.hasConnection = true;
      document.getElementById( 'nwc-connect-form' )
        ?.closest( '.nwc-connect-wrap' )?.remove();
      mountPayButton( true );
    } else {
      showStatus( status, res.data || cfg.i18n.error, 'error' );
    }
  }

  // Delegated click on the Connect button.
  document.body.addEventListener( 'click', ( e ) => {
    if ( e.target.closest( '#nwc-connect-btn' ) ) handleConnect();
  } );

  // Delegated Enter key in the URI input.
  document.body.addEventListener( 'keydown', ( e ) => {
    if ( e.key === 'Enter' && e.target.id === 'nwc-uri-input' ) {
      e.preventDefault();
      handleConnect();
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
    let walletResponse;
    try {
      walletResponse = await sendViaRelay( conn, bolt11 );
    } catch ( relayErr ) {
      // Timeout or WS error: show QR and keep polling (wallet may still pay in background).
      await showQRFallback( relayErr.__bolt11 ?? bolt11, status );
      await pollUntilPaid( orderId, invoiceId, status );
      return;
    }

    if ( walletResponse?.error ) {
      // Wallet returned an error (e.g. insufficient funds).
      throw new Error( walletResponse.error.message || cfg.i18n.error );
    }

    // 4. Poll BTCPay until confirmed or timeout.
    showStatus( status, cfg.i18n.waitingWallet, 'loading' );
    await pollUntilPaid( orderId, invoiceId, status );

  } catch ( err ) {
    console.error( '[NWC Checkout]', err );
    showStatus( status, err.message || cfg.i18n.error, 'error' );
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

  const dbg = ( ...a ) => console.log( '[NWC]', ...a );

  return new Promise( ( resolve, reject ) => {
    dbg( 'Connecting to relay', conn.relay );
    const ws = new WebSocket( conn.relay );
    let settled = false;
    const timeout = setTimeout( () => {
      if ( settled ) return;
      settled = true;
      ws.close();
      dbg( 'Timeout - no response from wallet after', cfg.relayTimeout ?? 15000, 'ms' );
      const err = new Error( cfg.i18n.fallback );
      err.__bolt11 = bolt11;
      reject( err );
    }, cfg.relayTimeout ?? 15000 );

    ws.addEventListener( 'open', () => {
      dbg( 'WS open, sending EVENT kind 23194, id:', event.id );
      // Publish request.
      ws.send( JSON.stringify( [ 'EVENT', event ] ) );
      // Subscribe for response: kind 23195 tagged to our pubkey for this event.
      ws.send( JSON.stringify( [
        'REQ',
        'nwc-res',
        { kinds: [ 23195 ], '#p': [ clientPubkey ], '#e': [ event.id ] },
      ] ) );
      dbg( 'REQ sent - clientPubkey:', clientPubkey, 'eventId:', event.id );
    } );

    ws.addEventListener( 'message', async ( msg ) => {
      dbg( 'WS message:', msg.data );
      let parsed;
      try { parsed = JSON.parse( msg.data ); } catch { return; }

      if ( ! Array.isArray( parsed ) || parsed[ 0 ] !== 'EVENT' ) return;

      const responseEvent = parsed[ 2 ];
      if ( responseEvent?.kind !== 23195 ) return;

      let response;
      const eventPubkey = responseEvent.pubkey ?? '';
      dbg( 'response event pubkey:', eventPubkey );
      dbg( 'walletPubkey:', walletPubkey );
      dbg( 'content prefix:', responseEvent.content?.slice( 0, 4 ), 'len:', responseEvent.content?.length );

      // Candidate sender pubkeys: the one from NWC URI and the event's actual pubkey.
      // Some wallets (e.g. Primal) may sign responses from a different keypair.
      const candidates = [ walletPubkey ];
      if ( eventPubkey && eventPubkey !== walletPubkey ) {
        candidates.push( eventPubkey );
      }

      let decryptOk = false;
      for ( const senderPubkey of candidates ) {
        // Try NIP-44.
        try {
          const convKey   = nip44.getConversationKey( clientSecretBytes, senderPubkey );
          const decrypted = nip44.decrypt( responseEvent.content, convKey );
          response = JSON.parse( decrypted );
          dbg( 'Decrypted (NIP-44, sender=' + senderPubkey.slice( 0, 8 ) + '):', response );
          decryptOk = true;
          break;
        } catch ( e1 ) {
          dbg( 'NIP-44 failed (sender=' + senderPubkey.slice( 0, 8 ) + '):', e1.message );
        }
        // Try NIP-04.
        try {
          const decrypted = await nip04.decrypt( conn.clientSecret, senderPubkey, responseEvent.content );
          response = JSON.parse( decrypted );
          dbg( 'Decrypted (NIP-04, sender=' + senderPubkey.slice( 0, 8 ) + '):', response );
          decryptOk = true;
          break;
        } catch ( e2 ) {
          dbg( 'NIP-04 failed (sender=' + senderPubkey.slice( 0, 8 ) + '):', e2.message );
        }
      }

      if ( ! decryptOk ) {
        dbg( 'All decrypt attempts failed - cannot read wallet response' );
        return;
      }

      if ( ! settled ) {
        settled = true;
        clearTimeout( timeout );
        ws.close();
        resolve( response );
      }
    } );

    ws.addEventListener( 'error', ( e ) => {
      dbg( 'WS error:', e );
      if ( settled ) return;
      settled = true;
      clearTimeout( timeout );
      const err = new Error( cfg.i18n.fallback );
      err.__bolt11 = bolt11;
      reject( err );
    } );

    ws.addEventListener( 'close', ( e ) => {
      dbg( 'WS closed, code:', e.code, 'reason:', e.reason );
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
  const container = document.querySelector( '.nwc-pay-wrap' ) ?? document.getElementById( 'nwc-ty-wrap' );
  container?.appendChild( el );
  return el;
}

function sleep( ms ) {
  return new Promise( r => setTimeout( r, ms ) );
}

function reloadAfterDelay( ms = 2000 ) {
  setTimeout( () => location.reload(), ms );
}
