<?php

namespace NWCCheckout\Ajax;

defined( 'ABSPATH' ) || exit;

use NWCCheckout\Gateway\NWC_Gateway;
use NWCCheckout\Lightning\InvoiceStatus;

/**
 * AJAX: poll BTCPay invoice status.
 *
 * Called by JS every few seconds after sending pay_invoice to the relay.
 * When paid, marks the WC order as processing.
 */
final class PollInvoice extends AbstractAjaxHandler {

    protected string $action = 'nwc_poll_invoice';
    protected bool   $nopriv = true;

    protected function handle(): void {
        // Nonce verified in AbstractAjaxHandler::dispatch() via check_ajax_referer().
        // phpcs:disable WordPress.Security.NonceVerification.Missing
        $orderId   = absint( $_POST['order_id'] ?? 0 );
        $invoiceId = sanitize_text_field( wp_unslash( $_POST['invoice_id'] ?? '' ) );
        // phpcs:enable WordPress.Security.NonceVerification.Missing

        if ( ! $orderId || ! $invoiceId ) {
            wp_send_json_error( 'Missing parameters', 400 );
        }

        $order = wc_get_order( $orderId );
        if ( ! $order || $order->get_meta( '_nwc_btcpay_invoice_id', true ) !== $invoiceId ) {
            wp_send_json_error( 'Order/invoice mismatch', 403 );
        }

        if ( $order->is_paid() ) {
            wp_send_json_success( [ 'status' => 'paid' ] );
        }

        $gateway = new NWC_Gateway();
        $backend = $gateway->getLightningBackend();
        $invoice = $backend->getInvoice( $invoiceId );

        if ( is_wp_error( $invoice ) ) {
            wp_send_json_error( $invoice->get_error_message(), 502 );
        }

        if ( $invoice->status->isPaid() ) {
            $order->payment_complete( $invoice->preimage ?? '' );
            $order->add_order_note(
                sprintf(
                    /* translators: %s: BTCPay invoice ID */
                    __( 'Lightning payment confirmed via NWC. Invoice: %s', 'nwc-checkout' ),
                    $invoiceId
                )
            );
            wp_send_json_success( [ 'status' => 'paid' ] );
        }

        if ( $invoice->status === InvoiceStatus::Expired ) {
            wp_send_json_success( [ 'status' => 'expired' ] );
        }

        wp_send_json_success( [ 'status' => 'pending' ] );
    }
}
