<?php

namespace NWCCheckout\Ajax;

defined( 'ABSPATH' ) || exit;

use NWCCheckout\Store\ConnectionStore;

/**
 * AJAX: return decrypted connection details to the checkout JS.
 *
 * Only the current user's connection is returned; session isolation
 * is enforced by the nonce + ConnectionStore user-scoping.
 *
 * The clientSecret is returned in plaintext to the browser so JS
 * can perform NIP-44 encryption. This is acceptable because:
 *   1. Channel is HTTPS-only.
 *   2. The key is a scoped NWC key, not the wallet's spending key.
 *   3. The customer generated and chose to share this key with this site.
 */
final class GetConnection extends AbstractAjaxHandler {

    protected string $action = 'nwc_get_connection';
    protected bool   $nopriv = true;

    protected function handle(): void {
        $store = new ConnectionStore();
        $data  = $store->get( get_current_user_id() );

        if ( is_wp_error( $data ) || ! $data ) {
            wp_send_json_error( 'No connection stored', 404 );
        }

        wp_send_json_success( [
            'walletPubkey' => $data['walletPubkey'],
            'relay'        => $data['relay'],
            'clientSecret' => $data['clientSecret'],
            'lud16'        => $data['lud16'] ?? null,
        ] );
    }
}
