<?php

namespace NWCCheckout\Nip47;

defined( 'ABSPATH' ) || exit;

/**
 * Parses a nostr+walletconnect:// URI (NIP-47).
 *
 * Format:
 *   nostr+walletconnect://<walletPubkeyHex>
 *     ?relay=wss://relay.example.com
 *     &secret=<clientSecretHex>
 *     [&lud16=user@domain.com]
 */
final class Connection {

    public readonly string  $walletPubkey;  // hex
    public readonly string  $relay;         // wss://...
    public readonly string  $clientSecret;  // hex - client signs requests with this key
    public readonly ?string $lud16;

    private function __construct(
        string  $walletPubkey,
        string  $relay,
        string  $clientSecret,
        ?string $lud16,
    ) {
        $this->walletPubkey = $walletPubkey;
        $this->relay        = $relay;
        $this->clientSecret = $clientSecret;
        $this->lud16        = $lud16;
    }

    public static function parse( string $uri ): self|\WP_Error {
        // Normalise scheme so parse_url works.
        $normalised = preg_replace( '/^nostr\+walletconnect:\/\//', 'https://', $uri );
        $parts      = parse_url( $normalised );

        if ( ! $parts ) {
            return new \WP_Error( 'nwc_parse', 'Invalid connection URI' );
        }

        $walletPubkey = $parts['host'] ?? '';
        if ( ! self::isHex64( $walletPubkey ) ) {
            return new \WP_Error( 'nwc_parse', 'Invalid wallet pubkey in URI' );
        }

        parse_str( $parts['query'] ?? '', $query );

        $relay = $query['relay'] ?? '';
        if ( ! str_starts_with( $relay, 'wss://' ) && ! str_starts_with( $relay, 'ws://' ) ) {
            return new \WP_Error( 'nwc_parse', 'Missing or invalid relay in URI' );
        }

        $secret = $query['secret'] ?? '';
        if ( ! self::isHex64( $secret ) ) {
            return new \WP_Error( 'nwc_parse', 'Missing or invalid secret in URI' );
        }

        return new self(
            walletPubkey: strtolower( $walletPubkey ),
            relay:        $relay,
            clientSecret: strtolower( $secret ),
            lud16:        $query['lud16'] ?? null,
        );
    }

    public function toArray(): array {
        return [
            'walletPubkey' => $this->walletPubkey,
            'relay'        => $this->relay,
            'clientSecret' => $this->clientSecret,
            'lud16'        => $this->lud16,
        ];
    }

    private static function isHex64( string $value ): bool {
        return strlen( $value ) === 64 && ctype_xdigit( $value );
    }
}
