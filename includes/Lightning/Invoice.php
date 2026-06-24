<?php

namespace NWCCheckout\Lightning;

defined( 'ABSPATH' ) || exit;

final class Invoice {

    public function __construct(
        public readonly string        $id,
        public readonly string        $bolt11,
        public readonly int           $amountMsat,
        public readonly InvoiceStatus $status,
        public readonly ?string       $preimage = null,
    ) {}

    public function amountSat(): int {
        return (int) ceil( $this->amountMsat / 1000 );
    }
}
