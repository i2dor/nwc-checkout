<?php

namespace NWCCheckout\Gateway;

defined( 'ABSPATH' ) || exit;

use NWCCheckout\Lightning\BTCPayBackend;
use NWCCheckout\Lightning\LightningBackend;
use NWCCheckout\Store\ConnectionStore;

final class NWC_Gateway extends \WC_Payment_Gateway {

    public function __construct() {
        $this->id                 = 'nwc_checkout';
        $this->method_title       = __( 'NWC Checkout (Lightning)', 'nwc-checkout' );
        $this->method_description = __( 'Accept Lightning payments via Nostr Wallet Connect. Customers connect once, pay with one click.', 'nwc-checkout' );
        $this->has_fields         = true;

        $this->init_form_fields();
        $this->init_settings();

        $this->title       = $this->get_option( 'title', __( 'Lightning (NWC)', 'nwc-checkout' ) );
        $this->description = $this->get_option( 'description', '' );

        add_action( 'woocommerce_update_options_payment_gateways_' . $this->id, [ $this, 'process_admin_options' ] );

        // Render payment fields on checkout.
        add_action( 'woocommerce_checkout_order_processed', [ $this, 'after_order_created' ], 10, 3 );
    }

    public function init_form_fields(): void {
        $this->form_fields = [
            'enabled' => [
                'title'   => __( 'Enable', 'nwc-checkout' ),
                'type'    => 'checkbox',
                'label'   => __( 'Enable NWC Checkout', 'nwc-checkout' ),
                'default' => 'no',
            ],
            'title' => [
                'title'   => __( 'Title', 'nwc-checkout' ),
                'type'    => 'text',
                'default' => __( 'Lightning (NWC)', 'nwc-checkout' ),
            ],
            'description' => [
                'title'   => __( 'Description', 'nwc-checkout' ),
                'type'    => 'textarea',
                'default' => '',
            ],
            'btcpay_url' => [
                'title'       => __( 'BTCPay Server URL', 'nwc-checkout' ),
                'type'        => 'text',
                'placeholder' => 'https://btcpay.example.com',
                'desc_tip'    => true,
                'description' => __( 'Your BTCPay Server instance URL.', 'nwc-checkout' ),
            ],
            'btcpay_api_key' => [
                'title'       => __( 'BTCPay API Key', 'nwc-checkout' ),
                'type'        => 'password',
                'desc_tip'    => true,
                'description' => __( 'Needs btcpay.store.canlightninginvoice + canviewlightninginvoice permissions.', 'nwc-checkout' ),
            ],
            'btcpay_store_id' => [
                'title'    => __( 'BTCPay Store ID', 'nwc-checkout' ),
                'type'     => 'text',
                'desc_tip' => true,
                'description' => __( 'The store ID from BTCPay Server settings.', 'nwc-checkout' ),
            ],
            'relay_timeout' => [
                'title'       => __( 'Relay timeout (seconds)', 'nwc-checkout' ),
                'type'        => 'number',
                'default'     => 15,
                'desc_tip'    => true,
                'description' => __( 'Seconds to wait for wallet response before falling back to QR.', 'nwc-checkout' ),
            ],
        ];
    }

    public function payment_fields(): void {
        $store   = new ConnectionStore();
        $userId  = get_current_user_id();
        $hasConn = $store->has_connection( $userId );

        if ( $hasConn ) {
            include NWC_CHECKOUT_DIR . 'templates/checkout/pay.php';
        } else {
            include NWC_CHECKOUT_DIR . 'templates/checkout/connect.php';
        }
    }

    public function process_payment( $order_id ): array {
        $order = wc_get_order( $order_id );
        if ( ! $order ) {
            return [ 'result' => 'failure' ];
        }

        // Mark pending - JS will handle actual payment and polling.
        $order->update_status( 'pending', __( 'Awaiting Lightning payment via NWC.', 'nwc-checkout' ) );
        wc_reduce_stock_levels( $order_id );
        WC()->cart->empty_cart();

        return [
            'result'   => 'success',
            'redirect' => $this->get_return_url( $order ),
        ];
    }

    public function getLightningBackend(): LightningBackend {
        return new BTCPayBackend(
            serverUrl:  $this->get_option( 'btcpay_url', '' ),
            apiKey:     $this->get_option( 'btcpay_api_key', '' ),
            storeId:    $this->get_option( 'btcpay_store_id', '' ),
        );
    }

    public function after_order_created( int $orderId, array $postedData, \WC_Order $order ): void {
        if ( $order->get_payment_method() !== $this->id ) {
            return;
        }
        // Trigger JS payment flow via a session flag read on the thank-you page.
        WC()->session?->set( 'nwc_pending_order', $orderId );
    }
}
