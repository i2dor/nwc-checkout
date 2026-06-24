<?php defined( 'ABSPATH' ) || exit; ?>

<div class="nwc-connect-wrap" id="nwc-connect-wrap">

  <div class="nwc-instructions">
    <strong><?php esc_html_e( 'Pay with your Lightning wallet - no QR scanning on future orders.', 'nwc-checkout' ); ?></strong>
    <ol>
      <li><?php esc_html_e( 'Open your wallet app (Alby, Zeus, Mutiny, Blink).', 'nwc-checkout' ); ?></li>
      <li><?php esc_html_e( 'Go to Settings > Nostr Wallet Connect > Create connection.', 'nwc-checkout' ); ?></li>
      <li><?php esc_html_e( 'Copy the connection string and paste it below.', 'nwc-checkout' ); ?></li>
    </ol>
  </div>

  <form id="nwc-connect-form" novalidate>

    <div class="nwc-uri-field">
      <input
        type="text"
        id="nwc-uri-input"
        name="uri"
        placeholder="nostr+walletconnect://..."
        autocomplete="off"
        spellcheck="false"
      >
      <button type="submit" class="button alt">
        <?php esc_html_e( 'Connect', 'nwc-checkout' ); ?>
      </button>
    </div>

    <p id="nwc-connect-status" class="nwc-status" aria-live="polite"></p>

  </form>

</div>
