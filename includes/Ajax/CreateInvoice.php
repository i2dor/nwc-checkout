<?php

namespace NWCCheckout\Ajax;

defined( 'ABSPATH' ) || exit;

use NWCCheckout\Lightning\BTCPayBackend;
use NWCCheckout\Gateway\NWC_Gateway;

/**
 * AJAX: create a BTCPay checkout invoice for an active WC order.
 *
 * Called by JS just before it sends pay_invoice to the wallet relay.
 * Returns bolt11 + internal invoice ID so JS can relay it and PHP can poll.
 */
final class CreateInvoice extends AbstractAjaxHandler {

    protected string $action    = 'nwc_create_invoice';
    protected bool   $nopriv    = true;

    protected function handle(): void {
        // Nonce verified in AbstractAjaxHandler::dispatch() via check_ajax_referer().
        // phpcs:ignore WordPress.Security.NonceVerification.Missing
        $orderId = absint( $_POST['order_id'] ?? 0 );
        if ( ! $orderId ) {
            wp_send_json_error( 'Missing order_id', 400 );
        }

        $order = wc_get_order( $orderId );
        if ( ! $order ) {
            wp_send_json_error( 'Order not found', 404 );
        }

        // For logged-in users, verify the order belongs to them.
        $current_user_id = get_current_user_id();
        if ( $current_user_id && (int) $order->get_customer_id() !== $current_user_id ) {
            wp_send_json_error( 'Order does not belong to current user', 403 );
        }

        if ( $order->get_payment_method() !== 'nwc_checkout' ) {
            wp_send_json_error( 'Wrong payment method', 400 );
        }

        if ( $order->is_paid() ) {
            wp_send_json_success( [ 'already_paid' => true ] );
        }

        $gateway = new NWC_Gateway();
        $backend = $gateway->getLightningBackend();

        if ( ! $backend->isConfigured() ) {
            wp_send_json_error( 'BTCPay not configured', 500 );
        }

        // Reuse existing invoice if we already created one for this order and it is still active.
        $existingId = $order->get_meta( '_nwc_btcpay_invoice_id', true );
        if ( $existingId ) {
            $invoice = $backend->getInvoice( $existingId );
            if ( ! is_wp_error( $invoice ) && ! $invoice->status->isTerminal() ) {
                // Re-fetch BOLT11 in case it was not stored.
                $bolt11 = $backend->getBolt11( $existingId );
                if ( ! is_wp_error( $bolt11 ) && $bolt11 !== '' ) {
                    wp_send_json_success( [
                        'invoiceId' => $invoice->id,
                        'bolt11'    => $bolt11,
                    ] );
                }
            }
        }

        // Create a new BTCPay checkout invoice using the order's fiat total.
        $amount      = (float) $order->get_total();
        $currency    = strtoupper( get_woocommerce_currency() );
        /* translators: %s: order number */
        $description = sprintf( __( 'Order #%s', 'nwc-checkout' ), $order->get_order_number() );

        $invoice = $backend->createInvoiceFromOrder(
            $amount,
            $currency,
            $description,
            (string) $orderId
        );

        if ( is_wp_error( $invoice ) ) {
            wp_send_json_error( $invoice->get_error_message(), 502 );
        }

        if ( empty( $invoice->bolt11 ) ) {
            wp_send_json_error( 'BTCPay did not return a Lightning invoice. Check store Lightning settings.', 502 );
        }

        $order->update_meta_data( '_nwc_btcpay_invoice_id', $invoice->id );
        $order->save();

        wp_send_json_success( [
            'invoiceId' => $invoice->id,
            'bolt11'    => $invoice->bolt11,
        ] );
    }
}
