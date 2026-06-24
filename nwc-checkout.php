<?php
/**
 * Plugin Name: NWC Checkout for WooCommerce
 * Plugin URI:  https://github.com/i2dor/nwc-checkout
 * Description: One-click Lightning payments via Nostr Wallet Connect (NIP-47). Customers connect their wallet once - no QR scanning on future purchases.
 * Version:     1.0.2
 * Requires at least: 6.4
 * Requires PHP: 8.1
 * WC requires at least: 8.0
 * WC tested up to: 9.9
 * Author:      i2dor
 * License:     MIT
 * Text Domain: nwc-checkout
 * Domain Path: /languages
 */

defined( 'ABSPATH' ) || exit;

define( 'NWC_CHECKOUT_VERSION', '1.0.2' );
define( 'NWC_CHECKOUT_FILE', __FILE__ );
define( 'NWC_CHECKOUT_DIR', plugin_dir_path( __FILE__ ) );
define( 'NWC_CHECKOUT_URL', plugin_dir_url( __FILE__ ) );
define( 'NWC_CHECKOUT_MIN_WC', '8.0' );

// Declare HPOS compatibility.
add_action( 'before_woocommerce_init', function () {
    if ( class_exists( \Automattic\WooCommerce\Utilities\FeaturesUtil::class ) ) {
        \Automattic\WooCommerce\Utilities\FeaturesUtil::declare_compatibility(
            'custom_order_tables',
            __FILE__,
            true
        );
    }
} );

// Boot after WooCommerce is ready.
add_action( 'plugins_loaded', function () {
    if ( ! class_exists( 'WooCommerce' ) ) {
        add_action( 'admin_notices', function () {
            echo '<div class="error"><p>'
                . esc_html__( 'NWC Checkout requires WooCommerce to be active.', 'nwc-checkout' )
                . '</p></div>';
        } );
        return;
    }

    if ( version_compare( WC_VERSION, NWC_CHECKOUT_MIN_WC, '<' ) ) {
        add_action( 'admin_notices', function () {
            echo '<div class="error"><p>'
                . sprintf(
                    /* translators: %s: minimum WooCommerce version */
                    esc_html__( 'NWC Checkout requires WooCommerce %s or higher.', 'nwc-checkout' ),
                    NWC_CHECKOUT_MIN_WC
                )
                . '</p></div>';
        } );
        return;
    }

    require_once NWC_CHECKOUT_DIR . 'includes/Plugin.php';
    \NWCCheckout\Plugin::instance()->init();
} );

register_activation_hook( __FILE__, function () {
    if ( ! get_option( 'nwc_checkout_encryption_key' ) ) {
        update_option(
            'nwc_checkout_encryption_key',
            base64_encode( random_bytes( 32 ) ),
            false
        );
    }
} );
