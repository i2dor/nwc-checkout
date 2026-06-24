<?php

namespace NWCCheckout\Ajax;

defined( 'ABSPATH' ) || exit;

abstract class AbstractAjaxHandler {

    protected string $action  = '';
    protected bool   $nopriv  = false;

    public function register(): void {
        add_action( 'wp_ajax_' . $this->action, [ $this, 'dispatch' ] );

        if ( $this->nopriv ) {
            add_action( 'wp_ajax_nopriv_' . $this->action, [ $this, 'dispatch' ] );
        }
    }

    final public function dispatch(): void {
        check_ajax_referer( 'nwc_checkout', 'nonce' );
        $this->handle();
        wp_die();
    }

    abstract protected function handle(): void;
}
