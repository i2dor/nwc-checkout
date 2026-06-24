<?php

namespace NWCCheckout\Ajax;

defined( 'ABSPATH' ) || exit;

use NWCCheckout\Nip47\Connection;
use NWCCheckout\Store\ConnectionStore;

/**
 * AJAX: validate and persist a nostr+walletconnect:// URI pasted by the customer.
 */
final class SaveConnection extends AbstractAjaxHandler {

    protected string $action = 'nwc_save_connection';
    protected bool   $nopriv = true;

    protected function handle(): void {
        $uri = sanitize_text_field( $_POST['uri'] ?? '' );
        if ( ! str_starts_with( $uri, 'nostr+walletconnect://' ) ) {
            wp_send_json_error( __( 'Invalid connection URI.', 'nwc-checkout' ), 400 );
        }

        $connection = Connection::parse( $uri );
        if ( is_wp_error( $connection ) ) {
            wp_send_json_error( $connection->get_error_message(), 400 );
        }

        $store  = new ConnectionStore();
        $result = $store->save( get_current_user_id(), $connection->toArray() );

        if ( is_wp_error( $result ) ) {
            wp_send_json_error( $result->get_error_message(), 500 );
        }

        wp_send_json_success( [
            'relay'    => $connection->relay,
            'lud16'    => $connection->lud16,
        ] );
    }
}
