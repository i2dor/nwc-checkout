<?php

namespace NWCCheckout\Store;

defined( 'ABSPATH' ) || exit;

/**
 * Stores and retrieves NWC connections per user or session.
 *
 * Logged-in users: WC user meta (_nwc_connection).
 * Guests:          transient keyed by a session cookie (nwc_sid).
 */
final class ConnectionStore {

    private const META_KEY      = '_nwc_connection';
    private const COOKIE_NAME   = 'nwc_sid';
    private const GUEST_TTL     = DAY_IN_SECONDS * 30;

    private Encryption $crypto;

    public function __construct() {
        $this->crypto = new Encryption();
    }

    public function save( int $userId, array $connectionData ): bool|\WP_Error {
        $json      = wp_json_encode( $connectionData );
        $encrypted = $this->crypto->encrypt( $json );

        if ( is_wp_error( $encrypted ) ) {
            return $encrypted;
        }

        if ( $userId > 0 ) {
            return (bool) update_user_meta( $userId, self::META_KEY, $encrypted );
        }

        return set_transient( $this->guestKey(), $encrypted, self::GUEST_TTL );
    }

    public function get( int $userId ): array|null|\WP_Error {
        $encrypted = $userId > 0
            ? get_user_meta( $userId, self::META_KEY, true )
            : get_transient( $this->guestKey() );

        if ( empty( $encrypted ) ) {
            return null;
        }

        $json = $this->crypto->decrypt( $encrypted );
        if ( is_wp_error( $json ) ) {
            return $json;
        }

        $data = json_decode( $json, true );
        return is_array( $data ) ? $data : null;
    }

    public function has_connection( int $userId ): bool {
        $conn = $this->get( $userId );
        return is_array( $conn );
    }

    public function delete( int $userId ): void {
        if ( $userId > 0 ) {
            delete_user_meta( $userId, self::META_KEY );
            return;
        }
        delete_transient( $this->guestKey() );
        setcookie( self::COOKIE_NAME, '', time() - 3600, COOKIEPATH, COOKIE_DOMAIN, is_ssl(), true );
    }

    // -------------------------------------------------------------------------

    private function guestKey(): string {
        $sid = $_COOKIE[ self::COOKIE_NAME ] ?? '';
        if ( empty( $sid ) || strlen( $sid ) !== 64 || ! ctype_alnum( $sid ) ) {
            $sid = bin2hex( random_bytes( 32 ) );
            setcookie( self::COOKIE_NAME, $sid, time() + self::GUEST_TTL, COOKIEPATH, COOKIE_DOMAIN, is_ssl(), true );
            $_COOKIE[ self::COOKIE_NAME ] = $sid;
        }
        return 'nwc_conn_' . $sid;
    }
}
