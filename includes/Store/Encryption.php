<?php

namespace NWCCheckout\Store;

defined( 'ABSPATH' ) || exit;

/**
 * AES-256-GCM symmetric encryption for NWC connection secrets.
 *
 * Key is generated once on plugin activation and stored in wp_options.
 * Format: base64( iv[12] . tag[16] . ciphertext )
 */
final class Encryption {

    private string $key;

    public function __construct() {
        $stored = get_option( 'nwc_checkout_encryption_key', '' );
        if ( ! $stored ) {
            // Fallback: derive from AUTH_KEY to avoid data loss on misconfigured sites.
            $stored = base64_encode( hash( 'sha256', AUTH_KEY . 'nwc_checkout', true ) );
        }
        $this->key = base64_decode( $stored );
    }

    public function encrypt( string $plaintext ): string|\WP_Error {
        $iv         = random_bytes( 12 );
        $ciphertext = openssl_encrypt(
            $plaintext,
            'aes-256-gcm',
            $this->key,
            OPENSSL_RAW_DATA,
            $iv,
            $tag,
            '',
            16
        );

        if ( $ciphertext === false ) {
            return new \WP_Error( 'nwc_encrypt', 'Encryption failed' );
        }

        return base64_encode( $iv . $tag . $ciphertext );
    }

    public function decrypt( string $encoded ): string|\WP_Error {
        $raw = base64_decode( $encoded, true );
        if ( $raw === false || strlen( $raw ) < 29 ) {
            return new \WP_Error( 'nwc_decrypt', 'Invalid ciphertext' );
        }

        $iv         = substr( $raw, 0, 12 );
        $tag        = substr( $raw, 12, 16 );
        $ciphertext = substr( $raw, 28 );

        $plaintext = openssl_decrypt(
            $ciphertext,
            'aes-256-gcm',
            $this->key,
            OPENSSL_RAW_DATA,
            $iv,
            $tag
        );

        if ( $plaintext === false ) {
            return new \WP_Error( 'nwc_decrypt', 'Decryption failed - data may be corrupted' );
        }

        return $plaintext;
    }
}
