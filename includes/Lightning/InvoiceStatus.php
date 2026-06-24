<?php

namespace NWCCheckout\Lightning;

defined( 'ABSPATH' ) || exit;

enum InvoiceStatus: string {
    case Pending  = 'Pending';
    case Paid     = 'Paid';
    case Expired  = 'Expired';
    case Invalid  = 'Invalid';

    /**
     * Maps BTCPay checkout invoice statuses to our internal enum.
     * Checkout statuses: New, Processing, Settled, Expired, Invalid.
     * Legacy Lightning statuses: Unpaid, Paid, Complete (kept for safety).
     */
    public static function fromBTCPay( string $status ): self {
        return match ( $status ) {
            'Settled', 'Processing', 'Paid', 'Complete' => self::Paid,
            'Expired'                                    => self::Expired,
            'Invalid'                                    => self::Invalid,
            default                                      => self::Pending,
        };
    }

    public function isPaid(): bool {
        return $this === self::Paid;
    }

    public function isTerminal(): bool {
        return $this !== self::Pending;
    }
}
