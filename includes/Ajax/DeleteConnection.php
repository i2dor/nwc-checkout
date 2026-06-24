<?php

namespace NWCCheckout\Ajax;

defined( 'ABSPATH' ) || exit;

use NWCCheckout\Store\ConnectionStore;

/**
 * AJAX: disconnect the customer's Lightning wallet.
 */
final class DeleteConnection extends AbstractAjaxHandler {

    protected string $action = 'nwc_delete_connection';
    protected bool   $nopriv = true;

    protected function handle(): void {
        $store = new ConnectionStore();
        $store->delete( get_current_user_id() );
        wp_send_json_success();
    }
}
