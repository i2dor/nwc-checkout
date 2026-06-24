<?php

namespace NWCCheckout;

defined( 'ABSPATH' ) || exit;

class Plugin {

    private static ?self $instance = null;

    public static function instance(): self {
        if ( self::$instance === null ) {
            self::$instance = new self();
        }
        return self::$instance;
    }

    private function __construct() {}

    public function init(): void {
        $this->load_classes();
        $this->register_gateway();
        $this->register_ajax();
        $this->register_account_tab();

        add_action( 'wp_enqueue_scripts', [ $this, 'enqueue_checkout_assets' ] );
        add_action( 'admin_enqueue_scripts', [ $this, 'enqueue_admin_assets' ] );
    }

    private function load_classes(): void {
        $files = [
            'Lightning/InvoiceStatus.php',
            'Lightning/Invoice.php',
            'Lightning/LightningBackend.php',
            'Lightning/BTCPayBackend.php',
            'Nip47/Connection.php',
            'Store/Encryption.php',
            'Store/ConnectionStore.php',
            'Ajax/CreateInvoice.php',
            'Ajax/PollInvoice.php',
            'Ajax/SaveConnection.php',
            'Ajax/GetConnection.php',
            'Ajax/DeleteConnection.php',
            'Gateway/NWC_Gateway.php',
        ];

        foreach ( $files as $file ) {
            require_once NWC_CHECKOUT_DIR . 'includes/' . $file;
        }
    }

    private function register_gateway(): void {
        add_filter( 'woocommerce_payment_gateways', function ( array $gateways ): array {
            $gateways[] = Gateway\NWC_Gateway::class;
            return $gateways;
        } );
    }

    private function register_ajax(): void {
        $handlers = [
            Ajax\CreateInvoice::class,
            Ajax\PollInvoice::class,
            Ajax\SaveConnection::class,
            Ajax\GetConnection::class,
            Ajax\DeleteConnection::class,
        ];

        foreach ( $handlers as $handler ) {
            ( new $handler() )->register();
        }
    }

    private function register_account_tab(): void {
        add_filter( 'woocommerce_account_menu_items', function ( array $items ): array {
            $items['nwc-wallet'] = __( 'Lightning Wallet', 'nwc-checkout' );
            return $items;
        } );

        add_action( 'woocommerce_account_nwc-wallet_endpoint', function (): void {
            $store = new Store\ConnectionStore();
            $connected = $store->has_connection( get_current_user_id() );
            include NWC_CHECKOUT_DIR . 'templates/account/wallet-tab.php';
        } );

        add_rewrite_endpoint( 'nwc-wallet', EP_ROOT | EP_PAGES );
    }

    public function enqueue_checkout_assets(): void {
        if ( ! is_checkout() ) {
            return;
        }

        wp_enqueue_style(
            'nwc-checkout',
            NWC_CHECKOUT_URL . 'assets/css/nwc-checkout.css',
            [],
            NWC_CHECKOUT_VERSION
        );

        wp_enqueue_script(
            'nwc-checkout',
            NWC_CHECKOUT_URL . 'assets/js/nwc-checkout.js',
            [],
            NWC_CHECKOUT_VERSION,
            true
        );

        $store = new Store\ConnectionStore();
        $user_id = get_current_user_id();

        wp_localize_script( 'nwc-checkout', 'NWCCheckout', [
            'ajaxUrl'      => admin_url( 'admin-ajax.php' ),
            'nonce'        => wp_create_nonce( 'nwc_checkout' ),
            'hasConnection' => $store->has_connection( $user_id ?: 0 ),
            'gatewayId'    => 'nwc_checkout',
            'pollInterval' => 3000,
            'pollTimeout'  => 90000,
            'relayTimeout' => 15000,
            'i18n'         => [
                'connecting'    => __( 'Connecting to wallet...', 'nwc-checkout' ),
                'paying'        => __( 'Sending payment request...', 'nwc-checkout' ),
                'waitingWallet' => __( 'Waiting for wallet to confirm...', 'nwc-checkout' ),
                'paid'          => __( 'Payment confirmed!', 'nwc-checkout' ),
                'fallback'      => __( 'Wallet did not respond. Showing QR code instead.', 'nwc-checkout' ),
                'error'         => __( 'Payment failed. Please try again or use QR.', 'nwc-checkout' ),
            ],
        ] );
    }

    public function enqueue_admin_assets( string $hook ): void {
        if ( $hook !== 'woocommerce_page_wc-settings' ) {
            return;
        }

        wp_enqueue_script(
            'nwc-checkout-admin',
            NWC_CHECKOUT_URL . 'assets/js/nwc-admin.js',
            [ 'jquery' ],
            NWC_CHECKOUT_VERSION,
            true
        );

        wp_localize_script( 'nwc-checkout-admin', 'NWCAdmin', [
            'ajaxUrl' => admin_url( 'admin-ajax.php' ),
            'nonce'   => wp_create_nonce( 'nwc_admin' ),
        ] );
    }
}
