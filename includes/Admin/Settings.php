<?php

namespace NWCCheckout\Admin;

defined( 'ABSPATH' ) || exit;

use NWCCheckout\Gateway\NWC_Gateway;

/**
 * Registers the admin-only "Test BTCPay connection" AJAX handler.
 * Called from nwc-admin.js on the WooCommerce settings page.
 */
final class Settings {

    public function register(): void {
        add_action( 'wp_ajax_nwc_test_connection', [ $this, 'testConnection' ] );
    }

    public function testConnection(): void {
        check_ajax_referer( 'nwc_admin', 'nonce' );

        if ( ! current_user_can( 'manage_woocommerce' ) ) {
            wp_send_json_error( 'Unauthorized', 403 );
        }

        $gateway = new NWC_Gateway();
        $backend = $gateway->getLightningBackend();

        if ( ! $backend->isConfigured() ) {
            wp_send_json_error( 'BTCPay URL, API key, or Store ID is missing.' );
        }

        // Try fetching a non-existent invoice - a 404 from BTCPay means auth worked.
        $result = $backend->getInvoice( 'nwc-ping-' . time() );

        if ( is_wp_error( $result ) ) {
            $code    = $result->get_error_data()['status'] ?? 0;
            $message = $result->get_error_message();

            // 404 = endpoint reachable + auth passed (invoice just doesn't exist).
            if ( $code === 404 ) {
                wp_send_json_success( [
                    'message' => sprintf(
                        'Connected to %s. Lightning endpoint reachable.',
                        $backend->label()
                    ),
                ] );
            }

            // 401/403 = auth failed.
            if ( $code === 401 || $code === 403 ) {
                wp_send_json_error( 'Authentication failed. Check your API key and permissions.' );
            }

            wp_send_json_error( "BTCPay error ($code): $message" );
        }

        wp_send_json_success( [ 'message' => 'Connected. ' . $backend->label() ] );
    }
}
