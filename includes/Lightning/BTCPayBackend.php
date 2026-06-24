<?php

namespace NWCCheckout\Lightning;

defined( 'ABSPATH' ) || exit;

/**
 * BTCPay Server Greenfield API backend - Checkout Invoice endpoint.
 *
 * Uses the standard store-level invoice endpoint so invoices appear in the
 * BTCPay dashboard and can be managed alongside other payment methods:
 *   POST /api/v1/stores/{storeId}/invoices
 *   GET  /api/v1/stores/{storeId}/invoices/{invoiceId}
 *   GET  /api/v1/stores/{storeId}/invoices/{invoiceId}/payment-methods
 *
 * Required API key permissions:
 *   btcpay.store.cancreateinvoice
 *   btcpay.store.canviewinvoices
 */
final class BTCPayBackend implements LightningBackend {

    private string $serverUrl;
    private string $apiKey;
    private string $storeId;

    public function __construct(
        string $serverUrl,
        string $apiKey,
        string $storeId,
        string $cryptoCode = 'BTC', // kept for interface compat, unused here
    ) {
        $this->serverUrl = rtrim( $serverUrl, '/' );
        $this->apiKey    = $apiKey;
        $this->storeId   = $storeId;
    }

    public function isConfigured(): bool {
        return $this->serverUrl !== ''
            && $this->apiKey !== ''
            && $this->storeId !== '';
    }

    public function label(): string {
        return 'BTCPay Server';
    }

    /**
     * Creates a BTCPay checkout invoice (appears in dashboard).
     * Amount is in the store's fiat currency (e.g. RON).
     * The $amountSat param is ignored; we use the WC order total in fiat directly.
     */
    public function createInvoice( int $amountSat, string $description, string $orderId ): Invoice|\WP_Error {
        // We store the fiat total in the meta passed as $description context,
        // but the caller also passes it separately via createInvoiceFromOrder().
        // This method signature is preserved for interface compat; use createInvoiceFromOrder().
        return $this->createCheckoutInvoice( 0.0, get_woocommerce_currency(), $description, $orderId );
    }

    /**
     * Creates a BTCPay checkout invoice using the WC order fiat amount.
     *
     * @param float  $amount   Order total in fiat (e.g. 10.50 RON).
     * @param string $currency ISO 4217 currency code (e.g. RON, EUR).
     * @param string $description
     * @param string $orderId  WC order ID (stored as BTCPay metadata.orderId).
     */
    public function createInvoiceFromOrder( float $amount, string $currency, string $description, string $orderId ): Invoice|\WP_Error {
        return $this->createCheckoutInvoice( $amount, $currency, $description, $orderId );
    }

    public function getInvoice( string $invoiceId ): Invoice|\WP_Error {
        $response = $this->request( 'GET', $this->invoicesUrl() . '/' . rawurlencode( $invoiceId ) );

        if ( is_wp_error( $response ) ) {
            return $response;
        }

        return $this->parseCheckoutInvoice( $response );
    }

    /**
     * Returns the BOLT11 for a checkout invoice (via payment-methods endpoint).
     * Returns empty string if Lightning is not available.
     */
    public function getBolt11( string $invoiceId ): string|\WP_Error {
        $url      = $this->invoicesUrl() . '/' . rawurlencode( $invoiceId ) . '/payment-methods';
        $response = $this->request( 'GET', $url );

        if ( is_wp_error( $response ) ) {
            return $response;
        }

        // Response is a list of payment method objects.
        // BTCPay uses 'paymentMethodId' (not 'paymentMethod') in this endpoint.
        foreach ( $response as $pm ) {
            $method = $pm['paymentMethodId'] ?? $pm['paymentMethod'] ?? '';
            if ( in_array( $method, [ 'BTC-LN', 'BTC-LNURL' ], true ) ) {
                return $pm['destination'] ?? '';
            }
        }

        return new \WP_Error( 'btcpay_no_ln', 'No Lightning payment method on invoice' );
    }

    // -------------------------------------------------------------------------

    private function createCheckoutInvoice( float $amount, string $currency, string $description, string $orderId ): Invoice|\WP_Error {
        $response = $this->request(
            'POST',
            $this->invoicesUrl(),
            [
                'amount'   => (string) $amount,
                'currency' => strtoupper( $currency ),
                'metadata' => [
                    'orderId'     => $orderId,
                    'itemDesc'    => $description,
                    'buyerName'   => '',
                ],
                'checkout' => [
                    'expirationMinutes' => 60,
                    'paymentMethods'    => [ 'BTC-LN' ],
                    'redirectURL'       => '',
                    'redirectAutomatically' => false,
                ],
            ]
        );

        if ( is_wp_error( $response ) ) {
            return $response;
        }

        $invoice = $this->parseCheckoutInvoice( $response );

        if ( is_wp_error( $invoice ) ) {
            return $invoice;
        }

        // Eagerly fetch BOLT11 (Lightning payment method).
        $bolt11 = $this->getBolt11( $invoice->id );
        if ( is_wp_error( $bolt11 ) ) {
            return $bolt11;
        }

        return new Invoice(
            id:         $invoice->id,
            bolt11:     $bolt11,
            amountMsat: $invoice->amountMsat,
            status:     $invoice->status,
            preimage:   $invoice->preimage,
        );
    }

    private function invoicesUrl(): string {
        return sprintf(
            '%s/api/v1/stores/%s/invoices',
            $this->serverUrl,
            rawurlencode( $this->storeId )
        );
    }

    private function request( string $method, string $url, array $body = [] ): array|\WP_Error {
        $args = [
            'method'  => $method,
            'timeout' => 15,
            'headers' => [
                'Authorization' => 'token ' . $this->apiKey,
                'Content-Type'  => 'application/json',
            ],
        ];

        if ( $method === 'POST' && ! empty( $body ) ) {
            $args['body'] = wp_json_encode( $body );
        }

        $response = wp_remote_request( $url, $args );

        if ( is_wp_error( $response ) ) {
            return $response;
        }

        $code = wp_remote_retrieve_response_code( $response );
        $raw  = wp_remote_retrieve_body( $response );
        $data = json_decode( $raw, true );

        if ( $code < 200 || $code >= 300 ) {
            $message = ( is_array( $data ) ? ( $data['message'] ?? '' ) : '' ) ?: "BTCPay HTTP $code";
            return new \WP_Error( 'btcpay_error', $message, [ 'status' => $code ] );
        }

        if ( ! is_array( $data ) ) {
            return new \WP_Error( 'btcpay_parse', 'Invalid JSON response from BTCPay' );
        }

        return $data;
    }

    private function parseCheckoutInvoice( array $data ): Invoice|\WP_Error {
        if ( empty( $data['id'] ) ) {
            return new \WP_Error( 'btcpay_parse', 'Missing invoice id in BTCPay response' );
        }

        // amount is in fiat; convert to approx msat for record-keeping (not used for payment).
        return new Invoice(
            id:         $data['id'],
            bolt11:     '', // fetched separately via getBolt11()
            amountMsat: 0,
            status:     InvoiceStatus::fromBTCPay( $data['status'] ?? 'New' ),
            preimage:   $data['additionalData']['proofOfPayment'] ?? null,
        );
    }
}
