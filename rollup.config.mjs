import resolve   from '@rollup/plugin-node-resolve';
import commonjs  from '@rollup/plugin-commonjs';
import replace   from '@rollup/plugin-replace';
import terser    from '@rollup/plugin-terser';

const prod = process.env.NODE_ENV === 'production';

export default {
  input: 'src/checkout.js',
  output: {
    file:   'assets/js/nwc-checkout.js',
    format: 'iife',
    name:   'NWCCheckoutBundle',
    sourcemap: ! prod,
  },
  plugins: [
    replace( {
      preventAssignment: true,
      'process.env.NODE_ENV': JSON.stringify( process.env.NODE_ENV ?? 'development' ),
    } ),
    resolve( { browser: true, preferBuiltins: false } ),
    commonjs(),
    prod && terser( { format: { comments: false } } ),
  ].filter( Boolean ),
};
