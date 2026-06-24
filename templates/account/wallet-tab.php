<?php defined( 'ABSPATH' ) || exit; ?>

<h2><?php esc_html_e( 'Lightning Wallet', 'nwc-checkout' ); ?></h2>

<?php if ( $connected ) : ?>

  <p class="nwc-wallet-badge">
    <svg viewBox="0 0 24 24" aria-hidden="true" style="width:14px;height:14px;fill:currentColor"><path d="M13 10V3L4 14h7v7l9-11h-7z"/></svg>
    <?php esc_html_e( 'Wallet connected', 'nwc-checkout' ); ?>
  </p>

  <p><?php esc_html_e( 'Your Lightning wallet is connected. Payments will be sent automatically at checkout without QR scanning.', 'nwc-checkout' ); ?></p>

  <button type="button" id="nwc-disconnect-btn" class="button">
    <?php esc_html_e( 'Disconnect wallet', 'nwc-checkout' ); ?>
  </button>

<?php else : ?>

  <p><?php esc_html_e( 'No Lightning wallet connected yet. Connect at checkout to enable one-click payments.', 'nwc-checkout' ); ?></p>

<?php endif; ?>
