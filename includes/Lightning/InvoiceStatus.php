<?php

namespace NWCCheckout\Lightning;

defined( 'ABSPATH' ) || exit;

enum InvoiceStatus: string {
    case Pending  = 'Unpaid';
    case Paid     = 'Complete';
    case Expired  = 'Expired';
    case Invalid  = 'Invalid';

    public static function fromBTCPay( string $status ): self {
        return match ( $status ) {
            'Paid', 'Complete'  => self::Paid,
            'Expired'           => self::Expired,
            'Invalid'           => self::Invalid,
            default             => self::Pending,
        };
    }

    public function isPaid(): bool {
        return $this === self::Paid;
    }

    public function isTerminal(): bool {
        return $this !== self::Pending;
    }
}
