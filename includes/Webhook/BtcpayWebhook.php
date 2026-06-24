<?php

namespace NWCCheckout\Webhook;

defined( 'ABSPATH' ) || exit;

use NWCCheckout\Gateway\NWC_Gateway;

/**
 * WP REST endpoint that receives BTCPay invoice notifications.
 *
 * BTCPay calls this URL (set as checkout.notificationUrl on each invoice)
 * whenever an invoice status changes. We re-verify the status via the
 * BTCPay API before marking the WC order as paid - so a spoofed POST
 * cannot forge a completion.
 *
 * URL: /wp-json/nwc-checkout/v1/btcpay-webhook/{token}
 * Token: sha256 of the plugin encryption key (deterministic, no extra storage).
 */
final class BtcpayWebhook {

    public function register(): void {
        add_action( 'rest_api_init', [ $this, 'register_route' ] );
    }

    public function register_route(): void {
        register_rest_route(
            'nwc-checkout/v1',
            '/btcpay-webhook/(?P<token>[a-f0-9]{64})',
            [
                'methods'             => \WP_REST_Server::CREATABLE,
                'callback'            => [ $this, 'handle' ],
                'permission_callback' => '__return_true',
            ]
        );
    }

    public function handle( \WP_REST_Request $request ): \WP_REST_Response {
        // Validate URL token (prevents unauthenticated callers).
        if ( ! hash_equals( self::webhook_token(), $request->get_param( 'token' ) ) ) {
            return new \WP_REST_Response( [ 'error' => 'Invalid token' ], 401 );
        }

        $body = json_decode( $request->get_body(), true );
        if ( ! is_array( $body ) ) {
            return new \WP_REST_Response( [ 'error' => 'Invalid JSON' ], 400 );
        }

        // We care about settlement events only; ignore the rest silently.
        $type = $body['type'] ?? '';
        if ( ! in_array( $type, [ 'InvoiceSettled', 'InvoiceProcessing', 'InvoicePaymentSettled' ], true ) ) {
            return new \WP_REST_Response( [ 'ok' => 'ignored', 'type' => $type ], 200 );
        }

        $invoiceId = $body['invoiceId'] ?? '';
        if ( ! $invoiceId ) {
            return new \WP_REST_Response( [ 'error' => 'Missing invoiceId' ], 400 );
        }

        // Find WC order that owns this invoice.
        $orders = wc_get_orders( [
            'meta_key'   => '_nwc_btcpay_invoice_id',
            'meta_value' => $invoiceId,
            'limit'      => 1,
        ] );

        if ( empty( $orders ) ) {
            return new \WP_REST_Response( [ 'error' => 'Order not found for invoice ' . $invoiceId ], 404 );
        }

        $order = $orders[0];

        if ( $order->is_paid() ) {
            return new \WP_REST_Response( [ 'ok' => 'already paid' ], 200 );
        }

        // Re-verify with BTCPay before completing (prevents spoofed payloads).
        $gateway = new NWC_Gateway();
        $backend = $gateway->getLightningBackend();
        $invoice = $backend->getInvoice( $invoiceId );

        if ( is_wp_error( $invoice ) ) {
            return new \WP_REST_Response( [ 'error' => 'BTCPay verification failed: ' . $invoice->get_error_message() ], 502 );
        }

        if ( ! $invoice->status->isPaid() ) {
            return new \WP_REST_Response( [ 'ok' => 'not yet settled', 'status' => $invoice->status->name ], 200 );
        }

        $order->payment_complete( $invoice->preimage ?? '' );
        $order->add_order_note(
            sprintf(
                /* translators: 1: BTCPay webhook event type, 2: BTCPay invoice ID */
                __( 'Lightning payment confirmed via BTCPay webhook. Type: %1$s. Invoice: %2$s', 'nwc-checkout' ),
                $type,
                $invoiceId
            )
        );

        return new \WP_REST_Response( [ 'ok' => true, 'order' => $order->get_id() ], 200 );
    }

    /**
     * Full webhook URL to register on BTCPay invoices.
     */
    public static function webhook_url(): string {
        return rest_url( 'nwc-checkout/v1/btcpay-webhook/' . self::webhook_token() );
    }

    /**
     * Deterministic token derived from the plugin encryption key.
     */
    public static function webhook_token(): string {
        return hash( 'sha256', (string) get_option( 'nwc_checkout_encryption_key', wp_generate_password( 32, false ) ) );
    }
}
