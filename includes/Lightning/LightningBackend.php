<?php

namespace NWCCheckout\Lightning;

defined( 'ABSPATH' ) || exit;

interface LightningBackend {

    /**
     * Create a Lightning invoice.
     *
     * @param int    $amountSat   Amount in satoshis.
     * @param string $description Payment description shown to payer.
     * @param string $orderId     WooCommerce order ID for metadata.
     *
     * @return Invoice|\WP_Error
     */
    public function createInvoice( int $amountSat, string $description, string $orderId ): Invoice|\WP_Error;

    /**
     * Fetch current status of a previously created invoice.
     *
     * @param string $invoiceId Backend-native invoice ID.
     *
     * @return Invoice|\WP_Error
     */
    public function getInvoice( string $invoiceId ): Invoice|\WP_Error;

    /**
     * Return true when the backend has enough config to operate.
     */
    public function isConfigured(): bool;

    /**
     * Human-readable backend name for admin UI.
     */
    public function label(): string;
}
