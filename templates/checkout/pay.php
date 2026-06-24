<?php defined( 'ABSPATH' ) || exit; ?>

<div class="nwc-pay-wrap" id="nwc-pay-wrap">

  <span class="nwc-wallet-badge">
    <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M13 10V3L4 14h7v7l9-11h-7z"/></svg>
    <?php esc_html_e( 'Lightning wallet connected', 'nwc-checkout' ); ?>
    <button
      type="button"
      class="nwc-disconnect"
      id="nwc-disconnect-btn"
      aria-label="<?php esc_attr_e( 'Disconnect wallet', 'nwc-checkout' ); ?>"
    ><?php esc_html_e( 'Disconnect', 'nwc-checkout' ); ?></button>
  </span>

  <p class="nwc-instructions">
    <?php esc_html_e( 'Your wallet will receive a payment request automatically after you place the order.', 'nwc-checkout' ); ?>
  </p>

</div>
