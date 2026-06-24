<?php

namespace NWCCheckout\Ajax;

defined( 'ABSPATH' ) || exit;

use NWCCheckout\Lightning\BTCPayBackend;
use NWCCheckout\Gateway\NWC_Gateway;

/**
 * AJAX: create a BTCPay Lightning invoice for an active WC order.
 *
 * Called by JS just before it sends pay_invoice to the wallet relay.
 * Returns bolt11 + internal invoice ID so JS can relay it and PHP can poll.
 */
final class CreateInvoice extends AbstractAjaxHandler {

    protected string $action    = 'nwc_create_invoice';
    protected bool   $nopriv    = true;

    protected function handle(): void {
        $orderId = absint( $_POST['order_id'] ?? 0 );
        if ( ! $orderId ) {
            wp_send_json_error( 'Missing order_id', 400 );
        }

        $order = wc_get_order( $orderId );
        if ( ! $order ) {
            wp_send_json_error( 'Order not found', 404 );
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

        // Reuse existing invoice if we already created one for this order.
        $existingId = $order->get_meta( '_nwc_btcpay_invoice_id', true );
        if ( $existingId ) {
            $invoice = $backend->getInvoice( $existingId );
            if ( ! is_wp_error( $invoice ) && ! $invoice->status->isTerminal() ) {
                wp_send_json_success( [
                    'invoiceId' => $invoice->id,
                    'bolt11'    => $invoice->bolt11,
                ] );
            }
        }

        $amountSat = (int) round( (float) $order->get_total() / $this->getBtcPrice() * 1e8 );
        if ( $amountSat <= 0 ) {
            wp_send_json_error( 'Could not calculate amount in sats', 500 );
        }

        $invoice = $backend->createInvoice(
            $amountSat,
            sprintf( __( 'Order #%s', 'nwc-checkout' ), $order->get_order_number() ),
            (string) $orderId
        );

        if ( is_wp_error( $invoice ) ) {
            wp_send_json_error( $invoice->get_error_message(), 502 );
        }

        $order->update_meta_data( '_nwc_btcpay_invoice_id', $invoice->id );
        $order->save();

        wp_send_json_success( [
            'invoiceId' => $invoice->id,
            'bolt11'    => $invoice->bolt11,
        ] );
    }

    private function getBtcPrice(): float {
        $cached = get_transient( 'nwc_btc_price_' . get_woocommerce_currency() );
        if ( $cached ) {
            return (float) $cached;
        }

        $response = wp_remote_get(
            'https://blockchain.info/ticker',
            [ 'timeout' => 5 ]
        );

        if ( ! is_wp_error( $response ) ) {
            $data     = json_decode( wp_remote_retrieve_body( $response ), true );
            $currency = strtoupper( get_woocommerce_currency() );
            $price    = $data[ $currency ]['last'] ?? 0;
            if ( $price > 0 ) {
                set_transient( 'nwc_btc_price_' . $currency, $price, 60 );
                return (float) $price;
            }
        }

        // Fallback to gateway-configured rate.
        return (float) get_option( 'nwc_checkout_btc_price_fallback', 0 );
    }
}
