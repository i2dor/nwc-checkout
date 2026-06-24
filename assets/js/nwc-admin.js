/* NWC Checkout - admin settings JS */
( function ( $ ) {
    $( '#nwc-test-connection' ).on( 'click', function () {
        var btn    = $( this );
        var result = $( '#nwc-test-result' );
        btn.prop( 'disabled', true );
        result.text( 'Testing...' ).removeClass( 'success error' );

        $.post( NWCAdmin.ajaxUrl, {
            action: 'nwc_test_connection',
            nonce:  NWCAdmin.nonce,
        }, function ( res ) {
            btn.prop( 'disabled', false );
            if ( res.success ) {
                result.text( res.data.message || 'Connected.' ).addClass( 'success' );
            } else {
                result.text( res.data || 'Connection failed.' ).addClass( 'error' );
            }
        } ).fail( function () {
            btn.prop( 'disabled', false );
            result.text( 'Request failed.' ).addClass( 'error' );
        } );
    } );
} )( jQuery );
