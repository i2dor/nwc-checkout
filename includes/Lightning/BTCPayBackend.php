<?php

namespace NWCCheckout\Lightning;

defined( 'ABSPATH' ) || exit;

/**
 * BTCPay Server Greenfield API backend.
 *
 * Uses the store-level Lightning endpoint (works for external nodes, e.g. Blink):
 *   POST /api/v1/stores/{storeId}/lightning/BTC/invoices
 *   GET  /api/v1/stores/{storeId}/lightning/BTC/invoices/{invoiceId}
 *
 * Required API key permissions:
 *   btcpay.store.cancreatelightninginvoice
 *   btcpay.store.canviewlightninginvoice
 */
final class BTCPayBackend implements LightningBackend {

    private string $serverUrl;
    private string $apiKey;
    private string $storeId;
    private string $cryptoCode;

    public function __construct(
        string $serverUrl,
        string $apiKey,
        string $storeId,
        string $cryptoCode = 'BTC',
    ) {
        $this->serverUrl  = rtrim( $serverUrl, '/' );
        $this->apiKey     = $apiKey;
        $this->storeId    = $storeId;
        $this->cryptoCode = strtoupper( $cryptoCode );
    }

    public function isConfigured(): bool {
        return $this->serverUrl !== ''
            && $this->apiKey !== ''
            && $this->storeId !== '';
    }

    public function label(): string {
        return 'BTCPay Server';
    }

    public function createInvoice( int $amountSat, string $description, string $orderId ): Invoice|\WP_Error {
        $response = $this->request(
            'POST',
            $this->invoicesUrl(),
            [
                'amount'      => (string) ( $amountSat * 1000 ), // millisatoshis
                'description' => $description,
                'expiry'      => 3600,
                'privateRouteHints' => false,
            ]
        );

        if ( is_wp_error( $response ) ) {
            return $response;
        }

        return $this->parseInvoice( $response );
    }

    public function getInvoice( string $invoiceId ): Invoice|\WP_Error {
        $response = $this->request( 'GET', $this->invoicesUrl() . '/' . rawurlencode( $invoiceId ) );

        if ( is_wp_error( $response ) ) {
            return $response;
        }

        return $this->parseInvoice( $response );
    }

    // -------------------------------------------------------------------------

    private function invoicesUrl(): string {
        return sprintf(
            '%s/api/v1/stores/%s/lightning/%s/invoices',
            $this->serverUrl,
            rawurlencode( $this->storeId ),
            rawurlencode( $this->cryptoCode )
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
            $message = $data['message'] ?? "BTCPay HTTP $code";
            return new \WP_Error( 'btcpay_error', $message, [ 'status' => $code ] );
        }

        if ( ! is_array( $data ) ) {
            return new \WP_Error( 'btcpay_parse', 'Invalid JSON response from BTCPay' );
        }

        return $data;
    }

    private function parseInvoice( array $data ): Invoice|\WP_Error {
        if ( empty( $data['id'] ) || empty( $data['BOLT11'] ) ) {
            return new \WP_Error( 'btcpay_parse', 'Missing id or BOLT11 in BTCPay response' );
        }

        return new Invoice(
            id:          $data['id'],
            bolt11:      $data['BOLT11'],
            amountMsat:  (int) ( $data['amount'] ?? 0 ),
            status:      InvoiceStatus::fromBTCPay( $data['status'] ?? 'Unpaid' ),
            preimage:    $data['preimage'] ?? null,
        );
    }
}
