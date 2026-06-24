<?php
defined( 'WP_UNINSTALL_PLUGIN' ) || exit;

// Remove plugin options.
delete_option( 'nwc_checkout_encryption_key' );
delete_option( 'woocommerce_nwc_checkout_settings' );

// Remove user meta for all users.
global $wpdb;
$wpdb->delete( $wpdb->usermeta, [ 'meta_key' => '_nwc_connection' ] );

// Remove guest transients (best-effort; WordPress will expire the rest).
$wpdb->query(
    "DELETE FROM {$wpdb->options}
     WHERE option_name LIKE '_transient_nwc_conn_%'
        OR option_name LIKE '_transient_timeout_nwc_conn_%'"
);
