(function () {
    'use strict';

    /**
     * Utilities for hex, bytes, CSPRNG.
     * @module
     */
    /*! noble-hashes - MIT License (c) 2022 Paul Miller (paulmillr.com) */
    /** Checks if something is Uint8Array. Be careful: nodejs Buffer will return true. */
    function isBytes$3(a) {
        return a instanceof Uint8Array || (ArrayBuffer.isView(a) && a.constructor.name === 'Uint8Array');
    }
    /** Asserts something is positive integer. */
    function anumber$3(n, title = '') {
        if (!Number.isSafeInteger(n) || n < 0) {
            const prefix = title && `"${title}" `;
            throw new Error(`${prefix}expected integer >= 0, got ${n}`);
        }
    }
    /** Asserts something is Uint8Array. */
    function abytes$3(value, length, title = '') {
        const bytes = isBytes$3(value);
        const len = value?.length;
        const needsLen = length !== undefined;
        if (!bytes || (needsLen && len !== length)) {
            const prefix = title && `"${title}" `;
            const ofLen = needsLen ? ` of length ${length}` : '';
            const got = bytes ? `length=${len}` : `type=${typeof value}`;
            throw new Error(prefix + 'expected Uint8Array' + ofLen + ', got ' + got);
        }
        return value;
    }
    /** Asserts something is hash */
    function ahash$1(h) {
        if (typeof h !== 'function' || typeof h.create !== 'function')
            throw new Error('Hash must wrapped by utils.createHasher');
        anumber$3(h.outputLen);
        anumber$3(h.blockLen);
    }
    /** Asserts a hash instance has not been destroyed / finished */
    function aexists$1(instance, checkFinished = true) {
        if (instance.destroyed)
            throw new Error('Hash instance has been destroyed');
        if (checkFinished && instance.finished)
            throw new Error('Hash#digest() has already been called');
    }
    /** Asserts output is properly-sized byte array */
    function aoutput$1(out, instance) {
        abytes$3(out, undefined, 'digestInto() output');
        const min = instance.outputLen;
        if (out.length < min) {
            throw new Error('"digestInto() output" expected to be of length >=' + min);
        }
    }
    /** Zeroize a byte array. Warning: JS provides no guarantees. */
    function clean$2(...arrays) {
        for (let i = 0; i < arrays.length; i++) {
            arrays[i].fill(0);
        }
    }
    /** Create DataView of an array for easy byte-level manipulation. */
    function createView$1(arr) {
        return new DataView(arr.buffer, arr.byteOffset, arr.byteLength);
    }
    /** The rotate right (circular right shift) operation for uint32 */
    function rotr$1(word, shift) {
        return (word << (32 - shift)) | (word >>> shift);
    }
    // Built-in hex conversion https://caniuse.com/mdn-javascript_builtins_uint8array_fromhex
    const hasHexBuiltin$2 = /* @__PURE__ */ (() => 
    // @ts-ignore
    typeof Uint8Array.from([]).toHex === 'function' && typeof Uint8Array.fromHex === 'function')();
    // Array where index 0xf0 (240) is mapped to string 'f0'
    const hexes$1 = /* @__PURE__ */ Array.from({ length: 256 }, (_, i) => i.toString(16).padStart(2, '0'));
    /**
     * Convert byte array to hex string. Uses built-in function, when available.
     * @example bytesToHex(Uint8Array.from([0xca, 0xfe, 0x01, 0x23])) // 'cafe0123'
     */
    function bytesToHex$1(bytes) {
        abytes$3(bytes);
        // @ts-ignore
        if (hasHexBuiltin$2)
            return bytes.toHex();
        // pre-caching improves the speed 6x
        let hex = '';
        for (let i = 0; i < bytes.length; i++) {
            hex += hexes$1[bytes[i]];
        }
        return hex;
    }
    // We use optimized technique to convert hex string to byte array
    const asciis$2 = { _0: 48, _9: 57, A: 65, F: 70, a: 97, f: 102 };
    function asciiToBase16$2(ch) {
        if (ch >= asciis$2._0 && ch <= asciis$2._9)
            return ch - asciis$2._0; // '2' => 50-48
        if (ch >= asciis$2.A && ch <= asciis$2.F)
            return ch - (asciis$2.A - 10); // 'B' => 66-(65-10)
        if (ch >= asciis$2.a && ch <= asciis$2.f)
            return ch - (asciis$2.a - 10); // 'b' => 98-(97-10)
        return;
    }
    /**
     * Convert hex string to byte array. Uses built-in function, when available.
     * @example hexToBytes('cafe0123') // Uint8Array.from([0xca, 0xfe, 0x01, 0x23])
     */
    function hexToBytes$2(hex) {
        if (typeof hex !== 'string')
            throw new Error('hex string expected, got ' + typeof hex);
        // @ts-ignore
        if (hasHexBuiltin$2)
            return Uint8Array.fromHex(hex);
        const hl = hex.length;
        const al = hl / 2;
        if (hl % 2)
            throw new Error('hex string expected, got unpadded hex of length ' + hl);
        const array = new Uint8Array(al);
        for (let ai = 0, hi = 0; ai < al; ai++, hi += 2) {
            const n1 = asciiToBase16$2(hex.charCodeAt(hi));
            const n2 = asciiToBase16$2(hex.charCodeAt(hi + 1));
            if (n1 === undefined || n2 === undefined) {
                const char = hex[hi] + hex[hi + 1];
                throw new Error('hex string expected, got non-hex character "' + char + '" at index ' + hi);
            }
            array[ai] = n1 * 16 + n2; // multiply first octet, e.g. 'a3' => 10*16+3 => 160 + 3 => 163
        }
        return array;
    }
    /** Copies several Uint8Arrays into one. */
    function concatBytes$1(...arrays) {
        let sum = 0;
        for (let i = 0; i < arrays.length; i++) {
            const a = arrays[i];
            abytes$3(a);
            sum += a.length;
        }
        const res = new Uint8Array(sum);
        for (let i = 0, pad = 0; i < arrays.length; i++) {
            const a = arrays[i];
            res.set(a, pad);
            pad += a.length;
        }
        return res;
    }
    /** Creates function with outputLen, blockLen, create properties from a class constructor. */
    function createHasher$1(hashCons, info = {}) {
        const hashC = (msg, opts) => hashCons(opts).update(msg).digest();
        const tmp = hashCons(undefined);
        hashC.outputLen = tmp.outputLen;
        hashC.blockLen = tmp.blockLen;
        hashC.create = (opts) => hashCons(opts);
        Object.assign(hashC, info);
        return Object.freeze(hashC);
    }
    /** Cryptographically secure PRNG. Uses internal OS-level `crypto.getRandomValues`. */
    function randomBytes$1(bytesLength = 32) {
        const cr = typeof globalThis === 'object' ? globalThis.crypto : null;
        if (typeof cr?.getRandomValues !== 'function')
            throw new Error('crypto.getRandomValues must be defined');
        return cr.getRandomValues(new Uint8Array(bytesLength));
    }
    /** Creates OID opts for NIST hashes, with prefix 06 09 60 86 48 01 65 03 04 02. */
    const oidNist$1 = (suffix) => ({
        oid: Uint8Array.from([0x06, 0x09, 0x60, 0x86, 0x48, 0x01, 0x65, 0x03, 0x04, 0x02, suffix]),
    });

    /**
     * Internal Merkle-Damgard hash utils.
     * @module
     */
    /** Choice: a ? b : c */
    function Chi$1(a, b, c) {
        return (a & b) ^ (~a & c);
    }
    /** Majority function, true if any two inputs is true. */
    function Maj$1(a, b, c) {
        return (a & b) ^ (a & c) ^ (b & c);
    }
    /**
     * Merkle-Damgard hash construction base class.
     * Could be used to create MD5, RIPEMD, SHA1, SHA2.
     */
    let HashMD$1 = class HashMD {
        blockLen;
        outputLen;
        padOffset;
        isLE;
        // For partial updates less than block size
        buffer;
        view;
        finished = false;
        length = 0;
        pos = 0;
        destroyed = false;
        constructor(blockLen, outputLen, padOffset, isLE) {
            this.blockLen = blockLen;
            this.outputLen = outputLen;
            this.padOffset = padOffset;
            this.isLE = isLE;
            this.buffer = new Uint8Array(blockLen);
            this.view = createView$1(this.buffer);
        }
        update(data) {
            aexists$1(this);
            abytes$3(data);
            const { view, buffer, blockLen } = this;
            const len = data.length;
            for (let pos = 0; pos < len;) {
                const take = Math.min(blockLen - this.pos, len - pos);
                // Fast path: we have at least one block in input, cast it to view and process
                if (take === blockLen) {
                    const dataView = createView$1(data);
                    for (; blockLen <= len - pos; pos += blockLen)
                        this.process(dataView, pos);
                    continue;
                }
                buffer.set(data.subarray(pos, pos + take), this.pos);
                this.pos += take;
                pos += take;
                if (this.pos === blockLen) {
                    this.process(view, 0);
                    this.pos = 0;
                }
            }
            this.length += data.length;
            this.roundClean();
            return this;
        }
        digestInto(out) {
            aexists$1(this);
            aoutput$1(out, this);
            this.finished = true;
            // Padding
            // We can avoid allocation of buffer for padding completely if it
            // was previously not allocated here. But it won't change performance.
            const { buffer, view, blockLen, isLE } = this;
            let { pos } = this;
            // append the bit '1' to the message
            buffer[pos++] = 0b10000000;
            clean$2(this.buffer.subarray(pos));
            // we have less than padOffset left in buffer, so we cannot put length in
            // current block, need process it and pad again
            if (this.padOffset > blockLen - pos) {
                this.process(view, 0);
                pos = 0;
            }
            // Pad until full block byte with zeros
            for (let i = pos; i < blockLen; i++)
                buffer[i] = 0;
            // Note: sha512 requires length to be 128bit integer, but length in JS will overflow before that
            // You need to write around 2 exabytes (u64_max / 8 / (1024**6)) for this to happen.
            // So we just write lowest 64 bits of that value.
            view.setBigUint64(blockLen - 8, BigInt(this.length * 8), isLE);
            this.process(view, 0);
            const oview = createView$1(out);
            const len = this.outputLen;
            // NOTE: we do division by 4 later, which must be fused in single op with modulo by JIT
            if (len % 4)
                throw new Error('_sha2: outputLen must be aligned to 32bit');
            const outLen = len / 4;
            const state = this.get();
            if (outLen > state.length)
                throw new Error('_sha2: outputLen bigger than state');
            for (let i = 0; i < outLen; i++)
                oview.setUint32(4 * i, state[i], isLE);
        }
        digest() {
            const { buffer, outputLen } = this;
            this.digestInto(buffer);
            const res = buffer.slice(0, outputLen);
            this.destroy();
            return res;
        }
        _cloneInto(to) {
            to ||= new this.constructor();
            to.set(...this.get());
            const { blockLen, buffer, length, finished, destroyed, pos } = this;
            to.destroyed = destroyed;
            to.finished = finished;
            to.length = length;
            to.pos = pos;
            if (length % blockLen)
                to.buffer.set(buffer);
            return to;
        }
        clone() {
            return this._cloneInto();
        }
    };
    /**
     * Initial SHA-2 state: fractional parts of square roots of first 16 primes 2..53.
     * Check out `test/misc/sha2-gen-iv.js` for recomputation guide.
     */
    /** Initial SHA256 state. Bits 0..32 of frac part of sqrt of primes 2..19 */
    const SHA256_IV$1 = /* @__PURE__ */ Uint32Array.from([
        0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19,
    ]);

    /**
     * SHA2 hash function. A.k.a. sha256, sha384, sha512, sha512_224, sha512_256.
     * SHA256 is the fastest hash implementable in JS, even faster than Blake3.
     * Check out [RFC 4634](https://www.rfc-editor.org/rfc/rfc4634) and
     * [FIPS 180-4](https://nvlpubs.nist.gov/nistpubs/FIPS/NIST.FIPS.180-4.pdf).
     * @module
     */
    /**
     * Round constants:
     * First 32 bits of fractional parts of the cube roots of the first 64 primes 2..311)
     */
    // prettier-ignore
    const SHA256_K$1 = /* @__PURE__ */ Uint32Array.from([
        0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
        0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
        0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
        0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
        0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
        0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
        0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
        0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2
    ]);
    /** Reusable temporary buffer. "W" comes straight from spec. */
    const SHA256_W$1 = /* @__PURE__ */ new Uint32Array(64);
    /** Internal 32-byte base SHA2 hash class. */
    let SHA2_32B$1 = class SHA2_32B extends HashMD$1 {
        constructor(outputLen) {
            super(64, outputLen, 8, false);
        }
        get() {
            const { A, B, C, D, E, F, G, H } = this;
            return [A, B, C, D, E, F, G, H];
        }
        // prettier-ignore
        set(A, B, C, D, E, F, G, H) {
            this.A = A | 0;
            this.B = B | 0;
            this.C = C | 0;
            this.D = D | 0;
            this.E = E | 0;
            this.F = F | 0;
            this.G = G | 0;
            this.H = H | 0;
        }
        process(view, offset) {
            // Extend the first 16 words into the remaining 48 words w[16..63] of the message schedule array
            for (let i = 0; i < 16; i++, offset += 4)
                SHA256_W$1[i] = view.getUint32(offset, false);
            for (let i = 16; i < 64; i++) {
                const W15 = SHA256_W$1[i - 15];
                const W2 = SHA256_W$1[i - 2];
                const s0 = rotr$1(W15, 7) ^ rotr$1(W15, 18) ^ (W15 >>> 3);
                const s1 = rotr$1(W2, 17) ^ rotr$1(W2, 19) ^ (W2 >>> 10);
                SHA256_W$1[i] = (s1 + SHA256_W$1[i - 7] + s0 + SHA256_W$1[i - 16]) | 0;
            }
            // Compression function main loop, 64 rounds
            let { A, B, C, D, E, F, G, H } = this;
            for (let i = 0; i < 64; i++) {
                const sigma1 = rotr$1(E, 6) ^ rotr$1(E, 11) ^ rotr$1(E, 25);
                const T1 = (H + sigma1 + Chi$1(E, F, G) + SHA256_K$1[i] + SHA256_W$1[i]) | 0;
                const sigma0 = rotr$1(A, 2) ^ rotr$1(A, 13) ^ rotr$1(A, 22);
                const T2 = (sigma0 + Maj$1(A, B, C)) | 0;
                H = G;
                G = F;
                F = E;
                E = (D + T1) | 0;
                D = C;
                C = B;
                B = A;
                A = (T1 + T2) | 0;
            }
            // Add the compressed chunk to the current hash value
            A = (A + this.A) | 0;
            B = (B + this.B) | 0;
            C = (C + this.C) | 0;
            D = (D + this.D) | 0;
            E = (E + this.E) | 0;
            F = (F + this.F) | 0;
            G = (G + this.G) | 0;
            H = (H + this.H) | 0;
            this.set(A, B, C, D, E, F, G, H);
        }
        roundClean() {
            clean$2(SHA256_W$1);
        }
        destroy() {
            this.set(0, 0, 0, 0, 0, 0, 0, 0);
            clean$2(this.buffer);
        }
    };
    /** Internal SHA2-256 hash class. */
    let _SHA256$1 = class _SHA256 extends SHA2_32B$1 {
        // We cannot use array here since array allows indexing by variable
        // which means optimizer/compiler cannot use registers.
        A = SHA256_IV$1[0] | 0;
        B = SHA256_IV$1[1] | 0;
        C = SHA256_IV$1[2] | 0;
        D = SHA256_IV$1[3] | 0;
        E = SHA256_IV$1[4] | 0;
        F = SHA256_IV$1[5] | 0;
        G = SHA256_IV$1[6] | 0;
        H = SHA256_IV$1[7] | 0;
        constructor() {
            super(32);
        }
    };
    /**
     * SHA2-256 hash function from RFC 4634. In JS it's the fastest: even faster than Blake3. Some info:
     *
     * - Trying 2^128 hashes would get 50% chance of collision, using birthday attack.
     * - BTC network is doing 2^70 hashes/sec (2^95 hashes/year) as per 2025.
     * - Each sha256 hash is executing 2^18 bit operations.
     * - Good 2024 ASICs can do 200Th/sec with 3500 watts of power, corresponding to 2^36 hashes/joule.
     */
    const sha256$1 = /* @__PURE__ */ createHasher$1(() => new _SHA256$1(), 
    /* @__PURE__ */ oidNist$1(0x01));

    /**
     * Hex, bytes and number utilities.
     * @module
     */
    /*! noble-curves - MIT License (c) 2022 Paul Miller (paulmillr.com) */
    const _0n$4 = /* @__PURE__ */ BigInt(0);
    const _1n$3 = /* @__PURE__ */ BigInt(1);
    function abool$1(value, title = '') {
        if (typeof value !== 'boolean') {
            const prefix = title && `"${title}" `;
            throw new Error(prefix + 'expected boolean, got type=' + typeof value);
        }
        return value;
    }
    // Used in weierstrass, der
    function abignumber(n) {
        if (typeof n === 'bigint') {
            if (!isPosBig(n))
                throw new Error('positive bigint expected, got ' + n);
        }
        else
            anumber$3(n);
        return n;
    }
    function numberToHexUnpadded(num) {
        const hex = abignumber(num).toString(16);
        return hex.length & 1 ? '0' + hex : hex;
    }
    function hexToNumber(hex) {
        if (typeof hex !== 'string')
            throw new Error('hex string expected, got ' + typeof hex);
        return hex === '' ? _0n$4 : BigInt('0x' + hex); // Big Endian
    }
    // BE: Big Endian, LE: Little Endian
    function bytesToNumberBE(bytes) {
        return hexToNumber(bytesToHex$1(bytes));
    }
    function bytesToNumberLE(bytes) {
        return hexToNumber(bytesToHex$1(copyBytes$1(abytes$3(bytes)).reverse()));
    }
    function numberToBytesBE(n, len) {
        anumber$3(len);
        n = abignumber(n);
        const res = hexToBytes$2(n.toString(16).padStart(len * 2, '0'));
        if (res.length !== len)
            throw new Error('number too large');
        return res;
    }
    function numberToBytesLE(n, len) {
        return numberToBytesBE(n, len).reverse();
    }
    /**
     * Copies Uint8Array. We can't use u8a.slice(), because u8a can be Buffer,
     * and Buffer#slice creates mutable copy. Never use Buffers!
     */
    function copyBytes$1(bytes) {
        return Uint8Array.from(bytes);
    }
    /**
     * Decodes 7-bit ASCII string to Uint8Array, throws on non-ascii symbols
     * Should be safe to use for things expected to be ASCII.
     * Returns exact same result as `TextEncoder` for ASCII or throws.
     */
    function asciiToBytes(ascii) {
        return Uint8Array.from(ascii, (c, i) => {
            const charCode = c.charCodeAt(0);
            if (c.length !== 1 || charCode > 127) {
                throw new Error(`string contains non-ASCII character "${ascii[i]}" with code ${charCode} at position ${i}`);
            }
            return charCode;
        });
    }
    // Is positive bigint
    const isPosBig = (n) => typeof n === 'bigint' && _0n$4 <= n;
    function inRange(n, min, max) {
        return isPosBig(n) && isPosBig(min) && isPosBig(max) && min <= n && n < max;
    }
    /**
     * Asserts min <= n < max. NOTE: It's < max and not <= max.
     * @example
     * aInRange('x', x, 1n, 256n); // would assume x is in (1n..255n)
     */
    function aInRange(title, n, min, max) {
        // Why min <= n < max and not a (min < n < max) OR b (min <= n <= max)?
        // consider P=256n, min=0n, max=P
        // - a for min=0 would require -1:          `inRange('x', x, -1n, P)`
        // - b would commonly require subtraction:  `inRange('x', x, 0n, P - 1n)`
        // - our way is the cleanest:               `inRange('x', x, 0n, P)
        if (!inRange(n, min, max))
            throw new Error('expected valid ' + title + ': ' + min + ' <= n < ' + max + ', got ' + n);
    }
    // Bit operations
    /**
     * Calculates amount of bits in a bigint.
     * Same as `n.toString(2).length`
     * TODO: merge with nLength in modular
     */
    function bitLen(n) {
        let len;
        for (len = 0; n > _0n$4; n >>= _1n$3, len += 1)
            ;
        return len;
    }
    /**
     * Calculate mask for N bits. Not using ** operator with bigints because of old engines.
     * Same as BigInt(`0b${Array(i).fill('1').join('')}`)
     */
    const bitMask = (n) => (_1n$3 << BigInt(n)) - _1n$3;
    /**
     * Minimal HMAC-DRBG from NIST 800-90 for RFC6979 sigs.
     * @returns function that will call DRBG until 2nd arg returns something meaningful
     * @example
     *   const drbg = createHmacDRBG<Key>(32, 32, hmac);
     *   drbg(seed, bytesToKey); // bytesToKey must return Key or undefined
     */
    function createHmacDrbg(hashLen, qByteLen, hmacFn) {
        anumber$3(hashLen, 'hashLen');
        anumber$3(qByteLen, 'qByteLen');
        if (typeof hmacFn !== 'function')
            throw new Error('hmacFn must be a function');
        const u8n = (len) => new Uint8Array(len); // creates Uint8Array
        const NULL = Uint8Array.of();
        const byte0 = Uint8Array.of(0x00);
        const byte1 = Uint8Array.of(0x01);
        const _maxDrbgIters = 1000;
        // Step B, Step C: set hashLen to 8*ceil(hlen/8)
        let v = u8n(hashLen); // Minimal non-full-spec HMAC-DRBG from NIST 800-90 for RFC6979 sigs.
        let k = u8n(hashLen); // Steps B and C of RFC6979 3.2: set hashLen, in our case always same
        let i = 0; // Iterations counter, will throw when over 1000
        const reset = () => {
            v.fill(1);
            k.fill(0);
            i = 0;
        };
        const h = (...msgs) => hmacFn(k, concatBytes$1(v, ...msgs)); // hmac(k)(v, ...values)
        const reseed = (seed = NULL) => {
            // HMAC-DRBG reseed() function. Steps D-G
            k = h(byte0, seed); // k = hmac(k || v || 0x00 || seed)
            v = h(); // v = hmac(k || v)
            if (seed.length === 0)
                return;
            k = h(byte1, seed); // k = hmac(k || v || 0x01 || seed)
            v = h(); // v = hmac(k || v)
        };
        const gen = () => {
            // HMAC-DRBG generate() function
            if (i++ >= _maxDrbgIters)
                throw new Error('drbg: tried max amount of iterations');
            let len = 0;
            const out = [];
            while (len < qByteLen) {
                v = h();
                const sl = v.slice();
                out.push(sl);
                len += v.length;
            }
            return concatBytes$1(...out);
        };
        const genUntil = (seed, pred) => {
            reset();
            reseed(seed); // Steps D-G
            let res = undefined; // Step H: grind until k is in [1..n-1]
            while (!(res = pred(gen())))
                reseed();
            reset();
            return res;
        };
        return genUntil;
    }
    function validateObject(object, fields = {}, optFields = {}) {
        if (!object || typeof object !== 'object')
            throw new Error('expected valid options object');
        function checkField(fieldName, expectedType, isOpt) {
            const val = object[fieldName];
            if (isOpt && val === undefined)
                return;
            const current = typeof val;
            if (current !== expectedType || val === null)
                throw new Error(`param "${fieldName}" is invalid: expected ${expectedType}, got ${current}`);
        }
        const iter = (f, isOpt) => Object.entries(f).forEach(([k, v]) => checkField(k, v, isOpt));
        iter(fields, false);
        iter(optFields, true);
    }
    /**
     * Memoizes (caches) computation result.
     * Uses WeakMap: the value is going auto-cleaned by GC after last reference is removed.
     */
    function memoized(fn) {
        const map = new WeakMap();
        return (arg, ...args) => {
            const val = map.get(arg);
            if (val !== undefined)
                return val;
            const computed = fn(arg, ...args);
            map.set(arg, computed);
            return computed;
        };
    }

    /**
     * Utils for modular division and fields.
     * Field over 11 is a finite (Galois) field is integer number operations `mod 11`.
     * There is no division: it is replaced by modular multiplicative inverse.
     * @module
     */
    /*! noble-curves - MIT License (c) 2022 Paul Miller (paulmillr.com) */
    // Numbers aren't used in x25519 / x448 builds
    // prettier-ignore
    const _0n$3 = /* @__PURE__ */ BigInt(0), _1n$2 = /* @__PURE__ */ BigInt(1), _2n$2 = /* @__PURE__ */ BigInt(2);
    // prettier-ignore
    const _3n$1 = /* @__PURE__ */ BigInt(3), _4n$1 = /* @__PURE__ */ BigInt(4), _5n = /* @__PURE__ */ BigInt(5);
    // prettier-ignore
    const _7n = /* @__PURE__ */ BigInt(7), _8n = /* @__PURE__ */ BigInt(8), _9n = /* @__PURE__ */ BigInt(9);
    const _16n = /* @__PURE__ */ BigInt(16);
    // Calculates a modulo b
    function mod(a, b) {
        const result = a % b;
        return result >= _0n$3 ? result : b + result;
    }
    /** Does `x^(2^power)` mod p. `pow2(30, 4)` == `30^(2^4)` */
    function pow2(x, power, modulo) {
        let res = x;
        while (power-- > _0n$3) {
            res *= res;
            res %= modulo;
        }
        return res;
    }
    /**
     * Inverses number over modulo.
     * Implemented using [Euclidean GCD](https://brilliant.org/wiki/extended-euclidean-algorithm/).
     */
    function invert(number, modulo) {
        if (number === _0n$3)
            throw new Error('invert: expected non-zero number');
        if (modulo <= _0n$3)
            throw new Error('invert: expected positive modulus, got ' + modulo);
        // Fermat's little theorem "CT-like" version inv(n) = n^(m-2) mod m is 30x slower.
        let a = mod(number, modulo);
        let b = modulo;
        // prettier-ignore
        let x = _0n$3, u = _1n$2;
        while (a !== _0n$3) {
            // JIT applies optimization if those two lines follow each other
            const q = b / a;
            const r = b % a;
            const m = x - u * q;
            // prettier-ignore
            b = a, a = r, x = u, u = m;
        }
        const gcd = b;
        if (gcd !== _1n$2)
            throw new Error('invert: does not exist');
        return mod(x, modulo);
    }
    function assertIsSquare(Fp, root, n) {
        if (!Fp.eql(Fp.sqr(root), n))
            throw new Error('Cannot find square root');
    }
    // Not all roots are possible! Example which will throw:
    // const NUM =
    // n = 72057594037927816n;
    // Fp = Field(BigInt('0x1a0111ea397fe69a4b1ba7b6434bacd764774b84f38512bf6730d2a0f6b0f6241eabfffeb153ffffb9feffffffffaaab'));
    function sqrt3mod4(Fp, n) {
        const p1div4 = (Fp.ORDER + _1n$2) / _4n$1;
        const root = Fp.pow(n, p1div4);
        assertIsSquare(Fp, root, n);
        return root;
    }
    function sqrt5mod8(Fp, n) {
        const p5div8 = (Fp.ORDER - _5n) / _8n;
        const n2 = Fp.mul(n, _2n$2);
        const v = Fp.pow(n2, p5div8);
        const nv = Fp.mul(n, v);
        const i = Fp.mul(Fp.mul(nv, _2n$2), v);
        const root = Fp.mul(nv, Fp.sub(i, Fp.ONE));
        assertIsSquare(Fp, root, n);
        return root;
    }
    // Based on RFC9380, Kong algorithm
    // prettier-ignore
    function sqrt9mod16(P) {
        const Fp_ = Field(P);
        const tn = tonelliShanks(P);
        const c1 = tn(Fp_, Fp_.neg(Fp_.ONE)); //  1. c1 = sqrt(-1) in F, i.e., (c1^2) == -1 in F
        const c2 = tn(Fp_, c1); //  2. c2 = sqrt(c1) in F, i.e., (c2^2) == c1 in F
        const c3 = tn(Fp_, Fp_.neg(c1)); //  3. c3 = sqrt(-c1) in F, i.e., (c3^2) == -c1 in F
        const c4 = (P + _7n) / _16n; //  4. c4 = (q + 7) / 16        # Integer arithmetic
        return (Fp, n) => {
            let tv1 = Fp.pow(n, c4); //  1. tv1 = x^c4
            let tv2 = Fp.mul(tv1, c1); //  2. tv2 = c1 * tv1
            const tv3 = Fp.mul(tv1, c2); //  3. tv3 = c2 * tv1
            const tv4 = Fp.mul(tv1, c3); //  4. tv4 = c3 * tv1
            const e1 = Fp.eql(Fp.sqr(tv2), n); //  5.  e1 = (tv2^2) == x
            const e2 = Fp.eql(Fp.sqr(tv3), n); //  6.  e2 = (tv3^2) == x
            tv1 = Fp.cmov(tv1, tv2, e1); //  7. tv1 = CMOV(tv1, tv2, e1)  # Select tv2 if (tv2^2) == x
            tv2 = Fp.cmov(tv4, tv3, e2); //  8. tv2 = CMOV(tv4, tv3, e2)  # Select tv3 if (tv3^2) == x
            const e3 = Fp.eql(Fp.sqr(tv2), n); //  9.  e3 = (tv2^2) == x
            const root = Fp.cmov(tv1, tv2, e3); // 10.  z = CMOV(tv1, tv2, e3)   # Select sqrt from tv1 & tv2
            assertIsSquare(Fp, root, n);
            return root;
        };
    }
    /**
     * Tonelli-Shanks square root search algorithm.
     * 1. https://eprint.iacr.org/2012/685.pdf (page 12)
     * 2. Square Roots from 1; 24, 51, 10 to Dan Shanks
     * @param P field order
     * @returns function that takes field Fp (created from P) and number n
     */
    function tonelliShanks(P) {
        // Initialization (precomputation).
        // Caching initialization could boost perf by 7%.
        if (P < _3n$1)
            throw new Error('sqrt is not defined for small field');
        // Factor P - 1 = Q * 2^S, where Q is odd
        let Q = P - _1n$2;
        let S = 0;
        while (Q % _2n$2 === _0n$3) {
            Q /= _2n$2;
            S++;
        }
        // Find the first quadratic non-residue Z >= 2
        let Z = _2n$2;
        const _Fp = Field(P);
        while (FpLegendre(_Fp, Z) === 1) {
            // Basic primality test for P. After x iterations, chance of
            // not finding quadratic non-residue is 2^x, so 2^1000.
            if (Z++ > 1000)
                throw new Error('Cannot find square root: probably non-prime P');
        }
        // Fast-path; usually done before Z, but we do "primality test".
        if (S === 1)
            return sqrt3mod4;
        // Slow-path
        // TODO: test on Fp2 and others
        let cc = _Fp.pow(Z, Q); // c = z^Q
        const Q1div2 = (Q + _1n$2) / _2n$2;
        return function tonelliSlow(Fp, n) {
            if (Fp.is0(n))
                return n;
            // Check if n is a quadratic residue using Legendre symbol
            if (FpLegendre(Fp, n) !== 1)
                throw new Error('Cannot find square root');
            // Initialize variables for the main loop
            let M = S;
            let c = Fp.mul(Fp.ONE, cc); // c = z^Q, move cc from field _Fp into field Fp
            let t = Fp.pow(n, Q); // t = n^Q, first guess at the fudge factor
            let R = Fp.pow(n, Q1div2); // R = n^((Q+1)/2), first guess at the square root
            // Main loop
            // while t != 1
            while (!Fp.eql(t, Fp.ONE)) {
                if (Fp.is0(t))
                    return Fp.ZERO; // if t=0 return R=0
                let i = 1;
                // Find the smallest i >= 1 such that t^(2^i) ≡ 1 (mod P)
                let t_tmp = Fp.sqr(t); // t^(2^1)
                while (!Fp.eql(t_tmp, Fp.ONE)) {
                    i++;
                    t_tmp = Fp.sqr(t_tmp); // t^(2^2)...
                    if (i === M)
                        throw new Error('Cannot find square root');
                }
                // Calculate the exponent for b: 2^(M - i - 1)
                const exponent = _1n$2 << BigInt(M - i - 1); // bigint is important
                const b = Fp.pow(c, exponent); // b = 2^(M - i - 1)
                // Update variables
                M = i;
                c = Fp.sqr(b); // c = b^2
                t = Fp.mul(t, c); // t = (t * b^2)
                R = Fp.mul(R, b); // R = R*b
            }
            return R;
        };
    }
    /**
     * Square root for a finite field. Will try optimized versions first:
     *
     * 1. P ≡ 3 (mod 4)
     * 2. P ≡ 5 (mod 8)
     * 3. P ≡ 9 (mod 16)
     * 4. Tonelli-Shanks algorithm
     *
     * Different algorithms can give different roots, it is up to user to decide which one they want.
     * For example there is FpSqrtOdd/FpSqrtEven to choice root based on oddness (used for hash-to-curve).
     */
    function FpSqrt(P) {
        // P ≡ 3 (mod 4) => √n = n^((P+1)/4)
        if (P % _4n$1 === _3n$1)
            return sqrt3mod4;
        // P ≡ 5 (mod 8) => Atkin algorithm, page 10 of https://eprint.iacr.org/2012/685.pdf
        if (P % _8n === _5n)
            return sqrt5mod8;
        // P ≡ 9 (mod 16) => Kong algorithm, page 11 of https://eprint.iacr.org/2012/685.pdf (algorithm 4)
        if (P % _16n === _9n)
            return sqrt9mod16(P);
        // Tonelli-Shanks algorithm
        return tonelliShanks(P);
    }
    // prettier-ignore
    const FIELD_FIELDS = [
        'create', 'isValid', 'is0', 'neg', 'inv', 'sqrt', 'sqr',
        'eql', 'add', 'sub', 'mul', 'pow', 'div',
        'addN', 'subN', 'mulN', 'sqrN'
    ];
    function validateField(field) {
        const initial = {
            ORDER: 'bigint',
            BYTES: 'number',
            BITS: 'number',
        };
        const opts = FIELD_FIELDS.reduce((map, val) => {
            map[val] = 'function';
            return map;
        }, initial);
        validateObject(field, opts);
        // const max = 16384;
        // if (field.BYTES < 1 || field.BYTES > max) throw new Error('invalid field');
        // if (field.BITS < 1 || field.BITS > 8 * max) throw new Error('invalid field');
        return field;
    }
    // Generic field functions
    /**
     * Same as `pow` but for Fp: non-constant-time.
     * Unsafe in some contexts: uses ladder, so can expose bigint bits.
     */
    function FpPow(Fp, num, power) {
        if (power < _0n$3)
            throw new Error('invalid exponent, negatives unsupported');
        if (power === _0n$3)
            return Fp.ONE;
        if (power === _1n$2)
            return num;
        let p = Fp.ONE;
        let d = num;
        while (power > _0n$3) {
            if (power & _1n$2)
                p = Fp.mul(p, d);
            d = Fp.sqr(d);
            power >>= _1n$2;
        }
        return p;
    }
    /**
     * Efficiently invert an array of Field elements.
     * Exception-free. Will return `undefined` for 0 elements.
     * @param passZero map 0 to 0 (instead of undefined)
     */
    function FpInvertBatch(Fp, nums, passZero = false) {
        const inverted = new Array(nums.length).fill(passZero ? Fp.ZERO : undefined);
        // Walk from first to last, multiply them by each other MOD p
        const multipliedAcc = nums.reduce((acc, num, i) => {
            if (Fp.is0(num))
                return acc;
            inverted[i] = acc;
            return Fp.mul(acc, num);
        }, Fp.ONE);
        // Invert last element
        const invertedAcc = Fp.inv(multipliedAcc);
        // Walk from last to first, multiply them by inverted each other MOD p
        nums.reduceRight((acc, num, i) => {
            if (Fp.is0(num))
                return acc;
            inverted[i] = Fp.mul(acc, inverted[i]);
            return Fp.mul(acc, num);
        }, invertedAcc);
        return inverted;
    }
    /**
     * Legendre symbol.
     * Legendre constant is used to calculate Legendre symbol (a | p)
     * which denotes the value of a^((p-1)/2) (mod p).
     *
     * * (a | p) ≡ 1    if a is a square (mod p), quadratic residue
     * * (a | p) ≡ -1   if a is not a square (mod p), quadratic non residue
     * * (a | p) ≡ 0    if a ≡ 0 (mod p)
     */
    function FpLegendre(Fp, n) {
        // We can use 3rd argument as optional cache of this value
        // but seems unneeded for now. The operation is very fast.
        const p1mod2 = (Fp.ORDER - _1n$2) / _2n$2;
        const powered = Fp.pow(n, p1mod2);
        const yes = Fp.eql(powered, Fp.ONE);
        const zero = Fp.eql(powered, Fp.ZERO);
        const no = Fp.eql(powered, Fp.neg(Fp.ONE));
        if (!yes && !zero && !no)
            throw new Error('invalid Legendre symbol result');
        return yes ? 1 : zero ? 0 : -1;
    }
    // CURVE.n lengths
    function nLength(n, nBitLength) {
        // Bit size, byte size of CURVE.n
        if (nBitLength !== undefined)
            anumber$3(nBitLength);
        const _nBitLength = nBitLength !== undefined ? nBitLength : n.toString(2).length;
        const nByteLength = Math.ceil(_nBitLength / 8);
        return { nBitLength: _nBitLength, nByteLength };
    }
    class _Field {
        ORDER;
        BITS;
        BYTES;
        isLE;
        ZERO = _0n$3;
        ONE = _1n$2;
        _lengths;
        _sqrt; // cached sqrt
        _mod;
        constructor(ORDER, opts = {}) {
            if (ORDER <= _0n$3)
                throw new Error('invalid field: expected ORDER > 0, got ' + ORDER);
            let _nbitLength = undefined;
            this.isLE = false;
            if (opts != null && typeof opts === 'object') {
                if (typeof opts.BITS === 'number')
                    _nbitLength = opts.BITS;
                if (typeof opts.sqrt === 'function')
                    this.sqrt = opts.sqrt;
                if (typeof opts.isLE === 'boolean')
                    this.isLE = opts.isLE;
                if (opts.allowedLengths)
                    this._lengths = opts.allowedLengths?.slice();
                if (typeof opts.modFromBytes === 'boolean')
                    this._mod = opts.modFromBytes;
            }
            const { nBitLength, nByteLength } = nLength(ORDER, _nbitLength);
            if (nByteLength > 2048)
                throw new Error('invalid field: expected ORDER of <= 2048 bytes');
            this.ORDER = ORDER;
            this.BITS = nBitLength;
            this.BYTES = nByteLength;
            this._sqrt = undefined;
            Object.preventExtensions(this);
        }
        create(num) {
            return mod(num, this.ORDER);
        }
        isValid(num) {
            if (typeof num !== 'bigint')
                throw new Error('invalid field element: expected bigint, got ' + typeof num);
            return _0n$3 <= num && num < this.ORDER; // 0 is valid element, but it's not invertible
        }
        is0(num) {
            return num === _0n$3;
        }
        // is valid and invertible
        isValidNot0(num) {
            return !this.is0(num) && this.isValid(num);
        }
        isOdd(num) {
            return (num & _1n$2) === _1n$2;
        }
        neg(num) {
            return mod(-num, this.ORDER);
        }
        eql(lhs, rhs) {
            return lhs === rhs;
        }
        sqr(num) {
            return mod(num * num, this.ORDER);
        }
        add(lhs, rhs) {
            return mod(lhs + rhs, this.ORDER);
        }
        sub(lhs, rhs) {
            return mod(lhs - rhs, this.ORDER);
        }
        mul(lhs, rhs) {
            return mod(lhs * rhs, this.ORDER);
        }
        pow(num, power) {
            return FpPow(this, num, power);
        }
        div(lhs, rhs) {
            return mod(lhs * invert(rhs, this.ORDER), this.ORDER);
        }
        // Same as above, but doesn't normalize
        sqrN(num) {
            return num * num;
        }
        addN(lhs, rhs) {
            return lhs + rhs;
        }
        subN(lhs, rhs) {
            return lhs - rhs;
        }
        mulN(lhs, rhs) {
            return lhs * rhs;
        }
        inv(num) {
            return invert(num, this.ORDER);
        }
        sqrt(num) {
            // Caching _sqrt speeds up sqrt9mod16 by 5x and tonneli-shanks by 10%
            if (!this._sqrt)
                this._sqrt = FpSqrt(this.ORDER);
            return this._sqrt(this, num);
        }
        toBytes(num) {
            return this.isLE ? numberToBytesLE(num, this.BYTES) : numberToBytesBE(num, this.BYTES);
        }
        fromBytes(bytes, skipValidation = false) {
            abytes$3(bytes);
            const { _lengths: allowedLengths, BYTES, isLE, ORDER, _mod: modFromBytes } = this;
            if (allowedLengths) {
                if (!allowedLengths.includes(bytes.length) || bytes.length > BYTES) {
                    throw new Error('Field.fromBytes: expected ' + allowedLengths + ' bytes, got ' + bytes.length);
                }
                const padded = new Uint8Array(BYTES);
                // isLE add 0 to right, !isLE to the left.
                padded.set(bytes, isLE ? 0 : padded.length - bytes.length);
                bytes = padded;
            }
            if (bytes.length !== BYTES)
                throw new Error('Field.fromBytes: expected ' + BYTES + ' bytes, got ' + bytes.length);
            let scalar = isLE ? bytesToNumberLE(bytes) : bytesToNumberBE(bytes);
            if (modFromBytes)
                scalar = mod(scalar, ORDER);
            if (!skipValidation)
                if (!this.isValid(scalar))
                    throw new Error('invalid field element: outside of range 0..ORDER');
            // NOTE: we don't validate scalar here, please use isValid. This done such way because some
            // protocol may allow non-reduced scalar that reduced later or changed some other way.
            return scalar;
        }
        // TODO: we don't need it here, move out to separate fn
        invertBatch(lst) {
            return FpInvertBatch(this, lst);
        }
        // We can't move this out because Fp6, Fp12 implement it
        // and it's unclear what to return in there.
        cmov(a, b, condition) {
            return condition ? b : a;
        }
    }
    /**
     * Creates a finite field. Major performance optimizations:
     * * 1. Denormalized operations like mulN instead of mul.
     * * 2. Identical object shape: never add or remove keys.
     * * 3. `Object.freeze`.
     * Fragile: always run a benchmark on a change.
     * Security note: operations don't check 'isValid' for all elements for performance reasons,
     * it is caller responsibility to check this.
     * This is low-level code, please make sure you know what you're doing.
     *
     * Note about field properties:
     * * CHARACTERISTIC p = prime number, number of elements in main subgroup.
     * * ORDER q = similar to cofactor in curves, may be composite `q = p^m`.
     *
     * @param ORDER field order, probably prime, or could be composite
     * @param bitLen how many bits the field consumes
     * @param isLE (default: false) if encoding / decoding should be in little-endian
     * @param redef optional faster redefinitions of sqrt and other methods
     */
    function Field(ORDER, opts = {}) {
        return new _Field(ORDER, opts);
    }
    /**
     * Returns total number of bytes consumed by the field element.
     * For example, 32 bytes for usual 256-bit weierstrass curve.
     * @param fieldOrder number of field elements, usually CURVE.n
     * @returns byte length of field
     */
    function getFieldBytesLength(fieldOrder) {
        if (typeof fieldOrder !== 'bigint')
            throw new Error('field order must be bigint');
        const bitLength = fieldOrder.toString(2).length;
        return Math.ceil(bitLength / 8);
    }
    /**
     * Returns minimal amount of bytes that can be safely reduced
     * by field order.
     * Should be 2^-128 for 128-bit curve such as P256.
     * @param fieldOrder number of field elements, usually CURVE.n
     * @returns byte length of target hash
     */
    function getMinHashLength(fieldOrder) {
        const length = getFieldBytesLength(fieldOrder);
        return length + Math.ceil(length / 2);
    }
    /**
     * "Constant-time" private key generation utility.
     * Can take (n + n/2) or more bytes of uniform input e.g. from CSPRNG or KDF
     * and convert them into private scalar, with the modulo bias being negligible.
     * Needs at least 48 bytes of input for 32-byte private key.
     * https://research.kudelskisecurity.com/2020/07/28/the-definitive-guide-to-modulo-bias-and-how-to-avoid-it/
     * FIPS 186-5, A.2 https://csrc.nist.gov/publications/detail/fips/186/5/final
     * RFC 9380, https://www.rfc-editor.org/rfc/rfc9380#section-5
     * @param hash hash output from SHA3 or a similar function
     * @param groupOrder size of subgroup - (e.g. secp256k1.Point.Fn.ORDER)
     * @param isLE interpret hash bytes as LE num
     * @returns valid private scalar
     */
    function mapHashToField(key, fieldOrder, isLE = false) {
        abytes$3(key);
        const len = key.length;
        const fieldLen = getFieldBytesLength(fieldOrder);
        const minLen = getMinHashLength(fieldOrder);
        // No small numbers: need to understand bias story. No huge numbers: easier to detect JS timings.
        if (len < 16 || len < minLen || len > 1024)
            throw new Error('expected ' + minLen + '-1024 bytes of input, got ' + len);
        const num = isLE ? bytesToNumberLE(key) : bytesToNumberBE(key);
        // `mod(x, 11)` can sometimes produce 0. `mod(x, 10) + 1` is the same, but no 0
        const reduced = mod(num, fieldOrder - _1n$2) + _1n$2;
        return isLE ? numberToBytesLE(reduced, fieldLen) : numberToBytesBE(reduced, fieldLen);
    }

    /**
     * Methods for elliptic curve multiplication by scalars.
     * Contains wNAF, pippenger.
     * @module
     */
    /*! noble-curves - MIT License (c) 2022 Paul Miller (paulmillr.com) */
    const _0n$2 = /* @__PURE__ */ BigInt(0);
    const _1n$1 = /* @__PURE__ */ BigInt(1);
    function negateCt(condition, item) {
        const neg = item.negate();
        return condition ? neg : item;
    }
    /**
     * Takes a bunch of Projective Points but executes only one
     * inversion on all of them. Inversion is very slow operation,
     * so this improves performance massively.
     * Optimization: converts a list of projective points to a list of identical points with Z=1.
     */
    function normalizeZ(c, points) {
        const invertedZs = FpInvertBatch(c.Fp, points.map((p) => p.Z));
        return points.map((p, i) => c.fromAffine(p.toAffine(invertedZs[i])));
    }
    function validateW(W, bits) {
        if (!Number.isSafeInteger(W) || W <= 0 || W > bits)
            throw new Error('invalid window size, expected [1..' + bits + '], got W=' + W);
    }
    function calcWOpts(W, scalarBits) {
        validateW(W, scalarBits);
        const windows = Math.ceil(scalarBits / W) + 1; // W=8 33. Not 32, because we skip zero
        const windowSize = 2 ** (W - 1); // W=8 128. Not 256, because we skip zero
        const maxNumber = 2 ** W; // W=8 256
        const mask = bitMask(W); // W=8 255 == mask 0b11111111
        const shiftBy = BigInt(W); // W=8 8
        return { windows, windowSize, mask, maxNumber, shiftBy };
    }
    function calcOffsets(n, window, wOpts) {
        const { windowSize, mask, maxNumber, shiftBy } = wOpts;
        let wbits = Number(n & mask); // extract W bits.
        let nextN = n >> shiftBy; // shift number by W bits.
        // What actually happens here:
        // const highestBit = Number(mask ^ (mask >> 1n));
        // let wbits2 = wbits - 1; // skip zero
        // if (wbits2 & highestBit) { wbits2 ^= Number(mask); // (~);
        // split if bits > max: +224 => 256-32
        if (wbits > windowSize) {
            // we skip zero, which means instead of `>= size-1`, we do `> size`
            wbits -= maxNumber; // -32, can be maxNumber - wbits, but then we need to set isNeg here.
            nextN += _1n$1; // +256 (carry)
        }
        const offsetStart = window * windowSize;
        const offset = offsetStart + Math.abs(wbits) - 1; // -1 because we skip zero
        const isZero = wbits === 0; // is current window slice a 0?
        const isNeg = wbits < 0; // is current window slice negative?
        const isNegF = window % 2 !== 0; // fake random statement for noise
        const offsetF = offsetStart; // fake offset for noise
        return { nextN, offset, isZero, isNeg, isNegF, offsetF };
    }
    // Since points in different groups cannot be equal (different object constructor),
    // we can have single place to store precomputes.
    // Allows to make points frozen / immutable.
    const pointPrecomputes = new WeakMap();
    const pointWindowSizes = new WeakMap();
    function getW(P) {
        // To disable precomputes:
        // return 1;
        return pointWindowSizes.get(P) || 1;
    }
    function assert0(n) {
        if (n !== _0n$2)
            throw new Error('invalid wNAF');
    }
    /**
     * Elliptic curve multiplication of Point by scalar. Fragile.
     * Table generation takes **30MB of ram and 10ms on high-end CPU**,
     * but may take much longer on slow devices. Actual generation will happen on
     * first call of `multiply()`. By default, `BASE` point is precomputed.
     *
     * Scalars should always be less than curve order: this should be checked inside of a curve itself.
     * Creates precomputation tables for fast multiplication:
     * - private scalar is split by fixed size windows of W bits
     * - every window point is collected from window's table & added to accumulator
     * - since windows are different, same point inside tables won't be accessed more than once per calc
     * - each multiplication is 'Math.ceil(CURVE_ORDER / 𝑊) + 1' point additions (fixed for any scalar)
     * - +1 window is neccessary for wNAF
     * - wNAF reduces table size: 2x less memory + 2x faster generation, but 10% slower multiplication
     *
     * @todo Research returning 2d JS array of windows, instead of a single window.
     * This would allow windows to be in different memory locations
     */
    class wNAF {
        BASE;
        ZERO;
        Fn;
        bits;
        // Parametrized with a given Point class (not individual point)
        constructor(Point, bits) {
            this.BASE = Point.BASE;
            this.ZERO = Point.ZERO;
            this.Fn = Point.Fn;
            this.bits = bits;
        }
        // non-const time multiplication ladder
        _unsafeLadder(elm, n, p = this.ZERO) {
            let d = elm;
            while (n > _0n$2) {
                if (n & _1n$1)
                    p = p.add(d);
                d = d.double();
                n >>= _1n$1;
            }
            return p;
        }
        /**
         * Creates a wNAF precomputation window. Used for caching.
         * Default window size is set by `utils.precompute()` and is equal to 8.
         * Number of precomputed points depends on the curve size:
         * 2^(𝑊−1) * (Math.ceil(𝑛 / 𝑊) + 1), where:
         * - 𝑊 is the window size
         * - 𝑛 is the bitlength of the curve order.
         * For a 256-bit curve and window size 8, the number of precomputed points is 128 * 33 = 4224.
         * @param point Point instance
         * @param W window size
         * @returns precomputed point tables flattened to a single array
         */
        precomputeWindow(point, W) {
            const { windows, windowSize } = calcWOpts(W, this.bits);
            const points = [];
            let p = point;
            let base = p;
            for (let window = 0; window < windows; window++) {
                base = p;
                points.push(base);
                // i=1, bc we skip 0
                for (let i = 1; i < windowSize; i++) {
                    base = base.add(p);
                    points.push(base);
                }
                p = base.double();
            }
            return points;
        }
        /**
         * Implements ec multiplication using precomputed tables and w-ary non-adjacent form.
         * More compact implementation:
         * https://github.com/paulmillr/noble-secp256k1/blob/47cb1669b6e506ad66b35fe7d76132ae97465da2/index.ts#L502-L541
         * @returns real and fake (for const-time) points
         */
        wNAF(W, precomputes, n) {
            // Scalar should be smaller than field order
            if (!this.Fn.isValid(n))
                throw new Error('invalid scalar');
            // Accumulators
            let p = this.ZERO;
            let f = this.BASE;
            // This code was first written with assumption that 'f' and 'p' will never be infinity point:
            // since each addition is multiplied by 2 ** W, it cannot cancel each other. However,
            // there is negate now: it is possible that negated element from low value
            // would be the same as high element, which will create carry into next window.
            // It's not obvious how this can fail, but still worth investigating later.
            const wo = calcWOpts(W, this.bits);
            for (let window = 0; window < wo.windows; window++) {
                // (n === _0n) is handled and not early-exited. isEven and offsetF are used for noise
                const { nextN, offset, isZero, isNeg, isNegF, offsetF } = calcOffsets(n, window, wo);
                n = nextN;
                if (isZero) {
                    // bits are 0: add garbage to fake point
                    // Important part for const-time getPublicKey: add random "noise" point to f.
                    f = f.add(negateCt(isNegF, precomputes[offsetF]));
                }
                else {
                    // bits are 1: add to result point
                    p = p.add(negateCt(isNeg, precomputes[offset]));
                }
            }
            assert0(n);
            // Return both real and fake points: JIT won't eliminate f.
            // At this point there is a way to F be infinity-point even if p is not,
            // which makes it less const-time: around 1 bigint multiply.
            return { p, f };
        }
        /**
         * Implements ec unsafe (non const-time) multiplication using precomputed tables and w-ary non-adjacent form.
         * @param acc accumulator point to add result of multiplication
         * @returns point
         */
        wNAFUnsafe(W, precomputes, n, acc = this.ZERO) {
            const wo = calcWOpts(W, this.bits);
            for (let window = 0; window < wo.windows; window++) {
                if (n === _0n$2)
                    break; // Early-exit, skip 0 value
                const { nextN, offset, isZero, isNeg } = calcOffsets(n, window, wo);
                n = nextN;
                if (isZero) {
                    // Window bits are 0: skip processing.
                    // Move to next window.
                    continue;
                }
                else {
                    const item = precomputes[offset];
                    acc = acc.add(isNeg ? item.negate() : item); // Re-using acc allows to save adds in MSM
                }
            }
            assert0(n);
            return acc;
        }
        getPrecomputes(W, point, transform) {
            // Calculate precomputes on a first run, reuse them after
            let comp = pointPrecomputes.get(point);
            if (!comp) {
                comp = this.precomputeWindow(point, W);
                if (W !== 1) {
                    // Doing transform outside of if brings 15% perf hit
                    if (typeof transform === 'function')
                        comp = transform(comp);
                    pointPrecomputes.set(point, comp);
                }
            }
            return comp;
        }
        cached(point, scalar, transform) {
            const W = getW(point);
            return this.wNAF(W, this.getPrecomputes(W, point, transform), scalar);
        }
        unsafe(point, scalar, transform, prev) {
            const W = getW(point);
            if (W === 1)
                return this._unsafeLadder(point, scalar, prev); // For W=1 ladder is ~x2 faster
            return this.wNAFUnsafe(W, this.getPrecomputes(W, point, transform), scalar, prev);
        }
        // We calculate precomputes for elliptic curve point multiplication
        // using windowed method. This specifies window size and
        // stores precomputed values. Usually only base point would be precomputed.
        createCache(P, W) {
            validateW(W, this.bits);
            pointWindowSizes.set(P, W);
            pointPrecomputes.delete(P);
        }
        hasCache(elm) {
            return getW(elm) !== 1;
        }
    }
    /**
     * Endomorphism-specific multiplication for Koblitz curves.
     * Cost: 128 dbl, 0-256 adds.
     */
    function mulEndoUnsafe(Point, point, k1, k2) {
        let acc = point;
        let p1 = Point.ZERO;
        let p2 = Point.ZERO;
        while (k1 > _0n$2 || k2 > _0n$2) {
            if (k1 & _1n$1)
                p1 = p1.add(acc);
            if (k2 & _1n$1)
                p2 = p2.add(acc);
            acc = acc.double();
            k1 >>= _1n$1;
            k2 >>= _1n$1;
        }
        return { p1, p2 };
    }
    function createField(order, field, isLE) {
        if (field) {
            if (field.ORDER !== order)
                throw new Error('Field.ORDER must match order: Fp == p, Fn == n');
            validateField(field);
            return field;
        }
        else {
            return Field(order, { isLE });
        }
    }
    /** Validates CURVE opts and creates fields */
    function createCurveFields(type, CURVE, curveOpts = {}, FpFnLE) {
        if (FpFnLE === undefined)
            FpFnLE = type === 'edwards';
        if (!CURVE || typeof CURVE !== 'object')
            throw new Error(`expected valid ${type} CURVE object`);
        for (const p of ['p', 'n', 'h']) {
            const val = CURVE[p];
            if (!(typeof val === 'bigint' && val > _0n$2))
                throw new Error(`CURVE.${p} must be positive bigint`);
        }
        const Fp = createField(CURVE.p, curveOpts.Fp, FpFnLE);
        const Fn = createField(CURVE.n, curveOpts.Fn, FpFnLE);
        const _b = 'b' ;
        const params = ['Gx', 'Gy', 'a', _b];
        for (const p of params) {
            // @ts-ignore
            if (!Fp.isValid(CURVE[p]))
                throw new Error(`CURVE.${p} must be valid field element of CURVE.Fp`);
        }
        CURVE = Object.freeze(Object.assign({}, CURVE));
        return { CURVE, Fp, Fn };
    }
    function createKeygen(randomSecretKey, getPublicKey) {
        return function keygen(seed) {
            const secretKey = randomSecretKey(seed);
            return { secretKey, publicKey: getPublicKey(secretKey) };
        };
    }

    /**
     * HMAC: RFC2104 message authentication code.
     * @module
     */
    /** Internal class for HMAC. */
    let _HMAC$1 = class _HMAC {
        oHash;
        iHash;
        blockLen;
        outputLen;
        finished = false;
        destroyed = false;
        constructor(hash, key) {
            ahash$1(hash);
            abytes$3(key, undefined, 'key');
            this.iHash = hash.create();
            if (typeof this.iHash.update !== 'function')
                throw new Error('Expected instance of class which extends utils.Hash');
            this.blockLen = this.iHash.blockLen;
            this.outputLen = this.iHash.outputLen;
            const blockLen = this.blockLen;
            const pad = new Uint8Array(blockLen);
            // blockLen can be bigger than outputLen
            pad.set(key.length > blockLen ? hash.create().update(key).digest() : key);
            for (let i = 0; i < pad.length; i++)
                pad[i] ^= 0x36;
            this.iHash.update(pad);
            // By doing update (processing of first block) of outer hash here we can re-use it between multiple calls via clone
            this.oHash = hash.create();
            // Undo internal XOR && apply outer XOR
            for (let i = 0; i < pad.length; i++)
                pad[i] ^= 0x36 ^ 0x5c;
            this.oHash.update(pad);
            clean$2(pad);
        }
        update(buf) {
            aexists$1(this);
            this.iHash.update(buf);
            return this;
        }
        digestInto(out) {
            aexists$1(this);
            abytes$3(out, this.outputLen, 'output');
            this.finished = true;
            this.iHash.digestInto(out);
            this.oHash.update(out);
            this.oHash.digestInto(out);
            this.destroy();
        }
        digest() {
            const out = new Uint8Array(this.oHash.outputLen);
            this.digestInto(out);
            return out;
        }
        _cloneInto(to) {
            // Create new instance without calling constructor since key already in state and we don't know it.
            to ||= Object.create(Object.getPrototypeOf(this), {});
            const { oHash, iHash, finished, destroyed, blockLen, outputLen } = this;
            to = to;
            to.finished = finished;
            to.destroyed = destroyed;
            to.blockLen = blockLen;
            to.outputLen = outputLen;
            to.oHash = oHash._cloneInto(to.oHash);
            to.iHash = iHash._cloneInto(to.iHash);
            return to;
        }
        clone() {
            return this._cloneInto();
        }
        destroy() {
            this.destroyed = true;
            this.oHash.destroy();
            this.iHash.destroy();
        }
    };
    /**
     * HMAC: RFC2104 message authentication code.
     * @param hash - function that would be used e.g. sha256
     * @param key - message key
     * @param message - message data
     * @example
     * import { hmac } from '@noble/hashes/hmac';
     * import { sha256 } from '@noble/hashes/sha2';
     * const mac1 = hmac(sha256, 'key', 'message');
     */
    const hmac$1 = (hash, key, message) => new _HMAC$1(hash, key).update(message).digest();
    hmac$1.create = (hash, key) => new _HMAC$1(hash, key);

    /**
     * Short Weierstrass curve methods. The formula is: y² = x³ + ax + b.
     *
     * ### Design rationale for types
     *
     * * Interaction between classes from different curves should fail:
     *   `k256.Point.BASE.add(p256.Point.BASE)`
     * * For this purpose we want to use `instanceof` operator, which is fast and works during runtime
     * * Different calls of `curve()` would return different classes -
     *   `curve(params) !== curve(params)`: if somebody decided to monkey-patch their curve,
     *   it won't affect others
     *
     * TypeScript can't infer types for classes created inside a function. Classes is one instance
     * of nominative types in TypeScript and interfaces only check for shape, so it's hard to create
     * unique type for every function call.
     *
     * We can use generic types via some param, like curve opts, but that would:
     *     1. Enable interaction between `curve(params)` and `curve(params)` (curves of same params)
     *     which is hard to debug.
     *     2. Params can be generic and we can't enforce them to be constant value:
     *     if somebody creates curve from non-constant params,
     *     it would be allowed to interact with other curves with non-constant params
     *
     * @todo https://www.typescriptlang.org/docs/handbook/release-notes/typescript-2-7.html#unique-symbol
     * @module
     */
    /*! noble-curves - MIT License (c) 2022 Paul Miller (paulmillr.com) */
    // We construct basis in such way that den is always positive and equals n, but num sign depends on basis (not on secret value)
    const divNearest = (num, den) => (num + (num >= 0 ? den : -den) / _2n$1) / den;
    /**
     * Splits scalar for GLV endomorphism.
     */
    function _splitEndoScalar(k, basis, n) {
        // Split scalar into two such that part is ~half bits: `abs(part) < sqrt(N)`
        // Since part can be negative, we need to do this on point.
        // TODO: verifyScalar function which consumes lambda
        const [[a1, b1], [a2, b2]] = basis;
        const c1 = divNearest(b2 * k, n);
        const c2 = divNearest(-b1 * k, n);
        // |k1|/|k2| is < sqrt(N), but can be negative.
        // If we do `k1 mod N`, we'll get big scalar (`> sqrt(N)`): so, we do cheaper negation instead.
        let k1 = k - c1 * a1 - c2 * a2;
        let k2 = -c1 * b1 - c2 * b2;
        const k1neg = k1 < _0n$1;
        const k2neg = k2 < _0n$1;
        if (k1neg)
            k1 = -k1;
        if (k2neg)
            k2 = -k2;
        // Double check that resulting scalar less than half bits of N: otherwise wNAF will fail.
        // This should only happen on wrong basises. Also, math inside is too complex and I don't trust it.
        const MAX_NUM = bitMask(Math.ceil(bitLen(n) / 2)) + _1n; // Half bits of N
        if (k1 < _0n$1 || k1 >= MAX_NUM || k2 < _0n$1 || k2 >= MAX_NUM) {
            throw new Error('splitScalar (endomorphism): failed, k=' + k);
        }
        return { k1neg, k1, k2neg, k2 };
    }
    function validateSigFormat(format) {
        if (!['compact', 'recovered', 'der'].includes(format))
            throw new Error('Signature format must be "compact", "recovered", or "der"');
        return format;
    }
    function validateSigOpts(opts, def) {
        const optsn = {};
        for (let optName of Object.keys(def)) {
            // @ts-ignore
            optsn[optName] = opts[optName] === undefined ? def[optName] : opts[optName];
        }
        abool$1(optsn.lowS, 'lowS');
        abool$1(optsn.prehash, 'prehash');
        if (optsn.format !== undefined)
            validateSigFormat(optsn.format);
        return optsn;
    }
    class DERErr extends Error {
        constructor(m = '') {
            super(m);
        }
    }
    /**
     * ASN.1 DER encoding utilities. ASN is very complex & fragile. Format:
     *
     *     [0x30 (SEQUENCE), bytelength, 0x02 (INTEGER), intLength, R, 0x02 (INTEGER), intLength, S]
     *
     * Docs: https://letsencrypt.org/docs/a-warm-welcome-to-asn1-and-der/, https://luca.ntop.org/Teaching/Appunti/asn1.html
     */
    const DER = {
        // asn.1 DER encoding utils
        Err: DERErr,
        // Basic building block is TLV (Tag-Length-Value)
        _tlv: {
            encode: (tag, data) => {
                const { Err: E } = DER;
                if (tag < 0 || tag > 256)
                    throw new E('tlv.encode: wrong tag');
                if (data.length & 1)
                    throw new E('tlv.encode: unpadded data');
                const dataLen = data.length / 2;
                const len = numberToHexUnpadded(dataLen);
                if ((len.length / 2) & 0b1000_0000)
                    throw new E('tlv.encode: long form length too big');
                // length of length with long form flag
                const lenLen = dataLen > 127 ? numberToHexUnpadded((len.length / 2) | 0b1000_0000) : '';
                const t = numberToHexUnpadded(tag);
                return t + lenLen + len + data;
            },
            // v - value, l - left bytes (unparsed)
            decode(tag, data) {
                const { Err: E } = DER;
                let pos = 0;
                if (tag < 0 || tag > 256)
                    throw new E('tlv.encode: wrong tag');
                if (data.length < 2 || data[pos++] !== tag)
                    throw new E('tlv.decode: wrong tlv');
                const first = data[pos++];
                const isLong = !!(first & 0b1000_0000); // First bit of first length byte is flag for short/long form
                let length = 0;
                if (!isLong)
                    length = first;
                else {
                    // Long form: [longFlag(1bit), lengthLength(7bit), length (BE)]
                    const lenLen = first & 0b0111_1111;
                    if (!lenLen)
                        throw new E('tlv.decode(long): indefinite length not supported');
                    if (lenLen > 4)
                        throw new E('tlv.decode(long): byte length is too big'); // this will overflow u32 in js
                    const lengthBytes = data.subarray(pos, pos + lenLen);
                    if (lengthBytes.length !== lenLen)
                        throw new E('tlv.decode: length bytes not complete');
                    if (lengthBytes[0] === 0)
                        throw new E('tlv.decode(long): zero leftmost byte');
                    for (const b of lengthBytes)
                        length = (length << 8) | b;
                    pos += lenLen;
                    if (length < 128)
                        throw new E('tlv.decode(long): not minimal encoding');
                }
                const v = data.subarray(pos, pos + length);
                if (v.length !== length)
                    throw new E('tlv.decode: wrong value length');
                return { v, l: data.subarray(pos + length) };
            },
        },
        // https://crypto.stackexchange.com/a/57734 Leftmost bit of first byte is 'negative' flag,
        // since we always use positive integers here. It must always be empty:
        // - add zero byte if exists
        // - if next byte doesn't have a flag, leading zero is not allowed (minimal encoding)
        _int: {
            encode(num) {
                const { Err: E } = DER;
                if (num < _0n$1)
                    throw new E('integer: negative integers are not allowed');
                let hex = numberToHexUnpadded(num);
                // Pad with zero byte if negative flag is present
                if (Number.parseInt(hex[0], 16) & 0b1000)
                    hex = '00' + hex;
                if (hex.length & 1)
                    throw new E('unexpected DER parsing assertion: unpadded hex');
                return hex;
            },
            decode(data) {
                const { Err: E } = DER;
                if (data[0] & 0b1000_0000)
                    throw new E('invalid signature integer: negative');
                if (data[0] === 0x00 && !(data[1] & 0b1000_0000))
                    throw new E('invalid signature integer: unnecessary leading zero');
                return bytesToNumberBE(data);
            },
        },
        toSig(bytes) {
            // parse DER signature
            const { Err: E, _int: int, _tlv: tlv } = DER;
            const data = abytes$3(bytes, undefined, 'signature');
            const { v: seqBytes, l: seqLeftBytes } = tlv.decode(0x30, data);
            if (seqLeftBytes.length)
                throw new E('invalid signature: left bytes after parsing');
            const { v: rBytes, l: rLeftBytes } = tlv.decode(0x02, seqBytes);
            const { v: sBytes, l: sLeftBytes } = tlv.decode(0x02, rLeftBytes);
            if (sLeftBytes.length)
                throw new E('invalid signature: left bytes after parsing');
            return { r: int.decode(rBytes), s: int.decode(sBytes) };
        },
        hexFromSig(sig) {
            const { _tlv: tlv, _int: int } = DER;
            const rs = tlv.encode(0x02, int.encode(sig.r));
            const ss = tlv.encode(0x02, int.encode(sig.s));
            const seq = rs + ss;
            return tlv.encode(0x30, seq);
        },
    };
    // Be friendly to bad ECMAScript parsers by not using bigint literals
    // prettier-ignore
    const _0n$1 = BigInt(0), _1n = BigInt(1), _2n$1 = BigInt(2), _3n = BigInt(3), _4n = BigInt(4);
    /**
     * Creates weierstrass Point constructor, based on specified curve options.
     *
     * See {@link WeierstrassOpts}.
     *
     * @example
    ```js
    const opts = {
      p: 0xfffffffffffffffffffffffffffffffeffffac73n,
      n: 0x100000000000000000001b8fa16dfab9aca16b6b3n,
      h: 1n,
      a: 0n,
      b: 7n,
      Gx: 0x3b4c382ce37aa192a4019e763036f4f5dd4d7ebbn,
      Gy: 0x938cf935318fdced6bc28286531733c3f03c4feen,
    };
    const secp160k1_Point = weierstrass(opts);
    ```
     */
    function weierstrass(params, extraOpts = {}) {
        const validated = createCurveFields('weierstrass', params, extraOpts);
        const { Fp, Fn } = validated;
        let CURVE = validated.CURVE;
        const { h: cofactor, n: CURVE_ORDER } = CURVE;
        validateObject(extraOpts, {}, {
            allowInfinityPoint: 'boolean',
            clearCofactor: 'function',
            isTorsionFree: 'function',
            fromBytes: 'function',
            toBytes: 'function',
            endo: 'object',
        });
        const { endo } = extraOpts;
        if (endo) {
            // validateObject(endo, { beta: 'bigint', splitScalar: 'function' });
            if (!Fp.is0(CURVE.a) || typeof endo.beta !== 'bigint' || !Array.isArray(endo.basises)) {
                throw new Error('invalid endo: expected "beta": bigint and "basises": array');
            }
        }
        const lengths = getWLengths(Fp, Fn);
        function assertCompressionIsSupported() {
            if (!Fp.isOdd)
                throw new Error('compression is not supported: Field does not have .isOdd()');
        }
        // Implements IEEE P1363 point encoding
        function pointToBytes(_c, point, isCompressed) {
            const { x, y } = point.toAffine();
            const bx = Fp.toBytes(x);
            abool$1(isCompressed, 'isCompressed');
            if (isCompressed) {
                assertCompressionIsSupported();
                const hasEvenY = !Fp.isOdd(y);
                return concatBytes$1(pprefix(hasEvenY), bx);
            }
            else {
                return concatBytes$1(Uint8Array.of(0x04), bx, Fp.toBytes(y));
            }
        }
        function pointFromBytes(bytes) {
            abytes$3(bytes, undefined, 'Point');
            const { publicKey: comp, publicKeyUncompressed: uncomp } = lengths; // e.g. for 32-byte: 33, 65
            const length = bytes.length;
            const head = bytes[0];
            const tail = bytes.subarray(1);
            // No actual validation is done here: use .assertValidity()
            if (length === comp && (head === 0x02 || head === 0x03)) {
                const x = Fp.fromBytes(tail);
                if (!Fp.isValid(x))
                    throw new Error('bad point: is not on curve, wrong x');
                const y2 = weierstrassEquation(x); // y² = x³ + ax + b
                let y;
                try {
                    y = Fp.sqrt(y2); // y = y² ^ (p+1)/4
                }
                catch (sqrtError) {
                    const err = sqrtError instanceof Error ? ': ' + sqrtError.message : '';
                    throw new Error('bad point: is not on curve, sqrt error' + err);
                }
                assertCompressionIsSupported();
                const evenY = Fp.isOdd(y);
                const evenH = (head & 1) === 1; // ECDSA-specific
                if (evenH !== evenY)
                    y = Fp.neg(y);
                return { x, y };
            }
            else if (length === uncomp && head === 0x04) {
                // TODO: more checks
                const L = Fp.BYTES;
                const x = Fp.fromBytes(tail.subarray(0, L));
                const y = Fp.fromBytes(tail.subarray(L, L * 2));
                if (!isValidXY(x, y))
                    throw new Error('bad point: is not on curve');
                return { x, y };
            }
            else {
                throw new Error(`bad point: got length ${length}, expected compressed=${comp} or uncompressed=${uncomp}`);
            }
        }
        const encodePoint = extraOpts.toBytes || pointToBytes;
        const decodePoint = extraOpts.fromBytes || pointFromBytes;
        function weierstrassEquation(x) {
            const x2 = Fp.sqr(x); // x * x
            const x3 = Fp.mul(x2, x); // x² * x
            return Fp.add(Fp.add(x3, Fp.mul(x, CURVE.a)), CURVE.b); // x³ + a * x + b
        }
        // TODO: move top-level
        /** Checks whether equation holds for given x, y: y² == x³ + ax + b */
        function isValidXY(x, y) {
            const left = Fp.sqr(y); // y²
            const right = weierstrassEquation(x); // x³ + ax + b
            return Fp.eql(left, right);
        }
        // Validate whether the passed curve params are valid.
        // Test 1: equation y² = x³ + ax + b should work for generator point.
        if (!isValidXY(CURVE.Gx, CURVE.Gy))
            throw new Error('bad curve params: generator point');
        // Test 2: discriminant Δ part should be non-zero: 4a³ + 27b² != 0.
        // Guarantees curve is genus-1, smooth (non-singular).
        const _4a3 = Fp.mul(Fp.pow(CURVE.a, _3n), _4n);
        const _27b2 = Fp.mul(Fp.sqr(CURVE.b), BigInt(27));
        if (Fp.is0(Fp.add(_4a3, _27b2)))
            throw new Error('bad curve params: a or b');
        /** Asserts coordinate is valid: 0 <= n < Fp.ORDER. */
        function acoord(title, n, banZero = false) {
            if (!Fp.isValid(n) || (banZero && Fp.is0(n)))
                throw new Error(`bad point coordinate ${title}`);
            return n;
        }
        function aprjpoint(other) {
            if (!(other instanceof Point))
                throw new Error('Weierstrass Point expected');
        }
        function splitEndoScalarN(k) {
            if (!endo || !endo.basises)
                throw new Error('no endo');
            return _splitEndoScalar(k, endo.basises, Fn.ORDER);
        }
        // Memoized toAffine / validity check. They are heavy. Points are immutable.
        // Converts Projective point to affine (x, y) coordinates.
        // Can accept precomputed Z^-1 - for example, from invertBatch.
        // (X, Y, Z) ∋ (x=X/Z, y=Y/Z)
        const toAffineMemo = memoized((p, iz) => {
            const { X, Y, Z } = p;
            // Fast-path for normalized points
            if (Fp.eql(Z, Fp.ONE))
                return { x: X, y: Y };
            const is0 = p.is0();
            // If invZ was 0, we return zero point. However we still want to execute
            // all operations, so we replace invZ with a random number, 1.
            if (iz == null)
                iz = is0 ? Fp.ONE : Fp.inv(Z);
            const x = Fp.mul(X, iz);
            const y = Fp.mul(Y, iz);
            const zz = Fp.mul(Z, iz);
            if (is0)
                return { x: Fp.ZERO, y: Fp.ZERO };
            if (!Fp.eql(zz, Fp.ONE))
                throw new Error('invZ was invalid');
            return { x, y };
        });
        // NOTE: on exception this will crash 'cached' and no value will be set.
        // Otherwise true will be return
        const assertValidMemo = memoized((p) => {
            if (p.is0()) {
                // (0, 1, 0) aka ZERO is invalid in most contexts.
                // In BLS, ZERO can be serialized, so we allow it.
                // (0, 0, 0) is invalid representation of ZERO.
                if (extraOpts.allowInfinityPoint && !Fp.is0(p.Y))
                    return;
                throw new Error('bad point: ZERO');
            }
            // Some 3rd-party test vectors require different wording between here & `fromCompressedHex`
            const { x, y } = p.toAffine();
            if (!Fp.isValid(x) || !Fp.isValid(y))
                throw new Error('bad point: x or y not field elements');
            if (!isValidXY(x, y))
                throw new Error('bad point: equation left != right');
            if (!p.isTorsionFree())
                throw new Error('bad point: not in prime-order subgroup');
            return true;
        });
        function finishEndo(endoBeta, k1p, k2p, k1neg, k2neg) {
            k2p = new Point(Fp.mul(k2p.X, endoBeta), k2p.Y, k2p.Z);
            k1p = negateCt(k1neg, k1p);
            k2p = negateCt(k2neg, k2p);
            return k1p.add(k2p);
        }
        /**
         * Projective Point works in 3d / projective (homogeneous) coordinates:(X, Y, Z) ∋ (x=X/Z, y=Y/Z).
         * Default Point works in 2d / affine coordinates: (x, y).
         * We're doing calculations in projective, because its operations don't require costly inversion.
         */
        class Point {
            // base / generator point
            static BASE = new Point(CURVE.Gx, CURVE.Gy, Fp.ONE);
            // zero / infinity / identity point
            static ZERO = new Point(Fp.ZERO, Fp.ONE, Fp.ZERO); // 0, 1, 0
            // math field
            static Fp = Fp;
            // scalar field
            static Fn = Fn;
            X;
            Y;
            Z;
            /** Does NOT validate if the point is valid. Use `.assertValidity()`. */
            constructor(X, Y, Z) {
                this.X = acoord('x', X);
                this.Y = acoord('y', Y, true);
                this.Z = acoord('z', Z);
                Object.freeze(this);
            }
            static CURVE() {
                return CURVE;
            }
            /** Does NOT validate if the point is valid. Use `.assertValidity()`. */
            static fromAffine(p) {
                const { x, y } = p || {};
                if (!p || !Fp.isValid(x) || !Fp.isValid(y))
                    throw new Error('invalid affine point');
                if (p instanceof Point)
                    throw new Error('projective point not allowed');
                // (0, 0) would've produced (0, 0, 1) - instead, we need (0, 1, 0)
                if (Fp.is0(x) && Fp.is0(y))
                    return Point.ZERO;
                return new Point(x, y, Fp.ONE);
            }
            static fromBytes(bytes) {
                const P = Point.fromAffine(decodePoint(abytes$3(bytes, undefined, 'point')));
                P.assertValidity();
                return P;
            }
            static fromHex(hex) {
                return Point.fromBytes(hexToBytes$2(hex));
            }
            get x() {
                return this.toAffine().x;
            }
            get y() {
                return this.toAffine().y;
            }
            /**
             *
             * @param windowSize
             * @param isLazy true will defer table computation until the first multiplication
             * @returns
             */
            precompute(windowSize = 8, isLazy = true) {
                wnaf.createCache(this, windowSize);
                if (!isLazy)
                    this.multiply(_3n); // random number
                return this;
            }
            // TODO: return `this`
            /** A point on curve is valid if it conforms to equation. */
            assertValidity() {
                assertValidMemo(this);
            }
            hasEvenY() {
                const { y } = this.toAffine();
                if (!Fp.isOdd)
                    throw new Error("Field doesn't support isOdd");
                return !Fp.isOdd(y);
            }
            /** Compare one point to another. */
            equals(other) {
                aprjpoint(other);
                const { X: X1, Y: Y1, Z: Z1 } = this;
                const { X: X2, Y: Y2, Z: Z2 } = other;
                const U1 = Fp.eql(Fp.mul(X1, Z2), Fp.mul(X2, Z1));
                const U2 = Fp.eql(Fp.mul(Y1, Z2), Fp.mul(Y2, Z1));
                return U1 && U2;
            }
            /** Flips point to one corresponding to (x, -y) in Affine coordinates. */
            negate() {
                return new Point(this.X, Fp.neg(this.Y), this.Z);
            }
            // Renes-Costello-Batina exception-free doubling formula.
            // There is 30% faster Jacobian formula, but it is not complete.
            // https://eprint.iacr.org/2015/1060, algorithm 3
            // Cost: 8M + 3S + 3*a + 2*b3 + 15add.
            double() {
                const { a, b } = CURVE;
                const b3 = Fp.mul(b, _3n);
                const { X: X1, Y: Y1, Z: Z1 } = this;
                let X3 = Fp.ZERO, Y3 = Fp.ZERO, Z3 = Fp.ZERO; // prettier-ignore
                let t0 = Fp.mul(X1, X1); // step 1
                let t1 = Fp.mul(Y1, Y1);
                let t2 = Fp.mul(Z1, Z1);
                let t3 = Fp.mul(X1, Y1);
                t3 = Fp.add(t3, t3); // step 5
                Z3 = Fp.mul(X1, Z1);
                Z3 = Fp.add(Z3, Z3);
                X3 = Fp.mul(a, Z3);
                Y3 = Fp.mul(b3, t2);
                Y3 = Fp.add(X3, Y3); // step 10
                X3 = Fp.sub(t1, Y3);
                Y3 = Fp.add(t1, Y3);
                Y3 = Fp.mul(X3, Y3);
                X3 = Fp.mul(t3, X3);
                Z3 = Fp.mul(b3, Z3); // step 15
                t2 = Fp.mul(a, t2);
                t3 = Fp.sub(t0, t2);
                t3 = Fp.mul(a, t3);
                t3 = Fp.add(t3, Z3);
                Z3 = Fp.add(t0, t0); // step 20
                t0 = Fp.add(Z3, t0);
                t0 = Fp.add(t0, t2);
                t0 = Fp.mul(t0, t3);
                Y3 = Fp.add(Y3, t0);
                t2 = Fp.mul(Y1, Z1); // step 25
                t2 = Fp.add(t2, t2);
                t0 = Fp.mul(t2, t3);
                X3 = Fp.sub(X3, t0);
                Z3 = Fp.mul(t2, t1);
                Z3 = Fp.add(Z3, Z3); // step 30
                Z3 = Fp.add(Z3, Z3);
                return new Point(X3, Y3, Z3);
            }
            // Renes-Costello-Batina exception-free addition formula.
            // There is 30% faster Jacobian formula, but it is not complete.
            // https://eprint.iacr.org/2015/1060, algorithm 1
            // Cost: 12M + 0S + 3*a + 3*b3 + 23add.
            add(other) {
                aprjpoint(other);
                const { X: X1, Y: Y1, Z: Z1 } = this;
                const { X: X2, Y: Y2, Z: Z2 } = other;
                let X3 = Fp.ZERO, Y3 = Fp.ZERO, Z3 = Fp.ZERO; // prettier-ignore
                const a = CURVE.a;
                const b3 = Fp.mul(CURVE.b, _3n);
                let t0 = Fp.mul(X1, X2); // step 1
                let t1 = Fp.mul(Y1, Y2);
                let t2 = Fp.mul(Z1, Z2);
                let t3 = Fp.add(X1, Y1);
                let t4 = Fp.add(X2, Y2); // step 5
                t3 = Fp.mul(t3, t4);
                t4 = Fp.add(t0, t1);
                t3 = Fp.sub(t3, t4);
                t4 = Fp.add(X1, Z1);
                let t5 = Fp.add(X2, Z2); // step 10
                t4 = Fp.mul(t4, t5);
                t5 = Fp.add(t0, t2);
                t4 = Fp.sub(t4, t5);
                t5 = Fp.add(Y1, Z1);
                X3 = Fp.add(Y2, Z2); // step 15
                t5 = Fp.mul(t5, X3);
                X3 = Fp.add(t1, t2);
                t5 = Fp.sub(t5, X3);
                Z3 = Fp.mul(a, t4);
                X3 = Fp.mul(b3, t2); // step 20
                Z3 = Fp.add(X3, Z3);
                X3 = Fp.sub(t1, Z3);
                Z3 = Fp.add(t1, Z3);
                Y3 = Fp.mul(X3, Z3);
                t1 = Fp.add(t0, t0); // step 25
                t1 = Fp.add(t1, t0);
                t2 = Fp.mul(a, t2);
                t4 = Fp.mul(b3, t4);
                t1 = Fp.add(t1, t2);
                t2 = Fp.sub(t0, t2); // step 30
                t2 = Fp.mul(a, t2);
                t4 = Fp.add(t4, t2);
                t0 = Fp.mul(t1, t4);
                Y3 = Fp.add(Y3, t0);
                t0 = Fp.mul(t5, t4); // step 35
                X3 = Fp.mul(t3, X3);
                X3 = Fp.sub(X3, t0);
                t0 = Fp.mul(t3, t1);
                Z3 = Fp.mul(t5, Z3);
                Z3 = Fp.add(Z3, t0); // step 40
                return new Point(X3, Y3, Z3);
            }
            subtract(other) {
                return this.add(other.negate());
            }
            is0() {
                return this.equals(Point.ZERO);
            }
            /**
             * Constant time multiplication.
             * Uses wNAF method. Windowed method may be 10% faster,
             * but takes 2x longer to generate and consumes 2x memory.
             * Uses precomputes when available.
             * Uses endomorphism for Koblitz curves.
             * @param scalar by which the point would be multiplied
             * @returns New point
             */
            multiply(scalar) {
                const { endo } = extraOpts;
                if (!Fn.isValidNot0(scalar))
                    throw new Error('invalid scalar: out of range'); // 0 is invalid
                let point, fake; // Fake point is used to const-time mult
                const mul = (n) => wnaf.cached(this, n, (p) => normalizeZ(Point, p));
                /** See docs for {@link EndomorphismOpts} */
                if (endo) {
                    const { k1neg, k1, k2neg, k2 } = splitEndoScalarN(scalar);
                    const { p: k1p, f: k1f } = mul(k1);
                    const { p: k2p, f: k2f } = mul(k2);
                    fake = k1f.add(k2f);
                    point = finishEndo(endo.beta, k1p, k2p, k1neg, k2neg);
                }
                else {
                    const { p, f } = mul(scalar);
                    point = p;
                    fake = f;
                }
                // Normalize `z` for both points, but return only real one
                return normalizeZ(Point, [point, fake])[0];
            }
            /**
             * Non-constant-time multiplication. Uses double-and-add algorithm.
             * It's faster, but should only be used when you don't care about
             * an exposed secret key e.g. sig verification, which works over *public* keys.
             */
            multiplyUnsafe(sc) {
                const { endo } = extraOpts;
                const p = this;
                if (!Fn.isValid(sc))
                    throw new Error('invalid scalar: out of range'); // 0 is valid
                if (sc === _0n$1 || p.is0())
                    return Point.ZERO; // 0
                if (sc === _1n)
                    return p; // 1
                if (wnaf.hasCache(this))
                    return this.multiply(sc); // precomputes
                // We don't have method for double scalar multiplication (aP + bQ):
                // Even with using Strauss-Shamir trick, it's 35% slower than naïve mul+add.
                if (endo) {
                    const { k1neg, k1, k2neg, k2 } = splitEndoScalarN(sc);
                    const { p1, p2 } = mulEndoUnsafe(Point, p, k1, k2); // 30% faster vs wnaf.unsafe
                    return finishEndo(endo.beta, p1, p2, k1neg, k2neg);
                }
                else {
                    return wnaf.unsafe(p, sc);
                }
            }
            /**
             * Converts Projective point to affine (x, y) coordinates.
             * @param invertedZ Z^-1 (inverted zero) - optional, precomputation is useful for invertBatch
             */
            toAffine(invertedZ) {
                return toAffineMemo(this, invertedZ);
            }
            /**
             * Checks whether Point is free of torsion elements (is in prime subgroup).
             * Always torsion-free for cofactor=1 curves.
             */
            isTorsionFree() {
                const { isTorsionFree } = extraOpts;
                if (cofactor === _1n)
                    return true;
                if (isTorsionFree)
                    return isTorsionFree(Point, this);
                return wnaf.unsafe(this, CURVE_ORDER).is0();
            }
            clearCofactor() {
                const { clearCofactor } = extraOpts;
                if (cofactor === _1n)
                    return this; // Fast-path
                if (clearCofactor)
                    return clearCofactor(Point, this);
                return this.multiplyUnsafe(cofactor);
            }
            isSmallOrder() {
                // can we use this.clearCofactor()?
                return this.multiplyUnsafe(cofactor).is0();
            }
            toBytes(isCompressed = true) {
                abool$1(isCompressed, 'isCompressed');
                this.assertValidity();
                return encodePoint(Point, this, isCompressed);
            }
            toHex(isCompressed = true) {
                return bytesToHex$1(this.toBytes(isCompressed));
            }
            toString() {
                return `<Point ${this.is0() ? 'ZERO' : this.toHex()}>`;
            }
        }
        const bits = Fn.BITS;
        const wnaf = new wNAF(Point, extraOpts.endo ? Math.ceil(bits / 2) : bits);
        Point.BASE.precompute(8); // Enable precomputes. Slows down first publicKey computation by 20ms.
        return Point;
    }
    // Points start with byte 0x02 when y is even; otherwise 0x03
    function pprefix(hasEvenY) {
        return Uint8Array.of(hasEvenY ? 0x02 : 0x03);
    }
    function getWLengths(Fp, Fn) {
        return {
            secretKey: Fn.BYTES,
            publicKey: 1 + Fp.BYTES,
            publicKeyUncompressed: 1 + 2 * Fp.BYTES,
            publicKeyHasPrefix: true,
            signature: 2 * Fn.BYTES,
        };
    }
    /**
     * Sometimes users only need getPublicKey, getSharedSecret, and secret key handling.
     * This helper ensures no signature functionality is present. Less code, smaller bundle size.
     */
    function ecdh(Point, ecdhOpts = {}) {
        const { Fn } = Point;
        const randomBytes_ = ecdhOpts.randomBytes || randomBytes$1;
        const lengths = Object.assign(getWLengths(Point.Fp, Fn), { seed: getMinHashLength(Fn.ORDER) });
        function isValidSecretKey(secretKey) {
            try {
                const num = Fn.fromBytes(secretKey);
                return Fn.isValidNot0(num);
            }
            catch (error) {
                return false;
            }
        }
        function isValidPublicKey(publicKey, isCompressed) {
            const { publicKey: comp, publicKeyUncompressed } = lengths;
            try {
                const l = publicKey.length;
                if (isCompressed === true && l !== comp)
                    return false;
                if (isCompressed === false && l !== publicKeyUncompressed)
                    return false;
                return !!Point.fromBytes(publicKey);
            }
            catch (error) {
                return false;
            }
        }
        /**
         * Produces cryptographically secure secret key from random of size
         * (groupLen + ceil(groupLen / 2)) with modulo bias being negligible.
         */
        function randomSecretKey(seed = randomBytes_(lengths.seed)) {
            return mapHashToField(abytes$3(seed, lengths.seed, 'seed'), Fn.ORDER);
        }
        /**
         * Computes public key for a secret key. Checks for validity of the secret key.
         * @param isCompressed whether to return compact (default), or full key
         * @returns Public key, full when isCompressed=false; short when isCompressed=true
         */
        function getPublicKey(secretKey, isCompressed = true) {
            return Point.BASE.multiply(Fn.fromBytes(secretKey)).toBytes(isCompressed);
        }
        /**
         * Quick and dirty check for item being public key. Does not validate hex, or being on-curve.
         */
        function isProbPub(item) {
            const { secretKey, publicKey, publicKeyUncompressed } = lengths;
            if (!isBytes$3(item))
                return undefined;
            if (('_lengths' in Fn && Fn._lengths) || secretKey === publicKey)
                return undefined;
            const l = abytes$3(item, undefined, 'key').length;
            return l === publicKey || l === publicKeyUncompressed;
        }
        /**
         * ECDH (Elliptic Curve Diffie Hellman).
         * Computes shared public key from secret key A and public key B.
         * Checks: 1) secret key validity 2) shared key is on-curve.
         * Does NOT hash the result.
         * @param isCompressed whether to return compact (default), or full key
         * @returns shared public key
         */
        function getSharedSecret(secretKeyA, publicKeyB, isCompressed = true) {
            if (isProbPub(secretKeyA) === true)
                throw new Error('first arg must be private key');
            if (isProbPub(publicKeyB) === false)
                throw new Error('second arg must be public key');
            const s = Fn.fromBytes(secretKeyA);
            const b = Point.fromBytes(publicKeyB); // checks for being on-curve
            return b.multiply(s).toBytes(isCompressed);
        }
        const utils = {
            isValidSecretKey,
            isValidPublicKey,
            randomSecretKey,
        };
        const keygen = createKeygen(randomSecretKey, getPublicKey);
        return Object.freeze({ getPublicKey, getSharedSecret, keygen, Point, utils, lengths });
    }
    /**
     * Creates ECDSA signing interface for given elliptic curve `Point` and `hash` function.
     *
     * @param Point created using {@link weierstrass} function
     * @param hash used for 1) message prehash-ing 2) k generation in `sign`, using hmac_drbg(hash)
     * @param ecdsaOpts rarely needed, see {@link ECDSAOpts}
     *
     * @example
     * ```js
     * const p256_Point = weierstrass(...);
     * const p256_sha256 = ecdsa(p256_Point, sha256);
     * const p256_sha224 = ecdsa(p256_Point, sha224);
     * const p256_sha224_r = ecdsa(p256_Point, sha224, { randomBytes: (length) => { ... } });
     * ```
     */
    function ecdsa(Point, hash, ecdsaOpts = {}) {
        ahash$1(hash);
        validateObject(ecdsaOpts, {}, {
            hmac: 'function',
            lowS: 'boolean',
            randomBytes: 'function',
            bits2int: 'function',
            bits2int_modN: 'function',
        });
        ecdsaOpts = Object.assign({}, ecdsaOpts);
        const randomBytes = ecdsaOpts.randomBytes || randomBytes$1;
        const hmac = ecdsaOpts.hmac || ((key, msg) => hmac$1(hash, key, msg));
        const { Fp, Fn } = Point;
        const { ORDER: CURVE_ORDER, BITS: fnBits } = Fn;
        const { keygen, getPublicKey, getSharedSecret, utils, lengths } = ecdh(Point, ecdsaOpts);
        const defaultSigOpts = {
            prehash: true,
            lowS: typeof ecdsaOpts.lowS === 'boolean' ? ecdsaOpts.lowS : true,
            format: 'compact',
            extraEntropy: false,
        };
        const hasLargeCofactor = CURVE_ORDER * _2n$1 < Fp.ORDER; // Won't CURVE().h > 2n be more effective?
        function isBiggerThanHalfOrder(number) {
            const HALF = CURVE_ORDER >> _1n;
            return number > HALF;
        }
        function validateRS(title, num) {
            if (!Fn.isValidNot0(num))
                throw new Error(`invalid signature ${title}: out of range 1..Point.Fn.ORDER`);
            return num;
        }
        function assertSmallCofactor() {
            // ECDSA recovery is hard for cofactor > 1 curves.
            // In sign, `r = q.x mod n`, and here we recover q.x from r.
            // While recovering q.x >= n, we need to add r+n for cofactor=1 curves.
            // However, for cofactor>1, r+n may not get q.x:
            // r+n*i would need to be done instead where i is unknown.
            // To easily get i, we either need to:
            // a. increase amount of valid recid values (4, 5...); OR
            // b. prohibit non-prime-order signatures (recid > 1).
            if (hasLargeCofactor)
                throw new Error('"recovered" sig type is not supported for cofactor >2 curves');
        }
        function validateSigLength(bytes, format) {
            validateSigFormat(format);
            const size = lengths.signature;
            const sizer = format === 'compact' ? size : format === 'recovered' ? size + 1 : undefined;
            return abytes$3(bytes, sizer);
        }
        /**
         * ECDSA signature with its (r, s) properties. Supports compact, recovered & DER representations.
         */
        class Signature {
            r;
            s;
            recovery;
            constructor(r, s, recovery) {
                this.r = validateRS('r', r); // r in [1..N-1];
                this.s = validateRS('s', s); // s in [1..N-1];
                if (recovery != null) {
                    assertSmallCofactor();
                    if (![0, 1, 2, 3].includes(recovery))
                        throw new Error('invalid recovery id');
                    this.recovery = recovery;
                }
                Object.freeze(this);
            }
            static fromBytes(bytes, format = defaultSigOpts.format) {
                validateSigLength(bytes, format);
                let recid;
                if (format === 'der') {
                    const { r, s } = DER.toSig(abytes$3(bytes));
                    return new Signature(r, s);
                }
                if (format === 'recovered') {
                    recid = bytes[0];
                    format = 'compact';
                    bytes = bytes.subarray(1);
                }
                const L = lengths.signature / 2;
                const r = bytes.subarray(0, L);
                const s = bytes.subarray(L, L * 2);
                return new Signature(Fn.fromBytes(r), Fn.fromBytes(s), recid);
            }
            static fromHex(hex, format) {
                return this.fromBytes(hexToBytes$2(hex), format);
            }
            assertRecovery() {
                const { recovery } = this;
                if (recovery == null)
                    throw new Error('invalid recovery id: must be present');
                return recovery;
            }
            addRecoveryBit(recovery) {
                return new Signature(this.r, this.s, recovery);
            }
            recoverPublicKey(messageHash) {
                const { r, s } = this;
                const recovery = this.assertRecovery();
                const radj = recovery === 2 || recovery === 3 ? r + CURVE_ORDER : r;
                if (!Fp.isValid(radj))
                    throw new Error('invalid recovery id: sig.r+curve.n != R.x');
                const x = Fp.toBytes(radj);
                const R = Point.fromBytes(concatBytes$1(pprefix((recovery & 1) === 0), x));
                const ir = Fn.inv(radj); // r^-1
                const h = bits2int_modN(abytes$3(messageHash, undefined, 'msgHash')); // Truncate hash
                const u1 = Fn.create(-h * ir); // -hr^-1
                const u2 = Fn.create(s * ir); // sr^-1
                // (sr^-1)R-(hr^-1)G = -(hr^-1)G + (sr^-1). unsafe is fine: there is no private data.
                const Q = Point.BASE.multiplyUnsafe(u1).add(R.multiplyUnsafe(u2));
                if (Q.is0())
                    throw new Error('invalid recovery: point at infinify');
                Q.assertValidity();
                return Q;
            }
            // Signatures should be low-s, to prevent malleability.
            hasHighS() {
                return isBiggerThanHalfOrder(this.s);
            }
            toBytes(format = defaultSigOpts.format) {
                validateSigFormat(format);
                if (format === 'der')
                    return hexToBytes$2(DER.hexFromSig(this));
                const { r, s } = this;
                const rb = Fn.toBytes(r);
                const sb = Fn.toBytes(s);
                if (format === 'recovered') {
                    assertSmallCofactor();
                    return concatBytes$1(Uint8Array.of(this.assertRecovery()), rb, sb);
                }
                return concatBytes$1(rb, sb);
            }
            toHex(format) {
                return bytesToHex$1(this.toBytes(format));
            }
        }
        // RFC6979: ensure ECDSA msg is X bytes and < N. RFC suggests optional truncating via bits2octets.
        // FIPS 186-4 4.6 suggests the leftmost min(nBitLen, outLen) bits, which matches bits2int.
        // bits2int can produce res>N, we can do mod(res, N) since the bitLen is the same.
        // int2octets can't be used; pads small msgs with 0: unacceptatble for trunc as per RFC vectors
        const bits2int = ecdsaOpts.bits2int ||
            function bits2int_def(bytes) {
                // Our custom check "just in case", for protection against DoS
                if (bytes.length > 8192)
                    throw new Error('input is too large');
                // For curves with nBitLength % 8 !== 0: bits2octets(bits2octets(m)) !== bits2octets(m)
                // for some cases, since bytes.length * 8 is not actual bitLength.
                const num = bytesToNumberBE(bytes); // check for == u8 done here
                const delta = bytes.length * 8 - fnBits; // truncate to nBitLength leftmost bits
                return delta > 0 ? num >> BigInt(delta) : num;
            };
        const bits2int_modN = ecdsaOpts.bits2int_modN ||
            function bits2int_modN_def(bytes) {
                return Fn.create(bits2int(bytes)); // can't use bytesToNumberBE here
            };
        // Pads output with zero as per spec
        const ORDER_MASK = bitMask(fnBits);
        /** Converts to bytes. Checks if num in `[0..ORDER_MASK-1]` e.g.: `[0..2^256-1]`. */
        function int2octets(num) {
            // IMPORTANT: the check ensures working for case `Fn.BYTES != Fn.BITS * 8`
            aInRange('num < 2^' + fnBits, num, _0n$1, ORDER_MASK);
            return Fn.toBytes(num);
        }
        function validateMsgAndHash(message, prehash) {
            abytes$3(message, undefined, 'message');
            return prehash ? abytes$3(hash(message), undefined, 'prehashed message') : message;
        }
        /**
         * Steps A, D of RFC6979 3.2.
         * Creates RFC6979 seed; converts msg/privKey to numbers.
         * Used only in sign, not in verify.
         *
         * Warning: we cannot assume here that message has same amount of bytes as curve order,
         * this will be invalid at least for P521. Also it can be bigger for P224 + SHA256.
         */
        function prepSig(message, secretKey, opts) {
            const { lowS, prehash, extraEntropy } = validateSigOpts(opts, defaultSigOpts);
            message = validateMsgAndHash(message, prehash); // RFC6979 3.2 A: h1 = H(m)
            // We can't later call bits2octets, since nested bits2int is broken for curves
            // with fnBits % 8 !== 0. Because of that, we unwrap it here as int2octets call.
            // const bits2octets = (bits) => int2octets(bits2int_modN(bits))
            const h1int = bits2int_modN(message);
            const d = Fn.fromBytes(secretKey); // validate secret key, convert to bigint
            if (!Fn.isValidNot0(d))
                throw new Error('invalid private key');
            const seedArgs = [int2octets(d), int2octets(h1int)];
            // extraEntropy. RFC6979 3.6: additional k' (optional).
            if (extraEntropy != null && extraEntropy !== false) {
                // K = HMAC_K(V || 0x00 || int2octets(x) || bits2octets(h1) || k')
                // gen random bytes OR pass as-is
                const e = extraEntropy === true ? randomBytes(lengths.secretKey) : extraEntropy;
                seedArgs.push(abytes$3(e, undefined, 'extraEntropy')); // check for being bytes
            }
            const seed = concatBytes$1(...seedArgs); // Step D of RFC6979 3.2
            const m = h1int; // no need to call bits2int second time here, it is inside truncateHash!
            // Converts signature params into point w r/s, checks result for validity.
            // To transform k => Signature:
            // q = k⋅G
            // r = q.x mod n
            // s = k^-1(m + rd) mod n
            // Can use scalar blinding b^-1(bm + bdr) where b ∈ [1,q−1] according to
            // https://tches.iacr.org/index.php/TCHES/article/view/7337/6509. We've decided against it:
            // a) dependency on CSPRNG b) 15% slowdown c) doesn't really help since bigints are not CT
            function k2sig(kBytes) {
                // RFC 6979 Section 3.2, step 3: k = bits2int(T)
                // Important: all mod() calls here must be done over N
                const k = bits2int(kBytes); // Cannot use fields methods, since it is group element
                if (!Fn.isValidNot0(k))
                    return; // Valid scalars (including k) must be in 1..N-1
                const ik = Fn.inv(k); // k^-1 mod n
                const q = Point.BASE.multiply(k).toAffine(); // q = k⋅G
                const r = Fn.create(q.x); // r = q.x mod n
                if (r === _0n$1)
                    return;
                const s = Fn.create(ik * Fn.create(m + r * d)); // s = k^-1(m + rd) mod n
                if (s === _0n$1)
                    return;
                let recovery = (q.x === r ? 0 : 2) | Number(q.y & _1n); // recovery bit (2 or 3 when q.x>n)
                let normS = s;
                if (lowS && isBiggerThanHalfOrder(s)) {
                    normS = Fn.neg(s); // if lowS was passed, ensure s is always in the bottom half of N
                    recovery ^= 1;
                }
                return new Signature(r, normS, hasLargeCofactor ? undefined : recovery);
            }
            return { seed, k2sig };
        }
        /**
         * Signs message hash with a secret key.
         *
         * ```
         * sign(m, d) where
         *   k = rfc6979_hmac_drbg(m, d)
         *   (x, y) = G × k
         *   r = x mod n
         *   s = (m + dr) / k mod n
         * ```
         */
        function sign(message, secretKey, opts = {}) {
            const { seed, k2sig } = prepSig(message, secretKey, opts); // Steps A, D of RFC6979 3.2.
            const drbg = createHmacDrbg(hash.outputLen, Fn.BYTES, hmac);
            const sig = drbg(seed, k2sig); // Steps B, C, D, E, F, G
            return sig.toBytes(opts.format);
        }
        /**
         * Verifies a signature against message and public key.
         * Rejects lowS signatures by default: see {@link ECDSAVerifyOpts}.
         * Implements section 4.1.4 from https://www.secg.org/sec1-v2.pdf:
         *
         * ```
         * verify(r, s, h, P) where
         *   u1 = hs^-1 mod n
         *   u2 = rs^-1 mod n
         *   R = u1⋅G + u2⋅P
         *   mod(R.x, n) == r
         * ```
         */
        function verify(signature, message, publicKey, opts = {}) {
            const { lowS, prehash, format } = validateSigOpts(opts, defaultSigOpts);
            publicKey = abytes$3(publicKey, undefined, 'publicKey');
            message = validateMsgAndHash(message, prehash);
            if (!isBytes$3(signature)) {
                const end = signature instanceof Signature ? ', use sig.toBytes()' : '';
                throw new Error('verify expects Uint8Array signature' + end);
            }
            validateSigLength(signature, format); // execute this twice because we want loud error
            try {
                const sig = Signature.fromBytes(signature, format);
                const P = Point.fromBytes(publicKey);
                if (lowS && sig.hasHighS())
                    return false;
                const { r, s } = sig;
                const h = bits2int_modN(message); // mod n, not mod p
                const is = Fn.inv(s); // s^-1 mod n
                const u1 = Fn.create(h * is); // u1 = hs^-1 mod n
                const u2 = Fn.create(r * is); // u2 = rs^-1 mod n
                const R = Point.BASE.multiplyUnsafe(u1).add(P.multiplyUnsafe(u2)); // u1⋅G + u2⋅P
                if (R.is0())
                    return false;
                const v = Fn.create(R.x); // v = r.x mod n
                return v === r;
            }
            catch (e) {
                return false;
            }
        }
        function recoverPublicKey(signature, message, opts = {}) {
            const { prehash } = validateSigOpts(opts, defaultSigOpts);
            message = validateMsgAndHash(message, prehash);
            return Signature.fromBytes(signature, 'recovered').recoverPublicKey(message).toBytes();
        }
        return Object.freeze({
            keygen,
            getPublicKey,
            getSharedSecret,
            utils,
            lengths,
            Point,
            sign,
            verify,
            recoverPublicKey,
            Signature,
            hash,
        });
    }

    /**
     * SECG secp256k1. See [pdf](https://www.secg.org/sec2-v2.pdf).
     *
     * Belongs to Koblitz curves: it has efficiently-computable GLV endomorphism ψ,
     * check out {@link EndomorphismOpts}. Seems to be rigid (not backdoored).
     * @module
     */
    /*! noble-curves - MIT License (c) 2022 Paul Miller (paulmillr.com) */
    // Seems like generator was produced from some seed:
    // `Pointk1.BASE.multiply(Pointk1.Fn.inv(2n, N)).toAffine().x`
    // // gives short x 0x3b78ce563f89a0ed9414f5aa28ad0d96d6795f9c63n
    const secp256k1_CURVE = {
        p: BigInt('0xfffffffffffffffffffffffffffffffffffffffffffffffffffffffefffffc2f'),
        n: BigInt('0xfffffffffffffffffffffffffffffffebaaedce6af48a03bbfd25e8cd0364141'),
        h: BigInt(1),
        a: BigInt(0),
        b: BigInt(7),
        Gx: BigInt('0x79be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798'),
        Gy: BigInt('0x483ada7726a3c4655da4fbfc0e1108a8fd17b448a68554199c47d08ffb10d4b8'),
    };
    const secp256k1_ENDO = {
        beta: BigInt('0x7ae96a2b657c07106e64479eac3434e99cf0497512f58995c1396c28719501ee'),
        basises: [
            [BigInt('0x3086d221a7d46bcde86c90e49284eb15'), -BigInt('0xe4437ed6010e88286f547fa90abfe4c3')],
            [BigInt('0x114ca50f7a8e2f3f657c1108d9d44cfd8'), BigInt('0x3086d221a7d46bcde86c90e49284eb15')],
        ],
    };
    const _0n = /* @__PURE__ */ BigInt(0);
    const _2n = /* @__PURE__ */ BigInt(2);
    /**
     * √n = n^((p+1)/4) for fields p = 3 mod 4. We unwrap the loop and multiply bit-by-bit.
     * (P+1n/4n).toString(2) would produce bits [223x 1, 0, 22x 1, 4x 0, 11, 00]
     */
    function sqrtMod(y) {
        const P = secp256k1_CURVE.p;
        // prettier-ignore
        const _3n = BigInt(3), _6n = BigInt(6), _11n = BigInt(11), _22n = BigInt(22);
        // prettier-ignore
        const _23n = BigInt(23), _44n = BigInt(44), _88n = BigInt(88);
        const b2 = (y * y * y) % P; // x^3, 11
        const b3 = (b2 * b2 * y) % P; // x^7
        const b6 = (pow2(b3, _3n, P) * b3) % P;
        const b9 = (pow2(b6, _3n, P) * b3) % P;
        const b11 = (pow2(b9, _2n, P) * b2) % P;
        const b22 = (pow2(b11, _11n, P) * b11) % P;
        const b44 = (pow2(b22, _22n, P) * b22) % P;
        const b88 = (pow2(b44, _44n, P) * b44) % P;
        const b176 = (pow2(b88, _88n, P) * b88) % P;
        const b220 = (pow2(b176, _44n, P) * b44) % P;
        const b223 = (pow2(b220, _3n, P) * b3) % P;
        const t1 = (pow2(b223, _23n, P) * b22) % P;
        const t2 = (pow2(t1, _6n, P) * b2) % P;
        const root = pow2(t2, _2n, P);
        if (!Fpk1.eql(Fpk1.sqr(root), y))
            throw new Error('Cannot find square root');
        return root;
    }
    const Fpk1 = Field(secp256k1_CURVE.p, { sqrt: sqrtMod });
    const Pointk1 = /* @__PURE__ */ weierstrass(secp256k1_CURVE, {
        Fp: Fpk1,
        endo: secp256k1_ENDO,
    });
    /**
     * secp256k1 curve: ECDSA and ECDH methods.
     *
     * Uses sha256 to hash messages. To use a different hash,
     * pass `{ prehash: false }` to sign / verify.
     *
     * @example
     * ```js
     * import { secp256k1 } from '@noble/curves/secp256k1.js';
     * const { secretKey, publicKey } = secp256k1.keygen();
     * // const publicKey = secp256k1.getPublicKey(secretKey);
     * const msg = new TextEncoder().encode('hello noble');
     * const sig = secp256k1.sign(msg, secretKey);
     * const isValid = secp256k1.verify(sig, msg, publicKey);
     * // const sigKeccak = secp256k1.sign(keccak256(msg), secretKey, { prehash: false });
     * ```
     */
    const secp256k1 = /* @__PURE__ */ ecdsa(Pointk1, sha256$1);
    // Schnorr signatures are superior to ECDSA from above. Below is Schnorr-specific BIP0340 code.
    // https://github.com/bitcoin/bips/blob/master/bip-0340.mediawiki
    /** An object mapping tags to their tagged hash prefix of [SHA256(tag) | SHA256(tag)] */
    const TAGGED_HASH_PREFIXES = {};
    function taggedHash(tag, ...messages) {
        let tagP = TAGGED_HASH_PREFIXES[tag];
        if (tagP === undefined) {
            const tagH = sha256$1(asciiToBytes(tag));
            tagP = concatBytes$1(tagH, tagH);
            TAGGED_HASH_PREFIXES[tag] = tagP;
        }
        return sha256$1(concatBytes$1(tagP, ...messages));
    }
    // ECDSA compact points are 33-byte. Schnorr is 32: we strip first byte 0x02 or 0x03
    const pointToBytes = (point) => point.toBytes(true).slice(1);
    const hasEven = (y) => y % _2n === _0n;
    // Calculate point, scalar and bytes
    function schnorrGetExtPubKey(priv) {
        const { Fn, BASE } = Pointk1;
        const d_ = Fn.fromBytes(priv);
        const p = BASE.multiply(d_); // P = d'⋅G; 0 < d' < n check is done inside
        const scalar = hasEven(p.y) ? d_ : Fn.neg(d_);
        return { scalar, bytes: pointToBytes(p) };
    }
    /**
     * lift_x from BIP340. Convert 32-byte x coordinate to elliptic curve point.
     * @returns valid point checked for being on-curve
     */
    function lift_x(x) {
        const Fp = Fpk1;
        if (!Fp.isValidNot0(x))
            throw new Error('invalid x: Fail if x ≥ p');
        const xx = Fp.create(x * x);
        const c = Fp.create(xx * x + BigInt(7)); // Let c = x³ + 7 mod p.
        let y = Fp.sqrt(c); // Let y = c^(p+1)/4 mod p. Same as sqrt().
        // Return the unique point P such that x(P) = x and
        // y(P) = y if y mod 2 = 0 or y(P) = p-y otherwise.
        if (!hasEven(y))
            y = Fp.neg(y);
        const p = Pointk1.fromAffine({ x, y });
        p.assertValidity();
        return p;
    }
    const num = bytesToNumberBE;
    /**
     * Create tagged hash, convert it to bigint, reduce modulo-n.
     */
    function challenge(...args) {
        return Pointk1.Fn.create(num(taggedHash('BIP0340/challenge', ...args)));
    }
    /**
     * Schnorr public key is just `x` coordinate of Point as per BIP340.
     */
    function schnorrGetPublicKey(secretKey) {
        return schnorrGetExtPubKey(secretKey).bytes; // d'=int(sk). Fail if d'=0 or d'≥n. Ret bytes(d'⋅G)
    }
    /**
     * Creates Schnorr signature as per BIP340. Verifies itself before returning anything.
     * auxRand is optional and is not the sole source of k generation: bad CSPRNG won't be dangerous.
     */
    function schnorrSign(message, secretKey, auxRand = randomBytes$1(32)) {
        const { Fn } = Pointk1;
        const m = abytes$3(message, undefined, 'message');
        const { bytes: px, scalar: d } = schnorrGetExtPubKey(secretKey); // checks for isWithinCurveOrder
        const a = abytes$3(auxRand, 32, 'auxRand'); // Auxiliary random data a: a 32-byte array
        const t = Fn.toBytes(d ^ num(taggedHash('BIP0340/aux', a))); // Let t be the byte-wise xor of bytes(d) and hash/aux(a)
        const rand = taggedHash('BIP0340/nonce', t, px, m); // Let rand = hash/nonce(t || bytes(P) || m)
        // Let k' = int(rand) mod n. Fail if k' = 0. Let R = k'⋅G
        const { bytes: rx, scalar: k } = schnorrGetExtPubKey(rand);
        const e = challenge(rx, px, m); // Let e = int(hash/challenge(bytes(R) || bytes(P) || m)) mod n.
        const sig = new Uint8Array(64); // Let sig = bytes(R) || bytes((k + ed) mod n).
        sig.set(rx, 0);
        sig.set(Fn.toBytes(Fn.create(k + e * d)), 32);
        // If Verify(bytes(P), m, sig) (see below) returns failure, abort
        if (!schnorrVerify(sig, m, px))
            throw new Error('sign: Invalid signature produced');
        return sig;
    }
    /**
     * Verifies Schnorr signature.
     * Will swallow errors & return false except for initial type validation of arguments.
     */
    function schnorrVerify(signature, message, publicKey) {
        const { Fp, Fn, BASE } = Pointk1;
        const sig = abytes$3(signature, 64, 'signature');
        const m = abytes$3(message, undefined, 'message');
        const pub = abytes$3(publicKey, 32, 'publicKey');
        try {
            const P = lift_x(num(pub)); // P = lift_x(int(pk)); fail if that fails
            const r = num(sig.subarray(0, 32)); // Let r = int(sig[0:32]); fail if r ≥ p.
            if (!Fp.isValidNot0(r))
                return false;
            const s = num(sig.subarray(32, 64)); // Let s = int(sig[32:64]); fail if s ≥ n.
            if (!Fn.isValidNot0(s))
                return false;
            const e = challenge(Fn.toBytes(r), pointToBytes(P), m); // int(challenge(bytes(r)||bytes(P)||m))%n
            // R = s⋅G - e⋅P, where -eP == (n-e)P
            const R = BASE.multiplyUnsafe(s).add(P.multiplyUnsafe(Fn.neg(e)));
            const { x, y } = R.toAffine();
            // Fail if is_infinite(R) / not has_even_y(R) / x(R) ≠ r.
            if (R.is0() || !hasEven(y) || x !== r)
                return false;
            return true;
        }
        catch (error) {
            return false;
        }
    }
    /**
     * Schnorr signatures over secp256k1.
     * https://github.com/bitcoin/bips/blob/master/bip-0340.mediawiki
     * @example
     * ```js
     * import { schnorr } from '@noble/curves/secp256k1.js';
     * const { secretKey, publicKey } = schnorr.keygen();
     * // const publicKey = schnorr.getPublicKey(secretKey);
     * const msg = new TextEncoder().encode('hello');
     * const sig = schnorr.sign(msg, secretKey);
     * const isValid = schnorr.verify(sig, msg, publicKey);
     * ```
     */
    const schnorr = /* @__PURE__ */ (() => {
        const size = 32;
        const seedLength = 48;
        const randomSecretKey = (seed = randomBytes$1(seedLength)) => {
            return mapHashToField(seed, secp256k1_CURVE.n);
        };
        return {
            keygen: createKeygen(randomSecretKey, schnorrGetPublicKey),
            getPublicKey: schnorrGetPublicKey,
            sign: schnorrSign,
            verify: schnorrVerify,
            Point: Pointk1,
            utils: {
                randomSecretKey,
                taggedHash,
                lift_x,
                pointToBytes,
            },
            lengths: {
                secretKey: size,
                publicKey: size,
                publicKeyHasPrefix: false,
                signature: size * 2,
                seed: seedLength,
            },
        };
    })();

    /**
     * Utilities for hex, bytes, CSPRNG.
     * @module
     */
    /*! noble-hashes - MIT License (c) 2022 Paul Miller (paulmillr.com) */
    /** Checks if something is Uint8Array. Be careful: nodejs Buffer will return true. */
    function isBytes$2(a) {
        return a instanceof Uint8Array || (ArrayBuffer.isView(a) && a.constructor.name === 'Uint8Array');
    }
    /** Asserts something is positive integer. */
    function anumber$2(n, title = '') {
        if (!Number.isSafeInteger(n) || n < 0) {
            const prefix = title && `"${title}" `;
            throw new Error(`${prefix}expected integer >= 0, got ${n}`);
        }
    }
    /** Asserts something is Uint8Array. */
    function abytes$2(value, length, title = '') {
        const bytes = isBytes$2(value);
        const len = value?.length;
        const needsLen = length !== undefined;
        if (!bytes || (needsLen && len !== length)) {
            const prefix = title && `"${title}" `;
            const ofLen = needsLen ? ` of length ${length}` : '';
            const got = bytes ? `length=${len}` : `type=${typeof value}`;
            throw new Error(prefix + 'expected Uint8Array' + ofLen + ', got ' + got);
        }
        return value;
    }
    /** Asserts something is hash */
    function ahash(h) {
        if (typeof h !== 'function' || typeof h.create !== 'function')
            throw new Error('Hash must wrapped by utils.createHasher');
        anumber$2(h.outputLen);
        anumber$2(h.blockLen);
    }
    /** Asserts a hash instance has not been destroyed / finished */
    function aexists(instance, checkFinished = true) {
        if (instance.destroyed)
            throw new Error('Hash instance has been destroyed');
        if (checkFinished && instance.finished)
            throw new Error('Hash#digest() has already been called');
    }
    /** Asserts output is properly-sized byte array */
    function aoutput(out, instance) {
        abytes$2(out, undefined, 'digestInto() output');
        const min = instance.outputLen;
        if (out.length < min) {
            throw new Error('"digestInto() output" expected to be of length >=' + min);
        }
    }
    /** Zeroize a byte array. Warning: JS provides no guarantees. */
    function clean$1(...arrays) {
        for (let i = 0; i < arrays.length; i++) {
            arrays[i].fill(0);
        }
    }
    /** Create DataView of an array for easy byte-level manipulation. */
    function createView(arr) {
        return new DataView(arr.buffer, arr.byteOffset, arr.byteLength);
    }
    /** The rotate right (circular right shift) operation for uint32 */
    function rotr(word, shift) {
        return (word << (32 - shift)) | (word >>> shift);
    }
    // Built-in hex conversion https://caniuse.com/mdn-javascript_builtins_uint8array_fromhex
    const hasHexBuiltin$1 = /* @__PURE__ */ (() => 
    // @ts-ignore
    typeof Uint8Array.from([]).toHex === 'function' && typeof Uint8Array.fromHex === 'function')();
    // Array where index 0xf0 (240) is mapped to string 'f0'
    const hexes = /* @__PURE__ */ Array.from({ length: 256 }, (_, i) => i.toString(16).padStart(2, '0'));
    /**
     * Convert byte array to hex string. Uses built-in function, when available.
     * @example bytesToHex(Uint8Array.from([0xca, 0xfe, 0x01, 0x23])) // 'cafe0123'
     */
    function bytesToHex(bytes) {
        abytes$2(bytes);
        // @ts-ignore
        if (hasHexBuiltin$1)
            return bytes.toHex();
        // pre-caching improves the speed 6x
        let hex = '';
        for (let i = 0; i < bytes.length; i++) {
            hex += hexes[bytes[i]];
        }
        return hex;
    }
    // We use optimized technique to convert hex string to byte array
    const asciis$1 = { _0: 48, _9: 57, A: 65, F: 70, a: 97, f: 102 };
    function asciiToBase16$1(ch) {
        if (ch >= asciis$1._0 && ch <= asciis$1._9)
            return ch - asciis$1._0; // '2' => 50-48
        if (ch >= asciis$1.A && ch <= asciis$1.F)
            return ch - (asciis$1.A - 10); // 'B' => 66-(65-10)
        if (ch >= asciis$1.a && ch <= asciis$1.f)
            return ch - (asciis$1.a - 10); // 'b' => 98-(97-10)
        return;
    }
    /**
     * Convert hex string to byte array. Uses built-in function, when available.
     * @example hexToBytes('cafe0123') // Uint8Array.from([0xca, 0xfe, 0x01, 0x23])
     */
    function hexToBytes$1(hex) {
        if (typeof hex !== 'string')
            throw new Error('hex string expected, got ' + typeof hex);
        // @ts-ignore
        if (hasHexBuiltin$1)
            return Uint8Array.fromHex(hex);
        const hl = hex.length;
        const al = hl / 2;
        if (hl % 2)
            throw new Error('hex string expected, got unpadded hex of length ' + hl);
        const array = new Uint8Array(al);
        for (let ai = 0, hi = 0; ai < al; ai++, hi += 2) {
            const n1 = asciiToBase16$1(hex.charCodeAt(hi));
            const n2 = asciiToBase16$1(hex.charCodeAt(hi + 1));
            if (n1 === undefined || n2 === undefined) {
                const char = hex[hi] + hex[hi + 1];
                throw new Error('hex string expected, got non-hex character "' + char + '" at index ' + hi);
            }
            array[ai] = n1 * 16 + n2; // multiply first octet, e.g. 'a3' => 10*16+3 => 160 + 3 => 163
        }
        return array;
    }
    /** Copies several Uint8Arrays into one. */
    function concatBytes(...arrays) {
        let sum = 0;
        for (let i = 0; i < arrays.length; i++) {
            const a = arrays[i];
            abytes$2(a);
            sum += a.length;
        }
        const res = new Uint8Array(sum);
        for (let i = 0, pad = 0; i < arrays.length; i++) {
            const a = arrays[i];
            res.set(a, pad);
            pad += a.length;
        }
        return res;
    }
    /** Creates function with outputLen, blockLen, create properties from a class constructor. */
    function createHasher(hashCons, info = {}) {
        const hashC = (msg, opts) => hashCons(opts).update(msg).digest();
        const tmp = hashCons(undefined);
        hashC.outputLen = tmp.outputLen;
        hashC.blockLen = tmp.blockLen;
        hashC.create = (opts) => hashCons(opts);
        Object.assign(hashC, info);
        return Object.freeze(hashC);
    }
    /** Cryptographically secure PRNG. Uses internal OS-level `crypto.getRandomValues`. */
    function randomBytes(bytesLength = 32) {
        const cr = typeof globalThis === 'object' ? globalThis.crypto : null;
        if (typeof cr?.getRandomValues !== 'function')
            throw new Error('crypto.getRandomValues must be defined');
        return cr.getRandomValues(new Uint8Array(bytesLength));
    }
    /** Creates OID opts for NIST hashes, with prefix 06 09 60 86 48 01 65 03 04 02. */
    const oidNist = (suffix) => ({
        oid: Uint8Array.from([0x06, 0x09, 0x60, 0x86, 0x48, 0x01, 0x65, 0x03, 0x04, 0x02, suffix]),
    });

    /**
     * Internal Merkle-Damgard hash utils.
     * @module
     */
    /** Choice: a ? b : c */
    function Chi(a, b, c) {
        return (a & b) ^ (~a & c);
    }
    /** Majority function, true if any two inputs is true. */
    function Maj(a, b, c) {
        return (a & b) ^ (a & c) ^ (b & c);
    }
    /**
     * Merkle-Damgard hash construction base class.
     * Could be used to create MD5, RIPEMD, SHA1, SHA2.
     */
    class HashMD {
        blockLen;
        outputLen;
        padOffset;
        isLE;
        // For partial updates less than block size
        buffer;
        view;
        finished = false;
        length = 0;
        pos = 0;
        destroyed = false;
        constructor(blockLen, outputLen, padOffset, isLE) {
            this.blockLen = blockLen;
            this.outputLen = outputLen;
            this.padOffset = padOffset;
            this.isLE = isLE;
            this.buffer = new Uint8Array(blockLen);
            this.view = createView(this.buffer);
        }
        update(data) {
            aexists(this);
            abytes$2(data);
            const { view, buffer, blockLen } = this;
            const len = data.length;
            for (let pos = 0; pos < len;) {
                const take = Math.min(blockLen - this.pos, len - pos);
                // Fast path: we have at least one block in input, cast it to view and process
                if (take === blockLen) {
                    const dataView = createView(data);
                    for (; blockLen <= len - pos; pos += blockLen)
                        this.process(dataView, pos);
                    continue;
                }
                buffer.set(data.subarray(pos, pos + take), this.pos);
                this.pos += take;
                pos += take;
                if (this.pos === blockLen) {
                    this.process(view, 0);
                    this.pos = 0;
                }
            }
            this.length += data.length;
            this.roundClean();
            return this;
        }
        digestInto(out) {
            aexists(this);
            aoutput(out, this);
            this.finished = true;
            // Padding
            // We can avoid allocation of buffer for padding completely if it
            // was previously not allocated here. But it won't change performance.
            const { buffer, view, blockLen, isLE } = this;
            let { pos } = this;
            // append the bit '1' to the message
            buffer[pos++] = 0b10000000;
            clean$1(this.buffer.subarray(pos));
            // we have less than padOffset left in buffer, so we cannot put length in
            // current block, need process it and pad again
            if (this.padOffset > blockLen - pos) {
                this.process(view, 0);
                pos = 0;
            }
            // Pad until full block byte with zeros
            for (let i = pos; i < blockLen; i++)
                buffer[i] = 0;
            // Note: sha512 requires length to be 128bit integer, but length in JS will overflow before that
            // You need to write around 2 exabytes (u64_max / 8 / (1024**6)) for this to happen.
            // So we just write lowest 64 bits of that value.
            view.setBigUint64(blockLen - 8, BigInt(this.length * 8), isLE);
            this.process(view, 0);
            const oview = createView(out);
            const len = this.outputLen;
            // NOTE: we do division by 4 later, which must be fused in single op with modulo by JIT
            if (len % 4)
                throw new Error('_sha2: outputLen must be aligned to 32bit');
            const outLen = len / 4;
            const state = this.get();
            if (outLen > state.length)
                throw new Error('_sha2: outputLen bigger than state');
            for (let i = 0; i < outLen; i++)
                oview.setUint32(4 * i, state[i], isLE);
        }
        digest() {
            const { buffer, outputLen } = this;
            this.digestInto(buffer);
            const res = buffer.slice(0, outputLen);
            this.destroy();
            return res;
        }
        _cloneInto(to) {
            to ||= new this.constructor();
            to.set(...this.get());
            const { blockLen, buffer, length, finished, destroyed, pos } = this;
            to.destroyed = destroyed;
            to.finished = finished;
            to.length = length;
            to.pos = pos;
            if (length % blockLen)
                to.buffer.set(buffer);
            return to;
        }
        clone() {
            return this._cloneInto();
        }
    }
    /**
     * Initial SHA-2 state: fractional parts of square roots of first 16 primes 2..53.
     * Check out `test/misc/sha2-gen-iv.js` for recomputation guide.
     */
    /** Initial SHA256 state. Bits 0..32 of frac part of sqrt of primes 2..19 */
    const SHA256_IV = /* @__PURE__ */ Uint32Array.from([
        0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19,
    ]);

    /**
     * SHA2 hash function. A.k.a. sha256, sha384, sha512, sha512_224, sha512_256.
     * SHA256 is the fastest hash implementable in JS, even faster than Blake3.
     * Check out [RFC 4634](https://www.rfc-editor.org/rfc/rfc4634) and
     * [FIPS 180-4](https://nvlpubs.nist.gov/nistpubs/FIPS/NIST.FIPS.180-4.pdf).
     * @module
     */
    /**
     * Round constants:
     * First 32 bits of fractional parts of the cube roots of the first 64 primes 2..311)
     */
    // prettier-ignore
    const SHA256_K = /* @__PURE__ */ Uint32Array.from([
        0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
        0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
        0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
        0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
        0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
        0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
        0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
        0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2
    ]);
    /** Reusable temporary buffer. "W" comes straight from spec. */
    const SHA256_W = /* @__PURE__ */ new Uint32Array(64);
    /** Internal 32-byte base SHA2 hash class. */
    class SHA2_32B extends HashMD {
        constructor(outputLen) {
            super(64, outputLen, 8, false);
        }
        get() {
            const { A, B, C, D, E, F, G, H } = this;
            return [A, B, C, D, E, F, G, H];
        }
        // prettier-ignore
        set(A, B, C, D, E, F, G, H) {
            this.A = A | 0;
            this.B = B | 0;
            this.C = C | 0;
            this.D = D | 0;
            this.E = E | 0;
            this.F = F | 0;
            this.G = G | 0;
            this.H = H | 0;
        }
        process(view, offset) {
            // Extend the first 16 words into the remaining 48 words w[16..63] of the message schedule array
            for (let i = 0; i < 16; i++, offset += 4)
                SHA256_W[i] = view.getUint32(offset, false);
            for (let i = 16; i < 64; i++) {
                const W15 = SHA256_W[i - 15];
                const W2 = SHA256_W[i - 2];
                const s0 = rotr(W15, 7) ^ rotr(W15, 18) ^ (W15 >>> 3);
                const s1 = rotr(W2, 17) ^ rotr(W2, 19) ^ (W2 >>> 10);
                SHA256_W[i] = (s1 + SHA256_W[i - 7] + s0 + SHA256_W[i - 16]) | 0;
            }
            // Compression function main loop, 64 rounds
            let { A, B, C, D, E, F, G, H } = this;
            for (let i = 0; i < 64; i++) {
                const sigma1 = rotr(E, 6) ^ rotr(E, 11) ^ rotr(E, 25);
                const T1 = (H + sigma1 + Chi(E, F, G) + SHA256_K[i] + SHA256_W[i]) | 0;
                const sigma0 = rotr(A, 2) ^ rotr(A, 13) ^ rotr(A, 22);
                const T2 = (sigma0 + Maj(A, B, C)) | 0;
                H = G;
                G = F;
                F = E;
                E = (D + T1) | 0;
                D = C;
                C = B;
                B = A;
                A = (T1 + T2) | 0;
            }
            // Add the compressed chunk to the current hash value
            A = (A + this.A) | 0;
            B = (B + this.B) | 0;
            C = (C + this.C) | 0;
            D = (D + this.D) | 0;
            E = (E + this.E) | 0;
            F = (F + this.F) | 0;
            G = (G + this.G) | 0;
            H = (H + this.H) | 0;
            this.set(A, B, C, D, E, F, G, H);
        }
        roundClean() {
            clean$1(SHA256_W);
        }
        destroy() {
            this.set(0, 0, 0, 0, 0, 0, 0, 0);
            clean$1(this.buffer);
        }
    }
    /** Internal SHA2-256 hash class. */
    class _SHA256 extends SHA2_32B {
        // We cannot use array here since array allows indexing by variable
        // which means optimizer/compiler cannot use registers.
        A = SHA256_IV[0] | 0;
        B = SHA256_IV[1] | 0;
        C = SHA256_IV[2] | 0;
        D = SHA256_IV[3] | 0;
        E = SHA256_IV[4] | 0;
        F = SHA256_IV[5] | 0;
        G = SHA256_IV[6] | 0;
        H = SHA256_IV[7] | 0;
        constructor() {
            super(32);
        }
    }
    /**
     * SHA2-256 hash function from RFC 4634. In JS it's the fastest: even faster than Blake3. Some info:
     *
     * - Trying 2^128 hashes would get 50% chance of collision, using birthday attack.
     * - BTC network is doing 2^70 hashes/sec (2^95 hashes/year) as per 2025.
     * - Each sha256 hash is executing 2^18 bit operations.
     * - Good 2024 ASICs can do 200Th/sec with 3500 watts of power, corresponding to 2^36 hashes/joule.
     */
    const sha256 = /* @__PURE__ */ createHasher(() => new _SHA256(), 
    /* @__PURE__ */ oidNist(0x01));

    // pure.ts

    // core.ts
    var verifiedSymbol$1 = Symbol("verified");
    var isRecord$1 = (obj) => obj instanceof Object;
    function validateEvent$1(event) {
      if (!isRecord$1(event))
        return false;
      if (typeof event.kind !== "number")
        return false;
      if (typeof event.content !== "string")
        return false;
      if (typeof event.created_at !== "number")
        return false;
      if (typeof event.pubkey !== "string")
        return false;
      if (!event.pubkey.match(/^[a-f0-9]{64}$/))
        return false;
      if (!Array.isArray(event.tags))
        return false;
      for (let i2 = 0; i2 < event.tags.length; i2++) {
        let tag = event.tags[i2];
        if (!Array.isArray(tag))
          return false;
        for (let j = 0; j < tag.length; j++) {
          if (typeof tag[j] !== "string")
            return false;
        }
      }
      return true;
    }
    new TextDecoder("utf-8");
    var utf8Encoder$1 = new TextEncoder();

    // pure.ts
    var JS$1 = class JS {
      generateSecretKey() {
        return schnorr.utils.randomSecretKey();
      }
      getPublicKey(secretKey) {
        return bytesToHex(schnorr.getPublicKey(secretKey));
      }
      finalizeEvent(t, secretKey) {
        const event = t;
        event.pubkey = bytesToHex(schnorr.getPublicKey(secretKey));
        event.id = getEventHash$1(event);
        event.sig = bytesToHex(schnorr.sign(hexToBytes$1(getEventHash$1(event)), secretKey));
        event[verifiedSymbol$1] = true;
        return event;
      }
      verifyEvent(event) {
        if (typeof event[verifiedSymbol$1] === "boolean")
          return event[verifiedSymbol$1];
        try {
          const hash = getEventHash$1(event);
          if (hash !== event.id) {
            event[verifiedSymbol$1] = false;
            return false;
          }
          const valid = schnorr.verify(hexToBytes$1(event.sig), hexToBytes$1(hash), hexToBytes$1(event.pubkey));
          event[verifiedSymbol$1] = valid;
          return valid;
        } catch (err) {
          event[verifiedSymbol$1] = false;
          return false;
        }
      }
    };
    function serializeEvent$1(evt) {
      if (!validateEvent$1(evt))
        throw new Error("can't serialize event with wrong or missing properties");
      return JSON.stringify([0, evt.pubkey, evt.created_at, evt.kind, evt.tags, evt.content]);
    }
    function getEventHash$1(event) {
      let eventHash = sha256(utf8Encoder$1.encode(serializeEvent$1(event)));
      return bytesToHex(eventHash);
    }
    var i$1 = new JS$1();
    i$1.generateSecretKey;
    var getPublicKey$1 = i$1.getPublicKey;
    var finalizeEvent$1 = i$1.finalizeEvent;
    i$1.verifyEvent;

    /*! scure-base - MIT License (c) 2022 Paul Miller (paulmillr.com) */
    function isBytes$1(a) {
        return a instanceof Uint8Array || (ArrayBuffer.isView(a) && a.constructor.name === 'Uint8Array');
    }
    /** Asserts something is Uint8Array. */
    function abytes$1(b) {
        if (!isBytes$1(b))
            throw new Error('Uint8Array expected');
    }
    function isArrayOf(isString, arr) {
        if (!Array.isArray(arr))
            return false;
        if (arr.length === 0)
            return true;
        if (isString) {
            return arr.every((item) => typeof item === 'string');
        }
        else {
            return arr.every((item) => Number.isSafeInteger(item));
        }
    }
    function afn(input) {
        if (typeof input !== 'function')
            throw new Error('function expected');
        return true;
    }
    function astr(label, input) {
        if (typeof input !== 'string')
            throw new Error(`${label}: string expected`);
        return true;
    }
    function anumber$1(n) {
        if (!Number.isSafeInteger(n))
            throw new Error(`invalid integer: ${n}`);
    }
    function aArr(input) {
        if (!Array.isArray(input))
            throw new Error('array expected');
    }
    function astrArr(label, input) {
        if (!isArrayOf(true, input))
            throw new Error(`${label}: array of strings expected`);
    }
    function anumArr(label, input) {
        if (!isArrayOf(false, input))
            throw new Error(`${label}: array of numbers expected`);
    }
    /**
     * @__NO_SIDE_EFFECTS__
     */
    function chain(...args) {
        const id = (a) => a;
        // Wrap call in closure so JIT can inline calls
        const wrap = (a, b) => (c) => a(b(c));
        // Construct chain of args[-1].encode(args[-2].encode([...]))
        const encode = args.map((x) => x.encode).reduceRight(wrap, id);
        // Construct chain of args[0].decode(args[1].decode(...))
        const decode = args.map((x) => x.decode).reduce(wrap, id);
        return { encode, decode };
    }
    /**
     * Encodes integer radix representation to array of strings using alphabet and back.
     * Could also be array of strings.
     * @__NO_SIDE_EFFECTS__
     */
    function alphabet(letters) {
        // mapping 1 to "b"
        const lettersA = typeof letters === 'string' ? letters.split('') : letters;
        const len = lettersA.length;
        astrArr('alphabet', lettersA);
        // mapping "b" to 1
        const indexes = new Map(lettersA.map((l, i) => [l, i]));
        return {
            encode: (digits) => {
                aArr(digits);
                return digits.map((i) => {
                    if (!Number.isSafeInteger(i) || i < 0 || i >= len)
                        throw new Error(`alphabet.encode: digit index outside alphabet "${i}". Allowed: ${letters}`);
                    return lettersA[i];
                });
            },
            decode: (input) => {
                aArr(input);
                return input.map((letter) => {
                    astr('alphabet.decode', letter);
                    const i = indexes.get(letter);
                    if (i === undefined)
                        throw new Error(`Unknown letter: "${letter}". Allowed: ${letters}`);
                    return i;
                });
            },
        };
    }
    /**
     * @__NO_SIDE_EFFECTS__
     */
    function join(separator = '') {
        astr('join', separator);
        return {
            encode: (from) => {
                astrArr('join.decode', from);
                return from.join(separator);
            },
            decode: (to) => {
                astr('join.decode', to);
                return to.split(separator);
            },
        };
    }
    /**
     * Pad strings array so it has integer number of bits
     * @__NO_SIDE_EFFECTS__
     */
    function padding(bits, chr = '=') {
        anumber$1(bits);
        astr('padding', chr);
        return {
            encode(data) {
                astrArr('padding.encode', data);
                while ((data.length * bits) % 8)
                    data.push(chr);
                return data;
            },
            decode(input) {
                astrArr('padding.decode', input);
                let end = input.length;
                if ((end * bits) % 8)
                    throw new Error('padding: invalid, string should have whole number of bytes');
                for (; end > 0 && input[end - 1] === chr; end--) {
                    const last = end - 1;
                    const byte = last * bits;
                    if (byte % 8 === 0)
                        throw new Error('padding: invalid, string has too much padding');
                }
                return input.slice(0, end);
            },
        };
    }
    const gcd = (a, b) => (b === 0 ? a : gcd(b, a % b));
    const radix2carry = /* @__NO_SIDE_EFFECTS__ */ (from, to) => from + (to - gcd(from, to));
    const powers = /* @__PURE__ */ (() => {
        let res = [];
        for (let i = 0; i < 40; i++)
            res.push(2 ** i);
        return res;
    })();
    /**
     * Implemented with numbers, because BigInt is 5x slower
     */
    function convertRadix2(data, from, to, padding) {
        aArr(data);
        if (from <= 0 || from > 32)
            throw new Error(`convertRadix2: wrong from=${from}`);
        if (to <= 0 || to > 32)
            throw new Error(`convertRadix2: wrong to=${to}`);
        if (radix2carry(from, to) > 32) {
            throw new Error(`convertRadix2: carry overflow from=${from} to=${to} carryBits=${radix2carry(from, to)}`);
        }
        let carry = 0;
        let pos = 0; // bitwise position in current element
        const max = powers[from];
        const mask = powers[to] - 1;
        const res = [];
        for (const n of data) {
            anumber$1(n);
            if (n >= max)
                throw new Error(`convertRadix2: invalid data word=${n} from=${from}`);
            carry = (carry << from) | n;
            if (pos + from > 32)
                throw new Error(`convertRadix2: carry overflow pos=${pos} from=${from}`);
            pos += from;
            for (; pos >= to; pos -= to)
                res.push(((carry >> (pos - to)) & mask) >>> 0);
            const pow = powers[pos];
            if (pow === undefined)
                throw new Error('invalid carry');
            carry &= pow - 1; // clean carry, otherwise it will cause overflow
        }
        carry = (carry << (to - pos)) & mask;
        if (!padding && pos >= from)
            throw new Error('Excess padding');
        if (!padding && carry > 0)
            throw new Error(`Non-zero padding: ${carry}`);
        if (padding && pos > 0)
            res.push(carry >>> 0);
        return res;
    }
    /**
     * If both bases are power of same number (like `2**8 <-> 2**64`),
     * there is a linear algorithm. For now we have implementation for power-of-two bases only.
     * @__NO_SIDE_EFFECTS__
     */
    function radix2(bits, revPadding = false) {
        anumber$1(bits);
        if (bits <= 0 || bits > 32)
            throw new Error('radix2: bits should be in (0..32]');
        if (radix2carry(8, bits) > 32 || radix2carry(bits, 8) > 32)
            throw new Error('radix2: carry overflow');
        return {
            encode: (bytes) => {
                if (!isBytes$1(bytes))
                    throw new Error('radix2.encode input should be Uint8Array');
                return convertRadix2(Array.from(bytes), 8, bits, !revPadding);
            },
            decode: (digits) => {
                anumArr('radix2.decode', digits);
                return Uint8Array.from(convertRadix2(digits, bits, 8, revPadding));
            },
        };
    }
    function unsafeWrapper(fn) {
        afn(fn);
        return function (...args) {
            try {
                return fn.apply(null, args);
            }
            catch (e) { }
        };
    }
    // Built-in base64 conversion https://caniuse.com/mdn-javascript_builtins_uint8array_frombase64
    // prettier-ignore
    const hasBase64Builtin = /* @__PURE__ */ (() => typeof Uint8Array.from([]).toBase64 === 'function' &&
        typeof Uint8Array.fromBase64 === 'function')();
    const decodeBase64Builtin = (s, isUrl) => {
        astr('base64', s);
        const re = /^[A-Za-z0-9=+/]+$/;
        const alphabet = 'base64';
        if (s.length > 0 && !re.test(s))
            throw new Error('invalid base64');
        return Uint8Array.fromBase64(s, { alphabet, lastChunkHandling: 'strict' });
    };
    /**
     * base64 from RFC 4648. Padded.
     * Use `base64nopad` for unpadded version.
     * Also check out `base64url`, `base64urlnopad`.
     * Falls back to built-in function, when available.
     * @example
     * ```js
     * base64.encode(Uint8Array.from([0x12, 0xab]));
     * // => 'Eqs='
     * base64.decode('Eqs=');
     * // => Uint8Array.from([0x12, 0xab])
     * ```
     */
    // prettier-ignore
    const base64 = hasBase64Builtin ? {
        encode(b) { abytes$1(b); return b.toBase64(); },
        decode(s) { return decodeBase64Builtin(s); },
    } : chain(radix2(6), alphabet('ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'), padding(6), join(''));
    const BECH_ALPHABET = chain(alphabet('qpzry9x8gf2tvdw0s3jn54khce6mua7l'), join(''));
    const POLYMOD_GENERATORS = [0x3b6a57b2, 0x26508e6d, 0x1ea119fa, 0x3d4233dd, 0x2a1462b3];
    function bech32Polymod(pre) {
        const b = pre >> 25;
        let chk = (pre & 0x1ffffff) << 5;
        for (let i = 0; i < POLYMOD_GENERATORS.length; i++) {
            if (((b >> i) & 1) === 1)
                chk ^= POLYMOD_GENERATORS[i];
        }
        return chk;
    }
    function bechChecksum(prefix, words, encodingConst = 1) {
        const len = prefix.length;
        let chk = 1;
        for (let i = 0; i < len; i++) {
            const c = prefix.charCodeAt(i);
            if (c < 33 || c > 126)
                throw new Error(`Invalid prefix (${prefix})`);
            chk = bech32Polymod(chk) ^ (c >> 5);
        }
        chk = bech32Polymod(chk);
        for (let i = 0; i < len; i++)
            chk = bech32Polymod(chk) ^ (prefix.charCodeAt(i) & 0x1f);
        for (let v of words)
            chk = bech32Polymod(chk) ^ v;
        for (let i = 0; i < 6; i++)
            chk = bech32Polymod(chk);
        chk ^= encodingConst;
        return BECH_ALPHABET.encode(convertRadix2([chk % powers[30]], 30, 5, false));
    }
    /**
     * @__NO_SIDE_EFFECTS__
     */
    function genBech32(encoding) {
        const ENCODING_CONST = encoding === 'bech32' ? 1 : 0x2bc830a3;
        const _words = radix2(5);
        const fromWords = _words.decode;
        const toWords = _words.encode;
        const fromWordsUnsafe = unsafeWrapper(fromWords);
        function encode(prefix, words, limit = 90) {
            astr('bech32.encode prefix', prefix);
            if (isBytes$1(words))
                words = Array.from(words);
            anumArr('bech32.encode', words);
            const plen = prefix.length;
            if (plen === 0)
                throw new TypeError(`Invalid prefix length ${plen}`);
            const actualLength = plen + 7 + words.length;
            if (limit !== false && actualLength > limit)
                throw new TypeError(`Length ${actualLength} exceeds limit ${limit}`);
            const lowered = prefix.toLowerCase();
            const sum = bechChecksum(lowered, words, ENCODING_CONST);
            return `${lowered}1${BECH_ALPHABET.encode(words)}${sum}`;
        }
        function decode(str, limit = 90) {
            astr('bech32.decode input', str);
            const slen = str.length;
            if (slen < 8 || (limit !== false && slen > limit))
                throw new TypeError(`invalid string length: ${slen} (${str}). Expected (8..${limit})`);
            // don't allow mixed case
            const lowered = str.toLowerCase();
            if (str !== lowered && str !== str.toUpperCase())
                throw new Error(`String must be lowercase or uppercase`);
            const sepIndex = lowered.lastIndexOf('1');
            if (sepIndex === 0 || sepIndex === -1)
                throw new Error(`Letter "1" must be present between prefix and data only`);
            const prefix = lowered.slice(0, sepIndex);
            const data = lowered.slice(sepIndex + 1);
            if (data.length < 6)
                throw new Error('Data must be at least 6 characters long');
            const words = BECH_ALPHABET.decode(data).slice(0, -6);
            const sum = bechChecksum(prefix, words, ENCODING_CONST);
            if (!data.endsWith(sum))
                throw new Error(`Invalid checksum in ${str}: expected "${sum}"`);
            return { prefix, words };
        }
        const decodeUnsafe = unsafeWrapper(decode);
        function decodeToBytes(str) {
            const { prefix, words } = decode(str, false);
            return { prefix, words, bytes: fromWords(words) };
        }
        function encodeFromBytes(prefix, bytes) {
            return encode(prefix, toWords(bytes));
        }
        return {
            encode,
            decode,
            encodeFromBytes,
            decodeToBytes,
            decodeUnsafe,
            fromWords,
            fromWordsUnsafe,
            toWords,
        };
    }
    /**
     * bech32 from BIP 173. Operates on words.
     * For high-level, check out scure-btc-signer:
     * https://github.com/paulmillr/scure-btc-signer.
     */
    const bech32 = genBech32('bech32');

    /**
     * Utilities for hex, bytes, CSPRNG.
     * @module
     */
    /*! noble-ciphers - MIT License (c) 2023 Paul Miller (paulmillr.com) */
    /** Checks if something is Uint8Array. Be careful: nodejs Buffer will return true. */
    function isBytes(a) {
        return a instanceof Uint8Array || (ArrayBuffer.isView(a) && a.constructor.name === 'Uint8Array');
    }
    /** Asserts something is boolean. */
    function abool(b) {
        if (typeof b !== 'boolean')
            throw new Error(`boolean expected, not ${b}`);
    }
    /** Asserts something is positive integer. */
    function anumber(n) {
        if (!Number.isSafeInteger(n) || n < 0)
            throw new Error('positive integer expected, got ' + n);
    }
    /** Asserts something is Uint8Array. */
    function abytes(value, length, title = '') {
        const bytes = isBytes(value);
        const len = value?.length;
        const needsLen = length !== undefined;
        if (!bytes || (needsLen && len !== length)) {
            const prefix = title && `"${title}" `;
            const ofLen = needsLen ? ` of length ${length}` : '';
            const got = bytes ? `length=${len}` : `type=${typeof value}`;
            throw new Error(prefix + 'expected Uint8Array' + ofLen + ', got ' + got);
        }
        return value;
    }
    /** Cast u8 / u16 / u32 to u32. */
    function u32(arr) {
        return new Uint32Array(arr.buffer, arr.byteOffset, Math.floor(arr.byteLength / 4));
    }
    /** Zeroize a byte array. Warning: JS provides no guarantees. */
    function clean(...arrays) {
        for (let i = 0; i < arrays.length; i++) {
            arrays[i].fill(0);
        }
    }
    /** Is current platform little-endian? Most are. Big-Endian platform: IBM */
    const isLE = /* @__PURE__ */ (() => new Uint8Array(new Uint32Array([0x11223344]).buffer)[0] === 0x44)();
    /**
     * Checks if two U8A use same underlying buffer and overlaps.
     * This is invalid and can corrupt data.
     */
    function overlapBytes(a, b) {
        return (a.buffer === b.buffer && // best we can do, may fail with an obscure Proxy
            a.byteOffset < b.byteOffset + b.byteLength && // a starts before b end
            b.byteOffset < a.byteOffset + a.byteLength // b starts before a end
        );
    }
    /**
     * If input and output overlap and input starts before output, we will overwrite end of input before
     * we start processing it, so this is not supported for most ciphers (except chacha/salse, which designed with this)
     */
    function complexOverlapBytes(input, output) {
        // This is very cursed. It works somehow, but I'm completely unsure,
        // reasoning about overlapping aligned windows is very hard.
        if (overlapBytes(input, output) && input.byteOffset < output.byteOffset)
            throw new Error('complex overlap of input and output is not supported');
    }
    function checkOpts(defaults, opts) {
        if (opts == null || typeof opts !== 'object')
            throw new Error('options must be defined');
        const merged = Object.assign(defaults, opts);
        return merged;
    }
    /** Compares 2 uint8array-s in kinda constant time. */
    function equalBytes(a, b) {
        if (a.length !== b.length)
            return false;
        let diff = 0;
        for (let i = 0; i < a.length; i++)
            diff |= a[i] ^ b[i];
        return diff === 0;
    }
    /**
     * Wraps a cipher: validates args, ensures encrypt() can only be called once.
     * @__NO_SIDE_EFFECTS__
     */
    const wrapCipher = (params, constructor) => {
        function wrappedCipher(key, ...args) {
            // Validate key
            abytes(key, undefined, 'key');
            // Big-Endian hardware is rare. Just in case someone still decides to run ciphers:
            if (!isLE)
                throw new Error('Non little-endian hardware is not yet supported');
            // Validate nonce if nonceLength is present
            if (params.nonceLength !== undefined) {
                const nonce = args[0];
                abytes(nonce, params.varSizeNonce ? undefined : params.nonceLength, 'nonce');
            }
            // Validate AAD if tagLength present
            const tagl = params.tagLength;
            if (tagl && args[1] !== undefined)
                abytes(args[1], undefined, 'AAD');
            const cipher = constructor(key, ...args);
            const checkOutput = (fnLength, output) => {
                if (output !== undefined) {
                    if (fnLength !== 2)
                        throw new Error('cipher output not supported');
                    abytes(output, undefined, 'output');
                }
            };
            // Create wrapped cipher with validation and single-use encryption
            let called = false;
            const wrCipher = {
                encrypt(data, output) {
                    if (called)
                        throw new Error('cannot encrypt() twice with same key + nonce');
                    called = true;
                    abytes(data);
                    checkOutput(cipher.encrypt.length, output);
                    return cipher.encrypt(data, output);
                },
                decrypt(data, output) {
                    abytes(data);
                    if (tagl && data.length < tagl)
                        throw new Error('"ciphertext" expected length bigger than tagLength=' + tagl);
                    checkOutput(cipher.decrypt.length, output);
                    return cipher.decrypt(data, output);
                },
            };
            return wrCipher;
        }
        Object.assign(wrappedCipher, params);
        return wrappedCipher;
    };
    /**
     * By default, returns u8a of length.
     * When out is available, it checks it for validity and uses it.
     */
    function getOutput(expectedLength, out, onlyAligned = true) {
        if (out === undefined)
            return new Uint8Array(expectedLength);
        if (out.length !== expectedLength)
            throw new Error('"output" expected Uint8Array of length ' + expectedLength + ', got: ' + out.length);
        if (onlyAligned && !isAligned32$1(out))
            throw new Error('invalid output, must be aligned');
        return out;
    }
    // Is byte array aligned to 4 byte offset (u32)?
    function isAligned32$1(bytes) {
        return bytes.byteOffset % 4 === 0;
    }
    // copy bytes to new u8a (aligned). Because Buffer.slice is broken.
    function copyBytes(bytes) {
        return Uint8Array.from(bytes);
    }

    /**
     * [AES](https://en.wikipedia.org/wiki/Advanced_Encryption_Standard)
     * a.k.a. Advanced Encryption Standard
     * is a variant of Rijndael block cipher, standardized by NIST in 2001.
     * We provide the fastest available pure JS implementation.
     *
     * `cipher = encrypt(block, key)`
     *
     * Data is split into 128-bit blocks. Encrypted in 10/12/14 rounds (128/192/256 bits). In every round:
     * 1. **S-box**, table substitution
     * 2. **Shift rows**, cyclic shift left of all rows of data array
     * 3. **Mix columns**, multiplying every column by fixed polynomial
     * 4. **Add round key**, round_key xor i-th column of array
     *
     * Check out [FIPS-197](https://csrc.nist.gov/files/pubs/fips/197/final/docs/fips-197.pdf),
     * [NIST 800-38G](https://nvlpubs.nist.gov/nistpubs/SpecialPublications/NIST.SP.800-38G.pdf)
     * and [original proposal](https://csrc.nist.gov/csrc/media/projects/cryptographic-standards-and-guidelines/documents/aes-development/rijndael-ammended.pdf)
     * @module
     */
    const BLOCK_SIZE = 16;
    const POLY = 0x11b; // 1 + x + x**3 + x**4 + x**8
    function validateKeyLength(key) {
        if (![16, 24, 32].includes(key.length))
            throw new Error('"aes key" expected Uint8Array of length 16/24/32, got length=' + key.length);
    }
    // TODO: remove multiplication, binary ops only
    function mul2(n) {
        return (n << 1) ^ (POLY & -(n >> 7));
    }
    function mul(a, b) {
        let res = 0;
        for (; b > 0; b >>= 1) {
            // Montgomery ladder
            res ^= a & -(b & 1); // if (b&1) res ^=a (but const-time).
            a = mul2(a); // a = 2*a
        }
        return res;
    }
    // AES S-box is generated using finite field inversion,
    // an affine transform, and xor of a constant 0x63.
    const sbox = /* @__PURE__ */ (() => {
        const t = new Uint8Array(256);
        for (let i = 0, x = 1; i < 256; i++, x ^= mul2(x))
            t[i] = x;
        const box = new Uint8Array(256);
        box[0] = 0x63; // first elm
        for (let i = 0; i < 255; i++) {
            let x = t[255 - i];
            x |= x << 8;
            box[t[i]] = (x ^ (x >> 4) ^ (x >> 5) ^ (x >> 6) ^ (x >> 7) ^ 0x63) & 0xff;
        }
        clean(t);
        return box;
    })();
    // Inverted S-box
    const invSbox = /* @__PURE__ */ sbox.map((_, j) => sbox.indexOf(j));
    // Rotate u32 by 8
    const rotr32_8 = (n) => (n << 24) | (n >>> 8);
    const rotl32_8 = (n) => (n << 8) | (n >>> 24);
    // T-table is optimization suggested in 5.2 of original proposal (missed from FIPS-197). Changes:
    // - LE instead of BE
    // - bigger tables: T0 and T1 are merged into T01 table and T2 & T3 into T23;
    //   so index is u16, instead of u8. This speeds up things, unexpectedly
    function genTtable(sbox, fn) {
        if (sbox.length !== 256)
            throw new Error('Wrong sbox length');
        const T0 = new Uint32Array(256).map((_, j) => fn(sbox[j]));
        const T1 = T0.map(rotl32_8);
        const T2 = T1.map(rotl32_8);
        const T3 = T2.map(rotl32_8);
        const T01 = new Uint32Array(256 * 256);
        const T23 = new Uint32Array(256 * 256);
        const sbox2 = new Uint16Array(256 * 256);
        for (let i = 0; i < 256; i++) {
            for (let j = 0; j < 256; j++) {
                const idx = i * 256 + j;
                T01[idx] = T0[i] ^ T1[j];
                T23[idx] = T2[i] ^ T3[j];
                sbox2[idx] = (sbox[i] << 8) | sbox[j];
            }
        }
        return { sbox, sbox2, T0, T1, T2, T3, T01, T23 };
    }
    const tableEncoding = /* @__PURE__ */ genTtable(sbox, (s) => (mul(s, 3) << 24) | (s << 16) | (s << 8) | mul(s, 2));
    const tableDecoding = /* @__PURE__ */ genTtable(invSbox, (s) => (mul(s, 11) << 24) | (mul(s, 13) << 16) | (mul(s, 9) << 8) | mul(s, 14));
    const xPowers = /* @__PURE__ */ (() => {
        const p = new Uint8Array(16);
        for (let i = 0, x = 1; i < 16; i++, x = mul2(x))
            p[i] = x;
        return p;
    })();
    /** Key expansion used in CTR. */
    function expandKeyLE(key) {
        abytes(key);
        const len = key.length;
        validateKeyLength(key);
        const { sbox2 } = tableEncoding;
        const toClean = [];
        if (!isAligned32$1(key))
            toClean.push((key = copyBytes(key)));
        const k32 = u32(key);
        const Nk = k32.length;
        const subByte = (n) => applySbox(sbox2, n, n, n, n);
        const xk = new Uint32Array(len + 28); // expanded key
        xk.set(k32);
        // 4.3.1 Key expansion
        for (let i = Nk; i < xk.length; i++) {
            let t = xk[i - 1];
            if (i % Nk === 0)
                t = subByte(rotr32_8(t)) ^ xPowers[i / Nk - 1];
            else if (Nk > 6 && i % Nk === 4)
                t = subByte(t);
            xk[i] = xk[i - Nk] ^ t;
        }
        clean(...toClean);
        return xk;
    }
    function expandKeyDecLE(key) {
        const encKey = expandKeyLE(key);
        const xk = encKey.slice();
        const Nk = encKey.length;
        const { sbox2 } = tableEncoding;
        const { T0, T1, T2, T3 } = tableDecoding;
        // Inverse key by chunks of 4 (rounds)
        for (let i = 0; i < Nk; i += 4) {
            for (let j = 0; j < 4; j++)
                xk[i + j] = encKey[Nk - i - 4 + j];
        }
        clean(encKey);
        // apply InvMixColumn except first & last round
        for (let i = 4; i < Nk - 4; i++) {
            const x = xk[i];
            const w = applySbox(sbox2, x, x, x, x);
            xk[i] = T0[w & 0xff] ^ T1[(w >>> 8) & 0xff] ^ T2[(w >>> 16) & 0xff] ^ T3[w >>> 24];
        }
        return xk;
    }
    // Apply tables
    function apply0123(T01, T23, s0, s1, s2, s3) {
        return (T01[((s0 << 8) & 0xff00) | ((s1 >>> 8) & 0xff)] ^
            T23[((s2 >>> 8) & 0xff00) | ((s3 >>> 24) & 0xff)]);
    }
    function applySbox(sbox2, s0, s1, s2, s3) {
        return (sbox2[(s0 & 0xff) | (s1 & 0xff00)] |
            (sbox2[((s2 >>> 16) & 0xff) | ((s3 >>> 16) & 0xff00)] << 16));
    }
    function encrypt$1(xk, s0, s1, s2, s3) {
        const { sbox2, T01, T23 } = tableEncoding;
        let k = 0;
        ((s0 ^= xk[k++]), (s1 ^= xk[k++]), (s2 ^= xk[k++]), (s3 ^= xk[k++]));
        const rounds = xk.length / 4 - 2;
        for (let i = 0; i < rounds; i++) {
            const t0 = xk[k++] ^ apply0123(T01, T23, s0, s1, s2, s3);
            const t1 = xk[k++] ^ apply0123(T01, T23, s1, s2, s3, s0);
            const t2 = xk[k++] ^ apply0123(T01, T23, s2, s3, s0, s1);
            const t3 = xk[k++] ^ apply0123(T01, T23, s3, s0, s1, s2);
            ((s0 = t0), (s1 = t1), (s2 = t2), (s3 = t3));
        }
        // last round (without mixcolumns, so using SBOX2 table)
        const t0 = xk[k++] ^ applySbox(sbox2, s0, s1, s2, s3);
        const t1 = xk[k++] ^ applySbox(sbox2, s1, s2, s3, s0);
        const t2 = xk[k++] ^ applySbox(sbox2, s2, s3, s0, s1);
        const t3 = xk[k++] ^ applySbox(sbox2, s3, s0, s1, s2);
        return { s0: t0, s1: t1, s2: t2, s3: t3 };
    }
    // Can't be merged with encrypt: arg positions for apply0123 / applySbox are different
    function decrypt$1(xk, s0, s1, s2, s3) {
        const { sbox2, T01, T23 } = tableDecoding;
        let k = 0;
        ((s0 ^= xk[k++]), (s1 ^= xk[k++]), (s2 ^= xk[k++]), (s3 ^= xk[k++]));
        const rounds = xk.length / 4 - 2;
        for (let i = 0; i < rounds; i++) {
            const t0 = xk[k++] ^ apply0123(T01, T23, s0, s3, s2, s1);
            const t1 = xk[k++] ^ apply0123(T01, T23, s1, s0, s3, s2);
            const t2 = xk[k++] ^ apply0123(T01, T23, s2, s1, s0, s3);
            const t3 = xk[k++] ^ apply0123(T01, T23, s3, s2, s1, s0);
            ((s0 = t0), (s1 = t1), (s2 = t2), (s3 = t3));
        }
        // Last round
        const t0 = xk[k++] ^ applySbox(sbox2, s0, s3, s2, s1);
        const t1 = xk[k++] ^ applySbox(sbox2, s1, s0, s3, s2);
        const t2 = xk[k++] ^ applySbox(sbox2, s2, s1, s0, s3);
        const t3 = xk[k++] ^ applySbox(sbox2, s3, s2, s1, s0);
        return { s0: t0, s1: t1, s2: t2, s3: t3 };
    }
    function validateBlockDecrypt(data) {
        abytes(data);
        if (data.length % BLOCK_SIZE !== 0) {
            throw new Error('aes-(cbc/ecb).decrypt ciphertext should consist of blocks with size ' + BLOCK_SIZE);
        }
    }
    function validateBlockEncrypt(plaintext, pcks5, dst) {
        abytes(plaintext);
        let outLen = plaintext.length;
        const remaining = outLen % BLOCK_SIZE;
        if (!pcks5 && remaining !== 0)
            throw new Error('aec/(cbc-ecb): unpadded plaintext with disabled padding');
        if (!isAligned32$1(plaintext))
            plaintext = copyBytes(plaintext);
        const b = u32(plaintext);
        if (pcks5) {
            let left = BLOCK_SIZE - remaining;
            if (!left)
                left = BLOCK_SIZE; // if no bytes left, create empty padding block
            outLen = outLen + left;
        }
        dst = getOutput(outLen, dst);
        complexOverlapBytes(plaintext, dst);
        const o = u32(dst);
        return { b, o, out: dst };
    }
    function validatePCKS(data, pcks5) {
        if (!pcks5)
            return data;
        const len = data.length;
        if (!len)
            throw new Error('aes/pcks5: empty ciphertext not allowed');
        const lastByte = data[len - 1];
        if (lastByte <= 0 || lastByte > 16)
            throw new Error('aes/pcks5: wrong padding');
        const out = data.subarray(0, -lastByte);
        for (let i = 0; i < lastByte; i++)
            if (data[len - i - 1] !== lastByte)
                throw new Error('aes/pcks5: wrong padding');
        return out;
    }
    function padPCKS(left) {
        const tmp = new Uint8Array(16);
        const tmp32 = u32(tmp);
        tmp.set(left);
        const paddingByte = BLOCK_SIZE - left.length;
        for (let i = BLOCK_SIZE - paddingByte; i < BLOCK_SIZE; i++)
            tmp[i] = paddingByte;
        return tmp32;
    }
    /**
     * **CBC** (Cipher Block Chaining): Each plaintext block is XORed with the
     * previous block of ciphertext before encryption.
     * Hard to use: requires proper padding and an IV. Unauthenticated: needs MAC.
     */
    const cbc = /* @__PURE__ */ wrapCipher({ blockSize: 16, nonceLength: 16 }, function aescbc(key, iv, opts = {}) {
        const pcks5 = !opts.disablePadding;
        return {
            encrypt(plaintext, dst) {
                const xk = expandKeyLE(key);
                const { b, o, out: _out } = validateBlockEncrypt(plaintext, pcks5, dst);
                let _iv = iv;
                const toClean = [xk];
                if (!isAligned32$1(_iv))
                    toClean.push((_iv = copyBytes(_iv)));
                const n32 = u32(_iv);
                // prettier-ignore
                let s0 = n32[0], s1 = n32[1], s2 = n32[2], s3 = n32[3];
                let i = 0;
                for (; i + 4 <= b.length;) {
                    ((s0 ^= b[i + 0]), (s1 ^= b[i + 1]), (s2 ^= b[i + 2]), (s3 ^= b[i + 3]));
                    ({ s0, s1, s2, s3 } = encrypt$1(xk, s0, s1, s2, s3));
                    ((o[i++] = s0), (o[i++] = s1), (o[i++] = s2), (o[i++] = s3));
                }
                if (pcks5) {
                    const tmp32 = padPCKS(plaintext.subarray(i * 4));
                    ((s0 ^= tmp32[0]), (s1 ^= tmp32[1]), (s2 ^= tmp32[2]), (s3 ^= tmp32[3]));
                    ({ s0, s1, s2, s3 } = encrypt$1(xk, s0, s1, s2, s3));
                    ((o[i++] = s0), (o[i++] = s1), (o[i++] = s2), (o[i++] = s3));
                }
                clean(...toClean);
                return _out;
            },
            decrypt(ciphertext, dst) {
                validateBlockDecrypt(ciphertext);
                const xk = expandKeyDecLE(key);
                let _iv = iv;
                const toClean = [xk];
                if (!isAligned32$1(_iv))
                    toClean.push((_iv = copyBytes(_iv)));
                const n32 = u32(_iv);
                dst = getOutput(ciphertext.length, dst);
                if (!isAligned32$1(ciphertext))
                    toClean.push((ciphertext = copyBytes(ciphertext)));
                complexOverlapBytes(ciphertext, dst);
                const b = u32(ciphertext);
                const o = u32(dst);
                // prettier-ignore
                let s0 = n32[0], s1 = n32[1], s2 = n32[2], s3 = n32[3];
                for (let i = 0; i + 4 <= b.length;) {
                    // prettier-ignore
                    const ps0 = s0, ps1 = s1, ps2 = s2, ps3 = s3;
                    ((s0 = b[i + 0]), (s1 = b[i + 1]), (s2 = b[i + 2]), (s3 = b[i + 3]));
                    const { s0: o0, s1: o1, s2: o2, s3: o3 } = decrypt$1(xk, s0, s1, s2, s3);
                    ((o[i++] = o0 ^ ps0), (o[i++] = o1 ^ ps1), (o[i++] = o2 ^ ps2), (o[i++] = o3 ^ ps3));
                }
                clean(...toClean);
                return validatePCKS(dst, pcks5);
            },
        };
    });

    /**
     * Basic utils for ARX (add-rotate-xor) salsa and chacha ciphers.

    RFC8439 requires multi-step cipher stream, where
    authKey starts with counter: 0, actual msg with counter: 1.

    For this, we need a way to re-use nonce / counter:

        const counter = new Uint8Array(4);
        chacha(..., counter, ...); // counter is now 1
        chacha(..., counter, ...); // counter is now 2

    This is complicated:

    - 32-bit counters are enough, no need for 64-bit: max ArrayBuffer size in JS is 4GB
    - Original papers don't allow mutating counters
    - Counter overflow is undefined [^1]
    - Idea A: allow providing (nonce | counter) instead of just nonce, re-use it
    - Caveat: Cannot be re-used through all cases:
    - * chacha has (counter | nonce)
    - * xchacha has (nonce16 | counter | nonce16)
    - Idea B: separate nonce / counter and provide separate API for counter re-use
    - Caveat: there are different counter sizes depending on an algorithm.
    - salsa & chacha also differ in structures of key & sigma:
      salsa20:      s[0] | k(4) | s[1] | nonce(2) | cnt(2) | s[2] | k(4) | s[3]
      chacha:       s(4) | k(8) | cnt(1) | nonce(3)
      chacha20orig: s(4) | k(8) | cnt(2) | nonce(2)
    - Idea C: helper method such as `setSalsaState(key, nonce, sigma, data)`
    - Caveat: we can't re-use counter array

    xchacha [^2] uses the subkey and remaining 8 byte nonce with ChaCha20 as normal
    (prefixed by 4 NUL bytes, since [RFC8439] specifies a 12-byte nonce).

    [^1]: https://mailarchive.ietf.org/arch/msg/cfrg/gsOnTJzcbgG6OqD8Sc0GO5aR_tU/
    [^2]: https://datatracker.ietf.org/doc/html/draft-irtf-cfrg-xchacha#appendix-A.2

     * @module
     */
    // Replaces `TextEncoder`, which is not available in all environments
    const encodeStr = (str) => Uint8Array.from(str.split(''), (c) => c.charCodeAt(0));
    const sigma16 = encodeStr('expand 16-byte k');
    const sigma32 = encodeStr('expand 32-byte k');
    const sigma16_32 = u32(sigma16);
    const sigma32_32 = u32(sigma32);
    /** Rotate left. */
    function rotl(a, b) {
        return (a << b) | (a >>> (32 - b));
    }
    // Is byte array aligned to 4 byte offset (u32)?
    function isAligned32(b) {
        return b.byteOffset % 4 === 0;
    }
    // Salsa and Chacha block length is always 512-bit
    const BLOCK_LEN = 64;
    const BLOCK_LEN32 = 16;
    // new Uint32Array([2**32])   // => Uint32Array(1) [ 0 ]
    // new Uint32Array([2**32-1]) // => Uint32Array(1) [ 4294967295 ]
    const MAX_COUNTER = 2 ** 32 - 1;
    const U32_EMPTY = Uint32Array.of();
    function runCipher(core, sigma, key, nonce, data, output, counter, rounds) {
        const len = data.length;
        const block = new Uint8Array(BLOCK_LEN);
        const b32 = u32(block);
        // Make sure that buffers aligned to 4 bytes
        const isAligned = isAligned32(data) && isAligned32(output);
        const d32 = isAligned ? u32(data) : U32_EMPTY;
        const o32 = isAligned ? u32(output) : U32_EMPTY;
        for (let pos = 0; pos < len; counter++) {
            core(sigma, key, nonce, b32, counter, rounds);
            if (counter >= MAX_COUNTER)
                throw new Error('arx: counter overflow');
            const take = Math.min(BLOCK_LEN, len - pos);
            // aligned to 4 bytes
            if (isAligned && take === BLOCK_LEN) {
                const pos32 = pos / 4;
                if (pos % 4 !== 0)
                    throw new Error('arx: invalid block position');
                for (let j = 0, posj; j < BLOCK_LEN32; j++) {
                    posj = pos32 + j;
                    o32[posj] = d32[posj] ^ b32[j];
                }
                pos += BLOCK_LEN;
                continue;
            }
            for (let j = 0, posj; j < take; j++) {
                posj = pos + j;
                output[posj] = data[posj] ^ block[j];
            }
            pos += take;
        }
    }
    /** Creates ARX-like (ChaCha, Salsa) cipher stream from core function. */
    function createCipher(core, opts) {
        const { allowShortKeys, extendNonceFn, counterLength, counterRight, rounds } = checkOpts({ allowShortKeys: false, counterLength: 8, counterRight: false, rounds: 20 }, opts);
        if (typeof core !== 'function')
            throw new Error('core must be a function');
        anumber(counterLength);
        anumber(rounds);
        abool(counterRight);
        abool(allowShortKeys);
        return (key, nonce, data, output, counter = 0) => {
            abytes(key, undefined, 'key');
            abytes(nonce, undefined, 'nonce');
            abytes(data, undefined, 'data');
            const len = data.length;
            if (output === undefined)
                output = new Uint8Array(len);
            abytes(output, undefined, 'output');
            anumber(counter);
            if (counter < 0 || counter >= MAX_COUNTER)
                throw new Error('arx: counter overflow');
            if (output.length < len)
                throw new Error(`arx: output (${output.length}) is shorter than data (${len})`);
            const toClean = [];
            // Key & sigma
            // key=16 -> sigma16, k=key|key
            // key=32 -> sigma32, k=key
            let l = key.length;
            let k;
            let sigma;
            if (l === 32) {
                toClean.push((k = copyBytes(key)));
                sigma = sigma32_32;
            }
            else if (l === 16 && allowShortKeys) {
                k = new Uint8Array(32);
                k.set(key);
                k.set(key, 16);
                sigma = sigma16_32;
                toClean.push(k);
            }
            else {
                abytes(key, 32, 'arx key');
                throw new Error('invalid key size');
                // throw new Error(`"arx key" expected Uint8Array of length 32, got length=${l}`);
            }
            // Nonce
            // salsa20:      8   (8-byte counter)
            // chacha20orig: 8   (8-byte counter)
            // chacha20:     12  (4-byte counter)
            // xsalsa20:     24  (16 -> hsalsa,  8 -> old nonce)
            // xchacha20:    24  (16 -> hchacha, 8 -> old nonce)
            // Align nonce to 4 bytes
            if (!isAligned32(nonce))
                toClean.push((nonce = copyBytes(nonce)));
            const k32 = u32(k);
            // hsalsa & hchacha: handle extended nonce
            if (extendNonceFn) {
                if (nonce.length !== 24)
                    throw new Error(`arx: extended nonce must be 24 bytes`);
                extendNonceFn(sigma, k32, u32(nonce.subarray(0, 16)), k32);
                nonce = nonce.subarray(16);
            }
            // Handle nonce counter
            const nonceNcLen = 16 - counterLength;
            if (nonceNcLen !== nonce.length)
                throw new Error(`arx: nonce must be ${nonceNcLen} or 16 bytes`);
            // Pad counter when nonce is 64 bit
            if (nonceNcLen !== 12) {
                const nc = new Uint8Array(12);
                nc.set(nonce, counterRight ? 0 : 12 - nonce.length);
                nonce = nc;
                toClean.push(nonce);
            }
            const n32 = u32(nonce);
            runCipher(core, sigma, k32, n32, data, output, counter, rounds);
            clean(...toClean);
            return output;
        };
    }

    /**
     * ChaCha stream cipher, released
     * in 2008. Developed after Salsa20, ChaCha aims to increase diffusion per round.
     * It was standardized in [RFC 8439](https://www.rfc-editor.org/rfc/rfc8439) and
     * is now used in TLS 1.3.
     *
     * [XChaCha20](https://datatracker.ietf.org/doc/html/draft-irtf-cfrg-xchacha)
     * extended-nonce variant is also provided. Similar to XSalsa, it's safe to use with
     * randomly-generated nonces.
     *
     * Check out [PDF](http://cr.yp.to/chacha/chacha-20080128.pdf) and
     * [wiki](https://en.wikipedia.org/wiki/Salsa20) and
     * [website](https://cr.yp.to/chacha.html).
     *
     * @module
     */
    /** Identical to `chachaCore_small`. Unused. */
    // prettier-ignore
    function chachaCore(s, k, n, out, cnt, rounds = 20) {
        let y00 = s[0], y01 = s[1], y02 = s[2], y03 = s[3], // "expa"   "nd 3"  "2-by"  "te k"
        y04 = k[0], y05 = k[1], y06 = k[2], y07 = k[3], // Key      Key     Key     Key
        y08 = k[4], y09 = k[5], y10 = k[6], y11 = k[7], // Key      Key     Key     Key
        y12 = cnt, y13 = n[0], y14 = n[1], y15 = n[2]; // Counter  Counter	Nonce   Nonce
        // Save state to temporary variables
        let x00 = y00, x01 = y01, x02 = y02, x03 = y03, x04 = y04, x05 = y05, x06 = y06, x07 = y07, x08 = y08, x09 = y09, x10 = y10, x11 = y11, x12 = y12, x13 = y13, x14 = y14, x15 = y15;
        for (let r = 0; r < rounds; r += 2) {
            x00 = (x00 + x04) | 0;
            x12 = rotl(x12 ^ x00, 16);
            x08 = (x08 + x12) | 0;
            x04 = rotl(x04 ^ x08, 12);
            x00 = (x00 + x04) | 0;
            x12 = rotl(x12 ^ x00, 8);
            x08 = (x08 + x12) | 0;
            x04 = rotl(x04 ^ x08, 7);
            x01 = (x01 + x05) | 0;
            x13 = rotl(x13 ^ x01, 16);
            x09 = (x09 + x13) | 0;
            x05 = rotl(x05 ^ x09, 12);
            x01 = (x01 + x05) | 0;
            x13 = rotl(x13 ^ x01, 8);
            x09 = (x09 + x13) | 0;
            x05 = rotl(x05 ^ x09, 7);
            x02 = (x02 + x06) | 0;
            x14 = rotl(x14 ^ x02, 16);
            x10 = (x10 + x14) | 0;
            x06 = rotl(x06 ^ x10, 12);
            x02 = (x02 + x06) | 0;
            x14 = rotl(x14 ^ x02, 8);
            x10 = (x10 + x14) | 0;
            x06 = rotl(x06 ^ x10, 7);
            x03 = (x03 + x07) | 0;
            x15 = rotl(x15 ^ x03, 16);
            x11 = (x11 + x15) | 0;
            x07 = rotl(x07 ^ x11, 12);
            x03 = (x03 + x07) | 0;
            x15 = rotl(x15 ^ x03, 8);
            x11 = (x11 + x15) | 0;
            x07 = rotl(x07 ^ x11, 7);
            x00 = (x00 + x05) | 0;
            x15 = rotl(x15 ^ x00, 16);
            x10 = (x10 + x15) | 0;
            x05 = rotl(x05 ^ x10, 12);
            x00 = (x00 + x05) | 0;
            x15 = rotl(x15 ^ x00, 8);
            x10 = (x10 + x15) | 0;
            x05 = rotl(x05 ^ x10, 7);
            x01 = (x01 + x06) | 0;
            x12 = rotl(x12 ^ x01, 16);
            x11 = (x11 + x12) | 0;
            x06 = rotl(x06 ^ x11, 12);
            x01 = (x01 + x06) | 0;
            x12 = rotl(x12 ^ x01, 8);
            x11 = (x11 + x12) | 0;
            x06 = rotl(x06 ^ x11, 7);
            x02 = (x02 + x07) | 0;
            x13 = rotl(x13 ^ x02, 16);
            x08 = (x08 + x13) | 0;
            x07 = rotl(x07 ^ x08, 12);
            x02 = (x02 + x07) | 0;
            x13 = rotl(x13 ^ x02, 8);
            x08 = (x08 + x13) | 0;
            x07 = rotl(x07 ^ x08, 7);
            x03 = (x03 + x04) | 0;
            x14 = rotl(x14 ^ x03, 16);
            x09 = (x09 + x14) | 0;
            x04 = rotl(x04 ^ x09, 12);
            x03 = (x03 + x04) | 0;
            x14 = rotl(x14 ^ x03, 8);
            x09 = (x09 + x14) | 0;
            x04 = rotl(x04 ^ x09, 7);
        }
        // Write output
        let oi = 0;
        out[oi++] = (y00 + x00) | 0;
        out[oi++] = (y01 + x01) | 0;
        out[oi++] = (y02 + x02) | 0;
        out[oi++] = (y03 + x03) | 0;
        out[oi++] = (y04 + x04) | 0;
        out[oi++] = (y05 + x05) | 0;
        out[oi++] = (y06 + x06) | 0;
        out[oi++] = (y07 + x07) | 0;
        out[oi++] = (y08 + x08) | 0;
        out[oi++] = (y09 + x09) | 0;
        out[oi++] = (y10 + x10) | 0;
        out[oi++] = (y11 + x11) | 0;
        out[oi++] = (y12 + x12) | 0;
        out[oi++] = (y13 + x13) | 0;
        out[oi++] = (y14 + x14) | 0;
        out[oi++] = (y15 + x15) | 0;
    }
    /**
     * ChaCha stream cipher. Conforms to RFC 8439 (IETF, TLS). 12-byte nonce, 4-byte counter.
     * With smaller nonce, it's not safe to make it random (CSPRNG), due to collision chance.
     */
    const chacha20 = /* @__PURE__ */ createCipher(chachaCore, {
        counterRight: false,
        counterLength: 4,
        allowShortKeys: false,
    });

    /**
     * HMAC: RFC2104 message authentication code.
     * @module
     */
    /** Internal class for HMAC. */
    class _HMAC {
        oHash;
        iHash;
        blockLen;
        outputLen;
        finished = false;
        destroyed = false;
        constructor(hash, key) {
            ahash(hash);
            abytes$2(key, undefined, 'key');
            this.iHash = hash.create();
            if (typeof this.iHash.update !== 'function')
                throw new Error('Expected instance of class which extends utils.Hash');
            this.blockLen = this.iHash.blockLen;
            this.outputLen = this.iHash.outputLen;
            const blockLen = this.blockLen;
            const pad = new Uint8Array(blockLen);
            // blockLen can be bigger than outputLen
            pad.set(key.length > blockLen ? hash.create().update(key).digest() : key);
            for (let i = 0; i < pad.length; i++)
                pad[i] ^= 0x36;
            this.iHash.update(pad);
            // By doing update (processing of first block) of outer hash here we can re-use it between multiple calls via clone
            this.oHash = hash.create();
            // Undo internal XOR && apply outer XOR
            for (let i = 0; i < pad.length; i++)
                pad[i] ^= 0x36 ^ 0x5c;
            this.oHash.update(pad);
            clean$1(pad);
        }
        update(buf) {
            aexists(this);
            this.iHash.update(buf);
            return this;
        }
        digestInto(out) {
            aexists(this);
            abytes$2(out, this.outputLen, 'output');
            this.finished = true;
            this.iHash.digestInto(out);
            this.oHash.update(out);
            this.oHash.digestInto(out);
            this.destroy();
        }
        digest() {
            const out = new Uint8Array(this.oHash.outputLen);
            this.digestInto(out);
            return out;
        }
        _cloneInto(to) {
            // Create new instance without calling constructor since key already in state and we don't know it.
            to ||= Object.create(Object.getPrototypeOf(this), {});
            const { oHash, iHash, finished, destroyed, blockLen, outputLen } = this;
            to = to;
            to.finished = finished;
            to.destroyed = destroyed;
            to.blockLen = blockLen;
            to.outputLen = outputLen;
            to.oHash = oHash._cloneInto(to.oHash);
            to.iHash = iHash._cloneInto(to.iHash);
            return to;
        }
        clone() {
            return this._cloneInto();
        }
        destroy() {
            this.destroyed = true;
            this.oHash.destroy();
            this.iHash.destroy();
        }
    }
    /**
     * HMAC: RFC2104 message authentication code.
     * @param hash - function that would be used e.g. sha256
     * @param key - message key
     * @param message - message data
     * @example
     * import { hmac } from '@noble/hashes/hmac';
     * import { sha256 } from '@noble/hashes/sha2';
     * const mac1 = hmac(sha256, 'key', 'message');
     */
    const hmac = (hash, key, message) => new _HMAC(hash, key).update(message).digest();
    hmac.create = (hash, key) => new _HMAC(hash, key);

    /**
     * HKDF (RFC 5869): extract + expand in one step.
     * See https://soatok.blog/2021/11/17/understanding-hkdf/.
     * @module
     */
    /**
     * HKDF-extract from spec. Less important part. `HKDF-Extract(IKM, salt) -> PRK`
     * Arguments position differs from spec (IKM is first one, since it is not optional)
     * @param hash - hash function that would be used (e.g. sha256)
     * @param ikm - input keying material, the initial key
     * @param salt - optional salt value (a non-secret random value)
     */
    function extract(hash, ikm, salt) {
        ahash(hash);
        // NOTE: some libraries treat zero-length array as 'not provided';
        // we don't, since we have undefined as 'not provided'
        // https://github.com/RustCrypto/KDFs/issues/15
        if (salt === undefined)
            salt = new Uint8Array(hash.outputLen);
        return hmac(hash, salt, ikm);
    }
    const HKDF_COUNTER = /* @__PURE__ */ Uint8Array.of(0);
    const EMPTY_BUFFER = /* @__PURE__ */ Uint8Array.of();
    /**
     * HKDF-expand from the spec. The most important part. `HKDF-Expand(PRK, info, L) -> OKM`
     * @param hash - hash function that would be used (e.g. sha256)
     * @param prk - a pseudorandom key of at least HashLen octets (usually, the output from the extract step)
     * @param info - optional context and application specific information (can be a zero-length string)
     * @param length - length of output keying material in bytes
     */
    function expand(hash, prk, info, length = 32) {
        ahash(hash);
        anumber$2(length, 'length');
        const olen = hash.outputLen;
        if (length > 255 * olen)
            throw new Error('Length must be <= 255*HashLen');
        const blocks = Math.ceil(length / olen);
        if (info === undefined)
            info = EMPTY_BUFFER;
        else
            abytes$2(info, undefined, 'info');
        // first L(ength) octets of T
        const okm = new Uint8Array(blocks * olen);
        // Re-use HMAC instance between blocks
        const HMAC = hmac.create(hash, prk);
        const HMACTmp = HMAC._cloneInto();
        const T = new Uint8Array(HMAC.outputLen);
        for (let counter = 0; counter < blocks; counter++) {
            HKDF_COUNTER[0] = counter + 1;
            // T(0) = empty string (zero length)
            // T(N) = HMAC-Hash(PRK, T(N-1) | info | N)
            HMACTmp.update(counter === 0 ? EMPTY_BUFFER : T)
                .update(info)
                .update(HKDF_COUNTER)
                .digestInto(T);
            okm.set(T, olen * counter);
            HMAC._cloneInto(HMACTmp);
        }
        HMAC.destroy();
        HMACTmp.destroy();
        clean$1(T, HKDF_COUNTER);
        return okm.slice(0, length);
    }

    var __defProp = Object.defineProperty;
    var __export = (target, all) => {
      for (var name in all)
        __defProp(target, name, { get: all[name], enumerable: true });
    };

    // core.ts
    var verifiedSymbol = Symbol("verified");
    var isRecord = (obj) => obj instanceof Object;
    function validateEvent(event) {
      if (!isRecord(event))
        return false;
      if (typeof event.kind !== "number")
        return false;
      if (typeof event.content !== "string")
        return false;
      if (typeof event.created_at !== "number")
        return false;
      if (typeof event.pubkey !== "string")
        return false;
      if (!event.pubkey.match(/^[a-f0-9]{64}$/))
        return false;
      if (!Array.isArray(event.tags))
        return false;
      for (let i2 = 0; i2 < event.tags.length; i2++) {
        let tag = event.tags[i2];
        if (!Array.isArray(tag))
          return false;
        for (let j = 0; j < tag.length; j++) {
          if (typeof tag[j] !== "string")
            return false;
        }
      }
      return true;
    }

    // utils.ts
    var utils_exports = {};
    __export(utils_exports, {
      binarySearch: () => binarySearch,
      bytesToHex: () => bytesToHex,
      hexToBytes: () => hexToBytes$1,
      insertEventIntoAscendingList: () => insertEventIntoAscendingList,
      insertEventIntoDescendingList: () => insertEventIntoDescendingList,
      mergeReverseSortedLists: () => mergeReverseSortedLists,
      normalizeURL: () => normalizeURL,
      utf8Decoder: () => utf8Decoder,
      utf8Encoder: () => utf8Encoder
    });
    var utf8Decoder = new TextDecoder("utf-8");
    var utf8Encoder = new TextEncoder();
    function normalizeURL(url) {
      try {
        if (url.indexOf("://") === -1)
          url = "wss://" + url;
        let p = new URL(url);
        if (p.protocol === "http:")
          p.protocol = "ws:";
        else if (p.protocol === "https:")
          p.protocol = "wss:";
        p.pathname = p.pathname.replace(/\/+/g, "/");
        if (p.pathname.endsWith("/"))
          p.pathname = p.pathname.slice(0, -1);
        if (p.port === "80" && p.protocol === "ws:" || p.port === "443" && p.protocol === "wss:")
          p.port = "";
        p.searchParams.sort();
        p.hash = "";
        return p.toString();
      } catch (e) {
        throw new Error(`Invalid URL: ${url}`);
      }
    }
    function insertEventIntoDescendingList(sortedArray, event) {
      const [idx, found] = binarySearch(sortedArray, (b) => {
        if (event.id === b.id)
          return 0;
        if (event.created_at === b.created_at)
          return -1;
        return b.created_at - event.created_at;
      });
      if (!found) {
        sortedArray.splice(idx, 0, event);
      }
      return sortedArray;
    }
    function insertEventIntoAscendingList(sortedArray, event) {
      const [idx, found] = binarySearch(sortedArray, (b) => {
        if (event.id === b.id)
          return 0;
        if (event.created_at === b.created_at)
          return -1;
        return event.created_at - b.created_at;
      });
      if (!found) {
        sortedArray.splice(idx, 0, event);
      }
      return sortedArray;
    }
    function binarySearch(arr, compare) {
      let start = 0;
      let end = arr.length - 1;
      while (start <= end) {
        const mid = Math.floor((start + end) / 2);
        const cmp = compare(arr[mid]);
        if (cmp === 0) {
          return [mid, true];
        }
        if (cmp < 0) {
          end = mid - 1;
        } else {
          start = mid + 1;
        }
      }
      return [start, false];
    }
    function mergeReverseSortedLists(list1, list2) {
      const result = new Array(list1.length + list2.length);
      result.length = 0;
      let i1 = 0;
      let i2 = 0;
      let sameTimestampIds = [];
      while (i1 < list1.length && i2 < list2.length) {
        let next;
        if (list1[i1]?.created_at > list2[i2]?.created_at) {
          next = list1[i1];
          i1++;
        } else {
          next = list2[i2];
          i2++;
        }
        if (result.length > 0 && result[result.length - 1].created_at === next.created_at) {
          if (sameTimestampIds.includes(next.id))
            continue;
        } else {
          sameTimestampIds.length = 0;
        }
        result.push(next);
        sameTimestampIds.push(next.id);
      }
      while (i1 < list1.length) {
        const next = list1[i1];
        i1++;
        if (result.length > 0 && result[result.length - 1].created_at === next.created_at) {
          if (sameTimestampIds.includes(next.id))
            continue;
        } else {
          sameTimestampIds.length = 0;
        }
        result.push(next);
        sameTimestampIds.push(next.id);
      }
      while (i2 < list2.length) {
        const next = list2[i2];
        i2++;
        if (result.length > 0 && result[result.length - 1].created_at === next.created_at) {
          if (sameTimestampIds.includes(next.id))
            continue;
        } else {
          sameTimestampIds.length = 0;
        }
        result.push(next);
        sameTimestampIds.push(next.id);
      }
      return result;
    }

    // pure.ts
    var JS = class {
      generateSecretKey() {
        return schnorr.utils.randomSecretKey();
      }
      getPublicKey(secretKey) {
        return bytesToHex(schnorr.getPublicKey(secretKey));
      }
      finalizeEvent(t, secretKey) {
        const event = t;
        event.pubkey = bytesToHex(schnorr.getPublicKey(secretKey));
        event.id = getEventHash(event);
        event.sig = bytesToHex(schnorr.sign(hexToBytes$1(getEventHash(event)), secretKey));
        event[verifiedSymbol] = true;
        return event;
      }
      verifyEvent(event) {
        if (typeof event[verifiedSymbol] === "boolean")
          return event[verifiedSymbol];
        try {
          const hash = getEventHash(event);
          if (hash !== event.id) {
            event[verifiedSymbol] = false;
            return false;
          }
          const valid = schnorr.verify(hexToBytes$1(event.sig), hexToBytes$1(hash), hexToBytes$1(event.pubkey));
          event[verifiedSymbol] = valid;
          return valid;
        } catch (err) {
          event[verifiedSymbol] = false;
          return false;
        }
      }
    };
    function serializeEvent(evt) {
      if (!validateEvent(evt))
        throw new Error("can't serialize event with wrong or missing properties");
      return JSON.stringify([0, evt.pubkey, evt.created_at, evt.kind, evt.tags, evt.content]);
    }
    function getEventHash(event) {
      let eventHash = sha256(utf8Encoder.encode(serializeEvent(event)));
      return bytesToHex(eventHash);
    }
    var i = new JS();
    var generateSecretKey = i.generateSecretKey;
    var getPublicKey = i.getPublicKey;
    var finalizeEvent = i.finalizeEvent;
    var verifyEvent = i.verifyEvent;

    // kinds.ts
    var kinds_exports = {};
    __export(kinds_exports, {
      Application: () => Application,
      BadgeAward: () => BadgeAward,
      BadgeDefinition: () => BadgeDefinition,
      BlockedRelaysList: () => BlockedRelaysList,
      BlossomServerList: () => BlossomServerList,
      BookmarkList: () => BookmarkList,
      Bookmarksets: () => Bookmarksets,
      Calendar: () => Calendar,
      CalendarEventRSVP: () => CalendarEventRSVP,
      ChannelCreation: () => ChannelCreation,
      ChannelHideMessage: () => ChannelHideMessage,
      ChannelMessage: () => ChannelMessage,
      ChannelMetadata: () => ChannelMetadata,
      ChannelMuteUser: () => ChannelMuteUser,
      ChatMessage: () => ChatMessage,
      ClassifiedListing: () => ClassifiedListing,
      ClientAuth: () => ClientAuth,
      Comment: () => Comment,
      CommunitiesList: () => CommunitiesList,
      CommunityDefinition: () => CommunityDefinition,
      CommunityPostApproval: () => CommunityPostApproval,
      Contacts: () => Contacts,
      CreateOrUpdateProduct: () => CreateOrUpdateProduct,
      CreateOrUpdateStall: () => CreateOrUpdateStall,
      Curationsets: () => Curationsets,
      Date: () => Date2,
      DirectMessageRelaysList: () => DirectMessageRelaysList,
      DraftClassifiedListing: () => DraftClassifiedListing,
      DraftLong: () => DraftLong,
      Emojisets: () => Emojisets,
      EncryptedDirectMessage: () => EncryptedDirectMessage,
      EventDeletion: () => EventDeletion,
      FavoriteRelays: () => FavoriteRelays,
      FileMessage: () => FileMessage,
      FileMetadata: () => FileMetadata,
      FileServerPreference: () => FileServerPreference,
      Followsets: () => Followsets,
      ForumThread: () => ForumThread,
      GenericRepost: () => GenericRepost,
      Genericlists: () => Genericlists,
      GiftWrap: () => GiftWrap,
      GroupMetadata: () => GroupMetadata,
      HTTPAuth: () => HTTPAuth,
      Handlerinformation: () => Handlerinformation,
      Handlerrecommendation: () => Handlerrecommendation,
      Highlights: () => Highlights,
      InterestsList: () => InterestsList,
      Interestsets: () => Interestsets,
      JobFeedback: () => JobFeedback,
      JobRequest: () => JobRequest,
      JobResult: () => JobResult,
      Label: () => Label,
      LightningPubRPC: () => LightningPubRPC,
      LiveChatMessage: () => LiveChatMessage,
      LiveEvent: () => LiveEvent,
      LongFormArticle: () => LongFormArticle,
      Metadata: () => Metadata,
      Mutelist: () => Mutelist,
      NWCWalletInfo: () => NWCWalletInfo,
      NWCWalletRequest: () => NWCWalletRequest,
      NWCWalletResponse: () => NWCWalletResponse,
      NormalVideo: () => NormalVideo,
      NostrConnect: () => NostrConnect,
      OpenTimestamps: () => OpenTimestamps,
      Photo: () => Photo,
      Pinlist: () => Pinlist,
      Poll: () => Poll,
      PollResponse: () => PollResponse,
      PrivateDirectMessage: () => PrivateDirectMessage,
      ProblemTracker: () => ProblemTracker,
      ProfileBadges: () => ProfileBadges,
      PublicChatsList: () => PublicChatsList,
      Reaction: () => Reaction,
      RecommendRelay: () => RecommendRelay,
      RelayList: () => RelayList,
      RelayReview: () => RelayReview,
      Relaysets: () => Relaysets,
      Report: () => Report,
      Reporting: () => Reporting,
      Repost: () => Repost,
      Seal: () => Seal,
      SearchRelaysList: () => SearchRelaysList,
      ShortTextNote: () => ShortTextNote,
      ShortVideo: () => ShortVideo,
      Time: () => Time,
      UserEmojiList: () => UserEmojiList,
      UserStatuses: () => UserStatuses,
      Voice: () => Voice,
      VoiceComment: () => VoiceComment,
      Zap: () => Zap,
      ZapGoal: () => ZapGoal,
      ZapRequest: () => ZapRequest,
      classifyKind: () => classifyKind,
      isAddressableKind: () => isAddressableKind,
      isEphemeralKind: () => isEphemeralKind,
      isKind: () => isKind,
      isRegularKind: () => isRegularKind,
      isReplaceableKind: () => isReplaceableKind
    });
    function isRegularKind(kind) {
      return kind < 1e4 && kind !== 0 && kind !== 3;
    }
    function isReplaceableKind(kind) {
      return kind === 0 || kind === 3 || 1e4 <= kind && kind < 2e4;
    }
    function isEphemeralKind(kind) {
      return 2e4 <= kind && kind < 3e4;
    }
    function isAddressableKind(kind) {
      return 3e4 <= kind && kind < 4e4;
    }
    function classifyKind(kind) {
      if (isRegularKind(kind))
        return "regular";
      if (isReplaceableKind(kind))
        return "replaceable";
      if (isEphemeralKind(kind))
        return "ephemeral";
      if (isAddressableKind(kind))
        return "parameterized";
      return "unknown";
    }
    function isKind(event, kind) {
      const kindAsArray = kind instanceof Array ? kind : [kind];
      return validateEvent(event) && kindAsArray.includes(event.kind) || false;
    }
    var Metadata = 0;
    var ShortTextNote = 1;
    var RecommendRelay = 2;
    var Contacts = 3;
    var EncryptedDirectMessage = 4;
    var EventDeletion = 5;
    var Repost = 6;
    var Reaction = 7;
    var BadgeAward = 8;
    var ChatMessage = 9;
    var ForumThread = 11;
    var Seal = 13;
    var PrivateDirectMessage = 14;
    var FileMessage = 15;
    var GenericRepost = 16;
    var Photo = 20;
    var NormalVideo = 21;
    var ShortVideo = 22;
    var ChannelCreation = 40;
    var ChannelMetadata = 41;
    var ChannelMessage = 42;
    var ChannelHideMessage = 43;
    var ChannelMuteUser = 44;
    var OpenTimestamps = 1040;
    var GiftWrap = 1059;
    var Poll = 1068;
    var FileMetadata = 1063;
    var Comment = 1111;
    var LiveChatMessage = 1311;
    var Voice = 1222;
    var VoiceComment = 1244;
    var ProblemTracker = 1971;
    var Report = 1984;
    var Reporting = 1984;
    var Label = 1985;
    var CommunityPostApproval = 4550;
    var JobRequest = 5999;
    var JobResult = 6999;
    var JobFeedback = 7e3;
    var ZapGoal = 9041;
    var ZapRequest = 9734;
    var Zap = 9735;
    var Highlights = 9802;
    var PollResponse = 1018;
    var Mutelist = 1e4;
    var Pinlist = 10001;
    var RelayList = 10002;
    var BookmarkList = 10003;
    var CommunitiesList = 10004;
    var PublicChatsList = 10005;
    var BlockedRelaysList = 10006;
    var SearchRelaysList = 10007;
    var FavoriteRelays = 10012;
    var InterestsList = 10015;
    var UserEmojiList = 10030;
    var DirectMessageRelaysList = 10050;
    var FileServerPreference = 10096;
    var BlossomServerList = 10063;
    var NWCWalletInfo = 13194;
    var LightningPubRPC = 21e3;
    var ClientAuth = 22242;
    var NWCWalletRequest = 23194;
    var NWCWalletResponse = 23195;
    var NostrConnect = 24133;
    var HTTPAuth = 27235;
    var Followsets = 3e4;
    var Genericlists = 30001;
    var Relaysets = 30002;
    var Bookmarksets = 30003;
    var Curationsets = 30004;
    var ProfileBadges = 30008;
    var BadgeDefinition = 30009;
    var Interestsets = 30015;
    var CreateOrUpdateStall = 30017;
    var CreateOrUpdateProduct = 30018;
    var LongFormArticle = 30023;
    var DraftLong = 30024;
    var Emojisets = 30030;
    var Application = 30078;
    var LiveEvent = 30311;
    var UserStatuses = 30315;
    var ClassifiedListing = 30402;
    var DraftClassifiedListing = 30403;
    var Date2 = 31922;
    var Time = 31923;
    var Calendar = 31924;
    var CalendarEventRSVP = 31925;
    var RelayReview = 31987;
    var Handlerrecommendation = 31989;
    var Handlerinformation = 31990;
    var CommunityDefinition = 34550;
    var GroupMetadata = 39e3;

    // fakejson.ts
    var fakejson_exports = {};
    __export(fakejson_exports, {
      getHex64: () => getHex64,
      getInt: () => getInt,
      getSubscriptionId: () => getSubscriptionId,
      matchEventId: () => matchEventId,
      matchEventKind: () => matchEventKind,
      matchEventPubkey: () => matchEventPubkey
    });
    function getHex64(json, field) {
      let len = field.length + 3;
      let idx = json.indexOf(`"${field}":`) + len;
      let s = json.slice(idx).indexOf(`"`) + idx + 1;
      return json.slice(s, s + 64);
    }
    function getInt(json, field) {
      let len = field.length;
      let idx = json.indexOf(`"${field}":`) + len + 3;
      let sliced = json.slice(idx);
      let end = Math.min(sliced.indexOf(","), sliced.indexOf("}"));
      return parseInt(sliced.slice(0, end), 10);
    }
    function getSubscriptionId(json) {
      let idx = json.slice(0, 22).indexOf(`"EVENT"`);
      if (idx === -1)
        return null;
      let pstart = json.slice(idx + 7 + 1).indexOf(`"`);
      if (pstart === -1)
        return null;
      let start = idx + 7 + 1 + pstart;
      let pend = json.slice(start + 1, 80).indexOf(`"`);
      if (pend === -1)
        return null;
      let end = start + 1 + pend;
      return json.slice(start + 1, end);
    }
    function matchEventId(json, id) {
      return id === getHex64(json, "id");
    }
    function matchEventPubkey(json, pubkey) {
      return pubkey === getHex64(json, "pubkey");
    }
    function matchEventKind(json, kind) {
      return kind === getInt(json, "kind");
    }

    // nip42.ts
    var nip42_exports = {};
    __export(nip42_exports, {
      makeAuthEvent: () => makeAuthEvent
    });
    function makeAuthEvent(relayURL, challenge) {
      return {
        kind: ClientAuth,
        created_at: Math.floor(Date.now() / 1e3),
        tags: [
          ["relay", relayURL],
          ["challenge", challenge]
        ],
        content: ""
      };
    }

    // relay.ts
    var _WebSocket;
    try {
      _WebSocket = WebSocket;
    } catch {
    }

    // pool.ts
    var _WebSocket2;
    try {
      _WebSocket2 = WebSocket;
    } catch {
    }

    // nip19.ts
    var nip19_exports = {};
    __export(nip19_exports, {
      BECH32_REGEX: () => BECH32_REGEX,
      Bech32MaxSize: () => Bech32MaxSize,
      NostrTypeGuard: () => NostrTypeGuard,
      decode: () => decode,
      decodeNostrURI: () => decodeNostrURI,
      encodeBytes: () => encodeBytes,
      naddrEncode: () => naddrEncode,
      neventEncode: () => neventEncode,
      noteEncode: () => noteEncode,
      nprofileEncode: () => nprofileEncode,
      npubEncode: () => npubEncode,
      nsecEncode: () => nsecEncode
    });
    var NostrTypeGuard = {
      isNProfile: (value) => /^nprofile1[a-z\d]+$/.test(value || ""),
      isNEvent: (value) => /^nevent1[a-z\d]+$/.test(value || ""),
      isNAddr: (value) => /^naddr1[a-z\d]+$/.test(value || ""),
      isNSec: (value) => /^nsec1[a-z\d]{58}$/.test(value || ""),
      isNPub: (value) => /^npub1[a-z\d]{58}$/.test(value || ""),
      isNote: (value) => /^note1[a-z\d]+$/.test(value || ""),
      isNcryptsec: (value) => /^ncryptsec1[a-z\d]+$/.test(value || "")
    };
    var Bech32MaxSize = 5e3;
    var BECH32_REGEX = /[\x21-\x7E]{1,83}1[023456789acdefghjklmnpqrstuvwxyz]{6,}/;
    function integerToUint8Array(number) {
      const uint8Array = new Uint8Array(4);
      uint8Array[0] = number >> 24 & 255;
      uint8Array[1] = number >> 16 & 255;
      uint8Array[2] = number >> 8 & 255;
      uint8Array[3] = number & 255;
      return uint8Array;
    }
    function decodeNostrURI(nip19code) {
      try {
        if (nip19code.startsWith("nostr:"))
          nip19code = nip19code.substring(6);
        return decode(nip19code);
      } catch (_err) {
        return { type: "invalid", data: null };
      }
    }
    function decode(code) {
      let { prefix, words } = bech32.decode(code, Bech32MaxSize);
      let data = new Uint8Array(bech32.fromWords(words));
      switch (prefix) {
        case "nprofile": {
          let tlv = parseTLV(data);
          if (!tlv[0]?.[0])
            throw new Error("missing TLV 0 for nprofile");
          if (tlv[0][0].length !== 32)
            throw new Error("TLV 0 should be 32 bytes");
          return {
            type: "nprofile",
            data: {
              pubkey: bytesToHex(tlv[0][0]),
              relays: tlv[1] ? tlv[1].map((d) => utf8Decoder.decode(d)) : []
            }
          };
        }
        case "nevent": {
          let tlv = parseTLV(data);
          if (!tlv[0]?.[0])
            throw new Error("missing TLV 0 for nevent");
          if (tlv[0][0].length !== 32)
            throw new Error("TLV 0 should be 32 bytes");
          if (tlv[2] && tlv[2][0].length !== 32)
            throw new Error("TLV 2 should be 32 bytes");
          if (tlv[3] && tlv[3][0].length !== 4)
            throw new Error("TLV 3 should be 4 bytes");
          return {
            type: "nevent",
            data: {
              id: bytesToHex(tlv[0][0]),
              relays: tlv[1] ? tlv[1].map((d) => utf8Decoder.decode(d)) : [],
              author: tlv[2]?.[0] ? bytesToHex(tlv[2][0]) : void 0,
              kind: tlv[3]?.[0] ? parseInt(bytesToHex(tlv[3][0]), 16) : void 0
            }
          };
        }
        case "naddr": {
          let tlv = parseTLV(data);
          if (!tlv[0]?.[0])
            throw new Error("missing TLV 0 for naddr");
          if (!tlv[2]?.[0])
            throw new Error("missing TLV 2 for naddr");
          if (tlv[2][0].length !== 32)
            throw new Error("TLV 2 should be 32 bytes");
          if (!tlv[3]?.[0])
            throw new Error("missing TLV 3 for naddr");
          if (tlv[3][0].length !== 4)
            throw new Error("TLV 3 should be 4 bytes");
          return {
            type: "naddr",
            data: {
              identifier: utf8Decoder.decode(tlv[0][0]),
              pubkey: bytesToHex(tlv[2][0]),
              kind: parseInt(bytesToHex(tlv[3][0]), 16),
              relays: tlv[1] ? tlv[1].map((d) => utf8Decoder.decode(d)) : []
            }
          };
        }
        case "nsec":
          return { type: prefix, data };
        case "npub":
        case "note":
          return { type: prefix, data: bytesToHex(data) };
        default:
          throw new Error(`unknown prefix ${prefix}`);
      }
    }
    function parseTLV(data) {
      let result = {};
      let rest = data;
      while (rest.length > 0) {
        if (rest.length < 2)
          throw new Error("not enough data to read TLV");
        let t = rest[0];
        let l = rest[1];
        let v = rest.slice(2, 2 + l);
        rest = rest.slice(2 + l);
        if (v.length < l)
          throw new Error(`not enough data to read on TLV ${t}`);
        result[t] = result[t] || [];
        result[t].push(v);
      }
      return result;
    }
    function nsecEncode(key) {
      return encodeBytes("nsec", key);
    }
    function npubEncode(hex) {
      return encodeBytes("npub", hexToBytes$1(hex));
    }
    function noteEncode(hex) {
      return encodeBytes("note", hexToBytes$1(hex));
    }
    function encodeBech32(prefix, data) {
      let words = bech32.toWords(data);
      return bech32.encode(prefix, words, Bech32MaxSize);
    }
    function encodeBytes(prefix, bytes) {
      return encodeBech32(prefix, bytes);
    }
    function nprofileEncode(profile) {
      let data = encodeTLV({
        0: [hexToBytes$1(profile.pubkey)],
        1: (profile.relays || []).map((url) => utf8Encoder.encode(url))
      });
      return encodeBech32("nprofile", data);
    }
    function neventEncode(event) {
      let kindArray;
      if (event.kind !== void 0) {
        kindArray = integerToUint8Array(event.kind);
      }
      let data = encodeTLV({
        0: [hexToBytes$1(event.id)],
        1: (event.relays || []).map((url) => utf8Encoder.encode(url)),
        2: event.author ? [hexToBytes$1(event.author)] : [],
        3: kindArray ? [new Uint8Array(kindArray)] : []
      });
      return encodeBech32("nevent", data);
    }
    function naddrEncode(addr) {
      let kind = new ArrayBuffer(4);
      new DataView(kind).setUint32(0, addr.kind, false);
      let data = encodeTLV({
        0: [utf8Encoder.encode(addr.identifier)],
        1: (addr.relays || []).map((url) => utf8Encoder.encode(url)),
        2: [hexToBytes$1(addr.pubkey)],
        3: [new Uint8Array(kind)]
      });
      return encodeBech32("naddr", data);
    }
    function encodeTLV(tlv) {
      let entries = [];
      Object.entries(tlv).reverse().forEach(([t, vs]) => {
        vs.forEach((v) => {
          let entry = new Uint8Array(v.length + 2);
          entry.set([parseInt(t)], 0);
          entry.set([v.length], 1);
          entry.set(v, 2);
          entries.push(entry);
        });
      });
      return concatBytes(...entries);
    }

    // nip04.ts
    var nip04_exports = {};
    __export(nip04_exports, {
      decrypt: () => decrypt,
      encrypt: () => encrypt
    });
    function encrypt(secretKey, pubkey, text) {
      const privkey = secretKey instanceof Uint8Array ? secretKey : hexToBytes$1(secretKey);
      const key = secp256k1.getSharedSecret(privkey, hexToBytes$1("02" + pubkey));
      const normalizedKey = getNormalizedX(key);
      let iv = Uint8Array.from(randomBytes(16));
      let plaintext = utf8Encoder.encode(text);
      let ciphertext = cbc(normalizedKey, iv).encrypt(plaintext);
      let ctb64 = base64.encode(new Uint8Array(ciphertext));
      let ivb64 = base64.encode(new Uint8Array(iv.buffer));
      return `${ctb64}?iv=${ivb64}`;
    }
    function decrypt(secretKey, pubkey, data) {
      const privkey = secretKey instanceof Uint8Array ? secretKey : hexToBytes$1(secretKey);
      let [ctb64, ivb64] = data.split("?iv=");
      let key = secp256k1.getSharedSecret(privkey, hexToBytes$1("02" + pubkey));
      let normalizedKey = getNormalizedX(key);
      let iv = base64.decode(ivb64);
      let ciphertext = base64.decode(ctb64);
      let plaintext = cbc(normalizedKey, iv).decrypt(ciphertext);
      return utf8Decoder.decode(plaintext);
    }
    function getNormalizedX(key) {
      return key.slice(1, 33);
    }

    // nip05.ts
    var nip05_exports = {};
    __export(nip05_exports, {
      NIP05_REGEX: () => NIP05_REGEX,
      isNip05: () => isNip05,
      isValid: () => isValid,
      queryProfile: () => queryProfile,
      searchDomain: () => searchDomain,
      useFetchImplementation: () => useFetchImplementation
    });
    var NIP05_REGEX = /^(?:([\w.+-]+)@)?([\w_-]+(\.[\w_-]+)+)$/;
    var isNip05 = (value) => NIP05_REGEX.test(value || "");
    var _fetch;
    try {
      _fetch = fetch;
    } catch (_) {
    }
    function useFetchImplementation(fetchImplementation) {
      _fetch = fetchImplementation;
    }
    async function searchDomain(domain, query = "") {
      try {
        const url = `https://${domain}/.well-known/nostr.json?name=${query}`;
        const res = await _fetch(url, { redirect: "manual" });
        if (res.status !== 200) {
          throw Error("Wrong response code");
        }
        const json = await res.json();
        return json.names;
      } catch (_) {
        return {};
      }
    }
    async function queryProfile(fullname) {
      const match = fullname.match(NIP05_REGEX);
      if (!match)
        return null;
      const [, name = "_", domain] = match;
      try {
        const url = `https://${domain}/.well-known/nostr.json?name=${name}`;
        const res = await _fetch(url, { redirect: "manual" });
        if (res.status !== 200) {
          throw Error("Wrong response code");
        }
        const json = await res.json();
        const pubkey = json.names[name];
        return pubkey ? { pubkey, relays: json.relays?.[pubkey] } : null;
      } catch (_e) {
        return null;
      }
    }
    async function isValid(pubkey, nip05) {
      const res = await queryProfile(nip05);
      return res ? res.pubkey === pubkey : false;
    }

    // nip10.ts
    var nip10_exports = {};
    __export(nip10_exports, {
      parse: () => parse
    });
    var HEX64 = /^[0-9a-fA-F]{64}$/;
    function parse(event) {
      const result = {
        reply: void 0,
        root: void 0,
        mentions: [],
        profiles: [],
        quotes: []
      };
      let maybeParent;
      let maybeRoot;
      for (let i2 = event.tags.length - 1; i2 >= 0; i2--) {
        const tag = event.tags[i2];
        if (tag[0] === "e" && tag[1] && HEX64.test(tag[1])) {
          const [_, eTagEventId, eTagRelayUrl, eTagMarker, eTagAuthor] = tag;
          const eventPointer = {
            id: eTagEventId,
            relays: eTagRelayUrl ? [eTagRelayUrl] : [],
            author: eTagAuthor && HEX64.test(eTagAuthor) ? eTagAuthor : void 0
          };
          if (eTagMarker === "root") {
            result.root = eventPointer;
            continue;
          }
          if (eTagMarker === "reply") {
            result.reply = eventPointer;
            continue;
          }
          if (eTagMarker === "mention") {
            result.mentions.push(eventPointer);
            continue;
          }
          if (!maybeParent) {
            maybeParent = eventPointer;
          } else {
            maybeRoot = eventPointer;
          }
          result.mentions.push(eventPointer);
          continue;
        }
        if (tag[0] === "q" && tag[1] && HEX64.test(tag[1])) {
          const [_, eTagEventId, eTagRelayUrl] = tag;
          result.quotes.push({
            id: eTagEventId,
            relays: eTagRelayUrl ? [eTagRelayUrl] : []
          });
        }
        if (tag[0] === "p" && tag[1] && HEX64.test(tag[1])) {
          result.profiles.push({
            pubkey: tag[1],
            relays: tag[2] ? [tag[2]] : []
          });
          continue;
        }
      }
      if (!result.root) {
        result.root = maybeRoot || maybeParent || result.reply;
      }
      if (!result.reply) {
        result.reply = maybeParent || result.root;
      }
      [result.reply, result.root].forEach((ref) => {
        if (!ref)
          return;
        let idx = result.mentions.indexOf(ref);
        if (idx !== -1) {
          result.mentions.splice(idx, 1);
        }
        if (ref.author) {
          let author = result.profiles.find((p) => p.pubkey === ref.author);
          if (author && author.relays) {
            if (!ref.relays) {
              ref.relays = [];
            }
            author.relays.forEach((url) => {
              if (ref.relays?.indexOf(url) === -1)
                ref.relays.push(url);
            });
            author.relays = ref.relays;
          }
        }
      });
      result.mentions.forEach((ref) => {
        if (ref.author) {
          let author = result.profiles.find((p) => p.pubkey === ref.author);
          if (author && author.relays) {
            if (!ref.relays) {
              ref.relays = [];
            }
            author.relays.forEach((url) => {
              if (ref.relays.indexOf(url) === -1)
                ref.relays.push(url);
            });
            author.relays = ref.relays;
          }
        }
      });
      return result;
    }

    // nip11.ts
    var nip11_exports = {};
    __export(nip11_exports, {
      fetchRelayInformation: () => fetchRelayInformation,
      useFetchImplementation: () => useFetchImplementation2
    });
    var _fetch2;
    try {
      _fetch2 = fetch;
    } catch {
    }
    function useFetchImplementation2(fetchImplementation) {
      _fetch2 = fetchImplementation;
    }
    async function fetchRelayInformation(url) {
      return await (await fetch(url.replace("ws://", "http://").replace("wss://", "https://"), {
        headers: { Accept: "application/nostr+json" }
      })).json();
    }

    // nip13.ts
    var nip13_exports = {};
    __export(nip13_exports, {
      getPow: () => getPow,
      minePow: () => minePow
    });
    function getPow(hex) {
      let count = 0;
      for (let i2 = 0; i2 < 64; i2 += 8) {
        const nibble = parseInt(hex.substring(i2, i2 + 8), 16);
        if (nibble === 0) {
          count += 32;
        } else {
          count += Math.clz32(nibble);
          break;
        }
      }
      return count;
    }
    function getPowFromBytes(hash) {
      let count = 0;
      for (let i2 = 0; i2 < hash.length; i2++) {
        const byte = hash[i2];
        if (byte === 0) {
          count += 8;
        } else {
          count += Math.clz32(byte) - 24;
          break;
        }
      }
      return count;
    }
    function minePow(unsigned, difficulty) {
      let count = 0;
      const event = unsigned;
      const tag = ["nonce", count.toString(), difficulty.toString()];
      event.tags.push(tag);
      while (true) {
        const now2 = Math.floor(new Date().getTime() / 1e3);
        if (now2 !== event.created_at) {
          count = 0;
          event.created_at = now2;
        }
        tag[1] = (++count).toString();
        const hash = sha256(
          utf8Encoder.encode(JSON.stringify([0, event.pubkey, event.created_at, event.kind, event.tags, event.content]))
        );
        if (getPowFromBytes(hash) >= difficulty) {
          event.id = bytesToHex(hash);
          break;
        }
      }
      return event;
    }

    // nip17.ts
    var nip17_exports = {};
    __export(nip17_exports, {
      unwrapEvent: () => unwrapEvent2,
      unwrapManyEvents: () => unwrapManyEvents2,
      wrapEvent: () => wrapEvent2,
      wrapManyEvents: () => wrapManyEvents2
    });

    // nip59.ts
    var nip59_exports = {};
    __export(nip59_exports, {
      createRumor: () => createRumor,
      createSeal: () => createSeal,
      createWrap: () => createWrap,
      unwrapEvent: () => unwrapEvent,
      unwrapManyEvents: () => unwrapManyEvents,
      wrapEvent: () => wrapEvent,
      wrapManyEvents: () => wrapManyEvents
    });

    // nip44.ts
    var nip44_exports = {};
    __export(nip44_exports, {
      decrypt: () => decrypt2,
      encrypt: () => encrypt2,
      getConversationKey: () => getConversationKey,
      v2: () => v2
    });
    var minPlaintextSize = 1;
    var maxPlaintextSize = 4294967295;
    var extendedPrefixThreshold = 65536;
    function getConversationKey(privkeyA, pubkeyB) {
      const sharedX = secp256k1.getSharedSecret(privkeyA, hexToBytes$1("02" + pubkeyB)).subarray(1, 33);
      return extract(sha256, sharedX, utf8Encoder.encode("nip44-v2"));
    }
    function getMessageKeys(conversationKey, nonce) {
      const keys = expand(sha256, conversationKey, nonce, 76);
      return {
        chacha_key: keys.subarray(0, 32),
        chacha_nonce: keys.subarray(32, 44),
        hmac_key: keys.subarray(44, 76)
      };
    }
    function calcPaddedLen(len) {
      if (!Number.isSafeInteger(len) || len < 1)
        throw new Error("expected positive integer");
      if (len <= 32)
        return 32;
      const nextPower = 2 ** (Math.floor(Math.log2(len - 1)) + 1);
      const chunk = nextPower <= 256 ? 32 : nextPower / 8;
      return chunk * (Math.floor((len - 1) / chunk) + 1);
    }
    function writeU16BE(num) {
      if (!Number.isSafeInteger(num) || num < minPlaintextSize || num > 65535)
        throw new Error("invalid plaintext size: must be between 1 and 65535 bytes");
      const arr = new Uint8Array(2);
      new DataView(arr.buffer).setUint16(0, num, false);
      return arr;
    }
    function writeU32BE(num) {
      if (!Number.isSafeInteger(num) || num < extendedPrefixThreshold || num > maxPlaintextSize)
        throw new Error("invalid plaintext size: must be between 65536 and 4294967295 bytes");
      const arr = new Uint8Array(4);
      new DataView(arr.buffer).setUint32(0, num, false);
      return arr;
    }
    function pad(plaintext) {
      const unpadded = utf8Encoder.encode(plaintext);
      const unpaddedLen = unpadded.length;
      if (unpaddedLen < minPlaintextSize || unpaddedLen > maxPlaintextSize)
        throw new Error("invalid plaintext size: must be between 1 and 4294967295 bytes");
      const prefix = unpaddedLen >= extendedPrefixThreshold ? concatBytes(new Uint8Array([0, 0]), writeU32BE(unpaddedLen)) : writeU16BE(unpaddedLen);
      const suffix = new Uint8Array(calcPaddedLen(unpaddedLen) - unpaddedLen);
      return concatBytes(prefix, unpadded, suffix);
    }
    function unpad(padded) {
      const dv = new DataView(padded.buffer, padded.byteOffset, padded.byteLength);
      const firstTwo = dv.getUint16(0);
      let unpaddedLen;
      let prefixLen;
      if (firstTwo === 0) {
        unpaddedLen = dv.getUint32(2);
        if (unpaddedLen < extendedPrefixThreshold)
          throw new Error("invalid padding");
        prefixLen = 6;
      } else {
        unpaddedLen = firstTwo;
        prefixLen = 2;
      }
      const unpadded = padded.subarray(prefixLen, prefixLen + unpaddedLen);
      if (unpaddedLen < minPlaintextSize || unpaddedLen > maxPlaintextSize || unpadded.length !== unpaddedLen || padded.length !== prefixLen + calcPaddedLen(unpaddedLen))
        throw new Error("invalid padding");
      return utf8Decoder.decode(unpadded);
    }
    function hmacAad(key, message, aad) {
      if (aad.length !== 32)
        throw new Error("AAD associated data must be 32 bytes");
      const combined = concatBytes(aad, message);
      return hmac(sha256, key, combined);
    }
    function decodePayload(payload) {
      if (typeof payload !== "string")
        throw new Error("payload must be a valid string");
      const plen = payload.length;
      if (plen < 132)
        throw new Error("invalid payload length: " + plen);
      if (payload[0] === "#")
        throw new Error("unknown encryption version");
      let data;
      try {
        data = base64.decode(payload);
      } catch (error) {
        throw new Error("invalid base64: " + error.message);
      }
      const dlen = data.length;
      if (dlen < 99)
        throw new Error("invalid data length: " + dlen);
      const vers = data[0];
      if (vers !== 2)
        throw new Error("unknown encryption version " + vers);
      return {
        nonce: data.subarray(1, 33),
        ciphertext: data.subarray(33, -32),
        mac: data.subarray(-32)
      };
    }
    function encrypt2(plaintext, conversationKey, nonce = randomBytes(32)) {
      const { chacha_key, chacha_nonce, hmac_key } = getMessageKeys(conversationKey, nonce);
      const padded = pad(plaintext);
      const ciphertext = chacha20(chacha_key, chacha_nonce, padded);
      const mac = hmacAad(hmac_key, ciphertext, nonce);
      return base64.encode(concatBytes(new Uint8Array([2]), nonce, ciphertext, mac));
    }
    function decrypt2(payload, conversationKey) {
      const { nonce, ciphertext, mac } = decodePayload(payload);
      const { chacha_key, chacha_nonce, hmac_key } = getMessageKeys(conversationKey, nonce);
      const calculatedMac = hmacAad(hmac_key, ciphertext, nonce);
      if (!equalBytes(calculatedMac, mac))
        throw new Error("invalid MAC");
      const padded = chacha20(chacha_key, chacha_nonce, ciphertext);
      return unpad(padded);
    }
    var v2 = {
      utils: {
        getConversationKey,
        calcPaddedLen,
        pad,
        unpad
      },
      encrypt: encrypt2,
      decrypt: decrypt2
    };

    // nip59.ts
    var TWO_DAYS = 2 * 24 * 60 * 60;
    var now = () => Math.round(Date.now() / 1e3);
    var randomNow = () => Math.round(now() - Math.random() * TWO_DAYS);
    var nip44ConversationKey = (privateKey, publicKey) => getConversationKey(privateKey, publicKey);
    var nip44Encrypt = (data, privateKey, publicKey) => encrypt2(JSON.stringify(data), nip44ConversationKey(privateKey, publicKey));
    var nip44Decrypt = (data, privateKey) => JSON.parse(decrypt2(data.content, nip44ConversationKey(privateKey, data.pubkey)));
    function createRumor(event, privateKey) {
      const rumor = {
        created_at: now(),
        content: "",
        tags: [],
        ...event,
        pubkey: getPublicKey(privateKey)
      };
      rumor.id = getEventHash(rumor);
      return rumor;
    }
    function createSeal(rumor, privateKey, recipientPublicKey) {
      return finalizeEvent(
        {
          kind: Seal,
          content: nip44Encrypt(rumor, privateKey, recipientPublicKey),
          created_at: randomNow(),
          tags: []
        },
        privateKey
      );
    }
    function createWrap(seal, recipientPublicKey) {
      const randomKey = generateSecretKey();
      return finalizeEvent(
        {
          kind: GiftWrap,
          content: nip44Encrypt(seal, randomKey, recipientPublicKey),
          created_at: randomNow(),
          tags: [["p", recipientPublicKey]]
        },
        randomKey
      );
    }
    function wrapEvent(event, senderPrivateKey, recipientPublicKey) {
      const rumor = createRumor(event, senderPrivateKey);
      const seal = createSeal(rumor, senderPrivateKey, recipientPublicKey);
      return createWrap(seal, recipientPublicKey);
    }
    function wrapManyEvents(event, senderPrivateKey, recipientsPublicKeys) {
      if (!recipientsPublicKeys || recipientsPublicKeys.length === 0) {
        throw new Error("At least one recipient is required.");
      }
      const senderPublicKey = getPublicKey(senderPrivateKey);
      const wrappeds = [wrapEvent(event, senderPrivateKey, senderPublicKey)];
      recipientsPublicKeys.forEach((recipientPublicKey) => {
        wrappeds.push(wrapEvent(event, senderPrivateKey, recipientPublicKey));
      });
      return wrappeds;
    }
    function unwrapEvent(wrap, recipientPrivateKey) {
      const unwrappedSeal = nip44Decrypt(wrap, recipientPrivateKey);
      return nip44Decrypt(unwrappedSeal, recipientPrivateKey);
    }
    function unwrapManyEvents(wrappedEvents, recipientPrivateKey) {
      let unwrappedEvents = [];
      wrappedEvents.forEach((e) => {
        unwrappedEvents.push(unwrapEvent(e, recipientPrivateKey));
      });
      unwrappedEvents.sort((a, b) => a.created_at - b.created_at);
      return unwrappedEvents;
    }

    // nip17.ts
    function createEvent(recipients, message, conversationTitle, replyTo) {
      const baseEvent = {
        created_at: Math.ceil(Date.now() / 1e3),
        kind: PrivateDirectMessage,
        tags: [],
        content: message
      };
      const recipientsArray = Array.isArray(recipients) ? recipients : [recipients];
      recipientsArray.forEach(({ publicKey, relayUrl }) => {
        baseEvent.tags.push(relayUrl ? ["p", publicKey, relayUrl] : ["p", publicKey]);
      });
      if (replyTo) {
        baseEvent.tags.push(["e", replyTo.eventId, replyTo.relayUrl || "", "reply"]);
      }
      if (conversationTitle) {
        baseEvent.tags.push(["subject", conversationTitle]);
      }
      return baseEvent;
    }
    function wrapEvent2(senderPrivateKey, recipient, message, conversationTitle, replyTo) {
      const event = createEvent(recipient, message, conversationTitle, replyTo);
      return wrapEvent(event, senderPrivateKey, recipient.publicKey);
    }
    function wrapManyEvents2(senderPrivateKey, recipients, message, conversationTitle, replyTo) {
      if (!recipients || recipients.length === 0) {
        throw new Error("At least one recipient is required.");
      }
      const senderPublicKey = getPublicKey(senderPrivateKey);
      return [{ publicKey: senderPublicKey }, ...recipients].map(
        (recipient) => wrapEvent2(senderPrivateKey, recipient, message, conversationTitle, replyTo)
      );
    }
    var unwrapEvent2 = unwrapEvent;
    var unwrapManyEvents2 = unwrapManyEvents;

    // nip18.ts
    var nip18_exports = {};
    __export(nip18_exports, {
      finishRepostEvent: () => finishRepostEvent,
      getRepostedEvent: () => getRepostedEvent,
      getRepostedEventPointer: () => getRepostedEventPointer
    });
    function finishRepostEvent(t, reposted, relayUrl, privateKey) {
      let kind;
      const tags = [...t.tags ?? [], ["e", reposted.id, relayUrl], ["p", reposted.pubkey]];
      if (reposted.kind === ShortTextNote) {
        kind = Repost;
      } else {
        kind = GenericRepost;
        tags.push(["k", String(reposted.kind)]);
      }
      return finalizeEvent(
        {
          kind,
          tags,
          content: t.content === "" || reposted.tags?.find((tag) => tag[0] === "-") ? "" : JSON.stringify(reposted),
          created_at: t.created_at
        },
        privateKey
      );
    }
    function getRepostedEventPointer(event) {
      if (![Repost, GenericRepost].includes(event.kind)) {
        return void 0;
      }
      let lastETag;
      let lastPTag;
      for (let i2 = event.tags.length - 1; i2 >= 0 && (lastETag === void 0 || lastPTag === void 0); i2--) {
        const tag = event.tags[i2];
        if (tag.length >= 2) {
          if (tag[0] === "e" && lastETag === void 0) {
            lastETag = tag;
          } else if (tag[0] === "p" && lastPTag === void 0) {
            lastPTag = tag;
          }
        }
      }
      if (lastETag === void 0) {
        return void 0;
      }
      return {
        id: lastETag[1],
        relays: [lastETag[2], lastPTag?.[2]].filter((x) => typeof x === "string"),
        author: lastPTag?.[1]
      };
    }
    function getRepostedEvent(event, { skipVerification } = {}) {
      const pointer = getRepostedEventPointer(event);
      if (pointer === void 0 || event.content === "") {
        return void 0;
      }
      let repostedEvent;
      try {
        repostedEvent = JSON.parse(event.content);
      } catch (error) {
        return void 0;
      }
      if (repostedEvent.id !== pointer.id) {
        return void 0;
      }
      if (!skipVerification && !verifyEvent(repostedEvent)) {
        return void 0;
      }
      return repostedEvent;
    }

    // nip21.ts
    var nip21_exports = {};
    __export(nip21_exports, {
      NOSTR_URI_REGEX: () => NOSTR_URI_REGEX,
      parse: () => parse2,
      test: () => test
    });
    var NOSTR_URI_REGEX = new RegExp(`nostr:(${BECH32_REGEX.source})`);
    function test(value) {
      return typeof value === "string" && new RegExp(`^${NOSTR_URI_REGEX.source}$`).test(value);
    }
    function parse2(uri) {
      const match = uri.match(new RegExp(`^${NOSTR_URI_REGEX.source}$`));
      if (!match)
        throw new Error(`Invalid Nostr URI: ${uri}`);
      return {
        uri: match[0],
        value: match[1],
        decoded: decode(match[1])
      };
    }

    // nip22.ts
    var nip22_exports = {};
    __export(nip22_exports, {
      parse: () => parse3
    });
    var HEX642 = /^[0-9a-fA-F]{64}$/;
    function parseKind(kind) {
      if (!kind)
        return void 0;
      return /^\d+$/.test(kind) ? parseInt(kind, 10) : kind;
    }
    function parseAddressPointer(value, relayUrl) {
      const idx = value.indexOf(":");
      const idx2 = value.indexOf(":", idx + 1);
      if (idx === -1 || idx2 === -1)
        return void 0;
      const kind = parseInt(value.slice(0, idx), 10);
      if (Number.isNaN(kind))
        return void 0;
      const pubkey = value.slice(idx + 1, idx2);
      if (!HEX642.test(pubkey))
        return void 0;
      return {
        kind,
        pubkey,
        identifier: value.slice(idx2 + 1),
        relays: relayUrl ? [relayUrl] : []
      };
    }
    function parsePointer(tag) {
      switch (tag[0]) {
        case "E":
        case "e":
          if (!tag[1] || !HEX642.test(tag[1]))
            return void 0;
          return {
            id: tag[1],
            relays: tag[2] ? [tag[2]] : [],
            author: tag[3] && HEX642.test(tag[3]) ? tag[3] : void 0
          };
        case "A":
        case "a":
          if (!tag[1])
            return void 0;
          return parseAddressPointer(tag[1], tag[2]);
        case "I":
        case "i":
          if (!tag[1])
            return void 0;
          return {
            value: tag[1],
            hint: tag[2]
          };
      }
    }
    function parseQuote(tag) {
      if (!tag[1])
        return void 0;
      if (tag[1].includes(":")) {
        return parseAddressPointer(tag[1], tag[2]);
      }
      if (!HEX642.test(tag[1]))
        return void 0;
      return {
        id: tag[1],
        relays: tag[2] ? [tag[2]] : [],
        author: tag[3] && HEX642.test(tag[3]) ? tag[3] : void 0
      };
    }
    function choosePointer(candidates) {
      return candidates.findLast((candidate) => candidate.tagName === "A" || candidate.tagName === "a")?.pointer || candidates.findLast((candidate) => candidate.tagName === "I" || candidate.tagName === "i")?.pointer || candidates.findLast((candidate) => candidate.tagName === "E" || candidate.tagName === "e")?.pointer;
    }
    function inheritRelayHints(pointer, profiles) {
      if (!pointer || !("id" in pointer) || !pointer.author)
        return;
      const author = profiles.find((profile) => profile.pubkey === pointer.author);
      if (!author || !author.relays)
        return;
      if (!pointer.relays) {
        pointer.relays = [];
      }
      author.relays.forEach((url) => {
        if (pointer.relays.indexOf(url) === -1)
          pointer.relays.push(url);
      });
      author.relays = pointer.relays;
    }
    function parse3(event) {
      const result = {
        root: void 0,
        rootKind: void 0,
        reply: void 0,
        replyKind: void 0,
        mentions: [],
        quotes: [],
        profiles: []
      };
      const rootCandidates = [];
      const replyCandidates = [];
      for (const tag of event.tags) {
        if ((tag[0] === "E" || tag[0] === "A" || tag[0] === "I") && tag[1]) {
          const pointer = parsePointer(tag);
          if (pointer)
            rootCandidates.push({ tagName: tag[0], pointer });
          continue;
        }
        if ((tag[0] === "e" || tag[0] === "a" || tag[0] === "i") && tag[1]) {
          const pointer = parsePointer(tag);
          if (pointer)
            replyCandidates.push({ tagName: tag[0], pointer });
          continue;
        }
        if (tag[0] === "K") {
          result.rootKind = parseKind(tag[1]);
          continue;
        }
        if (tag[0] === "k") {
          result.replyKind = parseKind(tag[1]);
          continue;
        }
        if (tag[0] === "q") {
          const pointer = parseQuote(tag);
          if (pointer)
            result.quotes.push(pointer);
          continue;
        }
        if ((tag[0] === "P" || tag[0] === "p") && tag[1] && HEX642.test(tag[1])) {
          result.profiles.push({
            pubkey: tag[1],
            relays: tag[2] ? [tag[2]] : []
          });
        }
      }
      result.root = choosePointer(rootCandidates);
      result.reply = choosePointer(replyCandidates);
      inheritRelayHints(result.root, result.profiles);
      inheritRelayHints(result.reply, result.profiles);
      result.quotes.forEach((pointer) => inheritRelayHints(pointer, result.profiles));
      return result;
    }

    // nip25.ts
    var nip25_exports = {};
    __export(nip25_exports, {
      finishReactionEvent: () => finishReactionEvent,
      getReactedEventPointer: () => getReactedEventPointer
    });
    function finishReactionEvent(t, reacted, privateKey) {
      const inheritedTags = reacted.tags.filter((tag) => tag.length >= 2 && (tag[0] === "e" || tag[0] === "p"));
      return finalizeEvent(
        {
          ...t,
          kind: Reaction,
          tags: [...t.tags ?? [], ...inheritedTags, ["e", reacted.id], ["p", reacted.pubkey]],
          content: t.content ?? "+"
        },
        privateKey
      );
    }
    function getReactedEventPointer(event) {
      if (event.kind !== Reaction) {
        return void 0;
      }
      let lastETag;
      let lastPTag;
      for (let i2 = event.tags.length - 1; i2 >= 0 && (lastETag === void 0 || lastPTag === void 0); i2--) {
        const tag = event.tags[i2];
        if (tag.length >= 2) {
          if (tag[0] === "e" && lastETag === void 0) {
            lastETag = tag;
          } else if (tag[0] === "p" && lastPTag === void 0) {
            lastPTag = tag;
          }
        }
      }
      if (lastETag === void 0 || lastPTag === void 0) {
        return void 0;
      }
      return {
        id: lastETag[1],
        relays: [lastETag[2], lastPTag[2]].filter((x) => x !== void 0),
        author: lastPTag[1]
      };
    }

    // nip27.ts
    var nip27_exports = {};
    __export(nip27_exports, {
      parse: () => parse4
    });
    var noCharacter = /\W/m;
    var noURLCharacter = /[^\w\/] |[^\w\/]$|$|,| /m;
    var MAX_HASHTAG_LENGTH = 42;
    function* parse4(content) {
      let emojis = [];
      if (typeof content !== "string") {
        for (let i2 = 0; i2 < content.tags.length; i2++) {
          const tag = content.tags[i2];
          if (tag[0] === "emoji" && tag.length >= 3) {
            emojis.push({ type: "emoji", shortcode: tag[1], url: tag[2] });
          }
        }
        content = content.content;
      }
      const max = content.length;
      let prevIndex = 0;
      let index = 0;
      mainloop:
        while (index < max) {
          const u = content.indexOf(":", index);
          const h = content.indexOf("#", index);
          if (u === -1 && h === -1) {
            break mainloop;
          }
          if (u === -1 || h >= 0 && h < u) {
            if (h === 0 || content[h - 1].match(noCharacter)) {
              const m = content.slice(h + 1, h + MAX_HASHTAG_LENGTH).match(noCharacter);
              const end = m ? h + 1 + m.index : max;
              yield { type: "text", text: content.slice(prevIndex, h) };
              yield { type: "hashtag", value: content.slice(h + 1, end) };
              index = end;
              prevIndex = index;
              continue mainloop;
            }
            index = h + 1;
            continue mainloop;
          }
          if (content.slice(u - 5, u) === "nostr") {
            const m = content.slice(u + 60).match(noCharacter);
            const end = m ? u + 60 + m.index : max;
            try {
              let pointer;
              let { data, type } = decode(content.slice(u + 1, end));
              switch (type) {
                case "npub":
                  pointer = { pubkey: data };
                  break;
                case "note":
                  pointer = { id: data };
                  break;
                case "nsec":
                  index = end + 1;
                  continue;
                default:
                  pointer = data;
              }
              if (prevIndex !== u - 5) {
                yield { type: "text", text: content.slice(prevIndex, u - 5) };
              }
              yield { type: "reference", pointer };
              index = end;
              prevIndex = index;
              continue mainloop;
            } catch (_err) {
              index = u + 1;
              continue mainloop;
            }
          } else if (content.slice(u - 5, u) === "https" || content.slice(u - 4, u) === "http") {
            const m = content.slice(u + 4).match(noURLCharacter);
            const end = m ? u + 4 + m.index : max;
            const prefixLen = content[u - 1] === "s" ? 5 : 4;
            try {
              let url = new URL(content.slice(u - prefixLen, end));
              if (url.hostname.indexOf(".") === -1) {
                throw new Error("invalid url");
              }
              if (prevIndex !== u - prefixLen) {
                yield { type: "text", text: content.slice(prevIndex, u - prefixLen) };
              }
              if (/\.(png|jpe?g|gif|webp|heic|svg)$/i.test(url.pathname)) {
                yield { type: "image", url: url.toString() };
                index = end;
                prevIndex = index;
                continue mainloop;
              }
              if (/\.(mp4|avi|webm|mkv|mov)$/i.test(url.pathname)) {
                yield { type: "video", url: url.toString() };
                index = end;
                prevIndex = index;
                continue mainloop;
              }
              if (/\.(mp3|aac|ogg|opus|wav|flac)$/i.test(url.pathname)) {
                yield { type: "audio", url: url.toString() };
                index = end;
                prevIndex = index;
                continue mainloop;
              }
              yield { type: "url", url: url.toString() };
              index = end;
              prevIndex = index;
              continue mainloop;
            } catch (_err) {
              index = end + 1;
              continue mainloop;
            }
          } else if (content.slice(u - 3, u) === "wss" || content.slice(u - 2, u) === "ws") {
            const m = content.slice(u + 4).match(noURLCharacter);
            const end = m ? u + 4 + m.index : max;
            const prefixLen = content[u - 1] === "s" ? 3 : 2;
            try {
              let url = new URL(content.slice(u - prefixLen, end));
              if (url.hostname.indexOf(".") === -1) {
                throw new Error("invalid ws url");
              }
              if (prevIndex !== u - prefixLen) {
                yield { type: "text", text: content.slice(prevIndex, u - prefixLen) };
              }
              yield { type: "relay", url: url.toString() };
              index = end;
              prevIndex = index;
              continue mainloop;
            } catch (_err) {
              index = end + 1;
              continue mainloop;
            }
          } else {
            for (let e = 0; e < emojis.length; e++) {
              const emoji = emojis[e];
              if (content[u + emoji.shortcode.length + 1] === ":" && content.slice(u + 1, u + emoji.shortcode.length + 1) === emoji.shortcode) {
                if (prevIndex !== u) {
                  yield { type: "text", text: content.slice(prevIndex, u) };
                }
                yield emoji;
                index = u + emoji.shortcode.length + 2;
                prevIndex = index;
                continue mainloop;
              }
            }
            index = u + 1;
            continue mainloop;
          }
        }
      if (prevIndex !== max) {
        yield { type: "text", text: content.slice(prevIndex) };
      }
    }

    // nip28.ts
    var nip28_exports = {};
    __export(nip28_exports, {
      channelCreateEvent: () => channelCreateEvent,
      channelHideMessageEvent: () => channelHideMessageEvent,
      channelMessageEvent: () => channelMessageEvent,
      channelMetadataEvent: () => channelMetadataEvent,
      channelMuteUserEvent: () => channelMuteUserEvent
    });
    var channelCreateEvent = (t, privateKey) => {
      let content;
      if (typeof t.content === "object") {
        content = JSON.stringify(t.content);
      } else if (typeof t.content === "string") {
        content = t.content;
      } else {
        return void 0;
      }
      return finalizeEvent(
        {
          kind: ChannelCreation,
          tags: [...t.tags ?? []],
          content,
          created_at: t.created_at
        },
        privateKey
      );
    };
    var channelMetadataEvent = (t, privateKey) => {
      let content;
      if (typeof t.content === "object") {
        content = JSON.stringify(t.content);
      } else if (typeof t.content === "string") {
        content = t.content;
      } else {
        return void 0;
      }
      return finalizeEvent(
        {
          kind: ChannelMetadata,
          tags: [["e", t.channel_create_event_id], ...t.tags ?? []],
          content,
          created_at: t.created_at
        },
        privateKey
      );
    };
    var channelMessageEvent = (t, privateKey) => {
      const tags = [["e", t.channel_create_event_id, t.relay_url, "root"]];
      if (t.reply_to_channel_message_event_id) {
        tags.push(["e", t.reply_to_channel_message_event_id, t.relay_url, "reply"]);
      }
      return finalizeEvent(
        {
          kind: ChannelMessage,
          tags: [...tags, ...t.tags ?? []],
          content: t.content,
          created_at: t.created_at
        },
        privateKey
      );
    };
    var channelHideMessageEvent = (t, privateKey) => {
      let content;
      if (typeof t.content === "object") {
        content = JSON.stringify(t.content);
      } else if (typeof t.content === "string") {
        content = t.content;
      } else {
        return void 0;
      }
      return finalizeEvent(
        {
          kind: ChannelHideMessage,
          tags: [["e", t.channel_message_event_id], ...t.tags ?? []],
          content,
          created_at: t.created_at
        },
        privateKey
      );
    };
    var channelMuteUserEvent = (t, privateKey) => {
      let content;
      if (typeof t.content === "object") {
        content = JSON.stringify(t.content);
      } else if (typeof t.content === "string") {
        content = t.content;
      } else {
        return void 0;
      }
      return finalizeEvent(
        {
          kind: ChannelMuteUser,
          tags: [["p", t.pubkey_to_mute], ...t.tags ?? []],
          content,
          created_at: t.created_at
        },
        privateKey
      );
    };

    // nip30.ts
    var nip30_exports = {};
    __export(nip30_exports, {
      EMOJI_SHORTCODE_REGEX: () => EMOJI_SHORTCODE_REGEX,
      matchAll: () => matchAll,
      regex: () => regex$1,
      replaceAll: () => replaceAll
    });
    var EMOJI_SHORTCODE_REGEX = /:(\w+):/;
    var regex$1 = () => new RegExp(`\\B${EMOJI_SHORTCODE_REGEX.source}\\B`, "g");
    function* matchAll(content) {
      const matches = content.matchAll(regex$1());
      for (const match of matches) {
        try {
          const [shortcode, name] = match;
          yield {
            shortcode,
            name,
            start: match.index,
            end: match.index + shortcode.length
          };
        } catch (_e) {
        }
      }
    }
    function replaceAll(content, replacer) {
      return content.replaceAll(regex$1(), (shortcode, name) => {
        return replacer({
          shortcode,
          name
        });
      });
    }

    // nip39.ts
    var nip39_exports = {};
    __export(nip39_exports, {
      useFetchImplementation: () => useFetchImplementation3,
      validateGithub: () => validateGithub
    });
    var _fetch3;
    try {
      _fetch3 = fetch;
    } catch {
    }
    function useFetchImplementation3(fetchImplementation) {
      _fetch3 = fetchImplementation;
    }
    async function validateGithub(pubkey, username, proof) {
      try {
        let res = await (await _fetch3(`https://gist.github.com/${username}/${proof}/raw`)).text();
        return res === `Verifying that I control the following Nostr public key: ${pubkey}`;
      } catch (_) {
        return false;
      }
    }

    // nip47.ts
    var nip47_exports = {};
    __export(nip47_exports, {
      makeNwcRequestEvent: () => makeNwcRequestEvent,
      parseConnectionString: () => parseConnectionString
    });
    function parseConnectionString(connectionString) {
      const { host, pathname, searchParams } = new URL(connectionString);
      const pubkey = pathname || host;
      const relays = searchParams.getAll("relay");
      const secret = searchParams.get("secret");
      if (!pubkey || relays.length === 0 || !secret) {
        throw new Error("invalid connection string");
      }
      return { pubkey, relay: relays[0], relays, secret };
    }
    async function makeNwcRequestEvent(pubkey, secretKey, invoice) {
      const content = {
        method: "pay_invoice",
        params: {
          invoice
        }
      };
      const encryptedContent = encrypt(secretKey, pubkey, JSON.stringify(content));
      const eventTemplate = {
        kind: NWCWalletRequest,
        created_at: Math.round(Date.now() / 1e3),
        content: encryptedContent,
        tags: [["p", pubkey]]
      };
      return finalizeEvent(eventTemplate, secretKey);
    }

    // nip54.ts
    var nip54_exports = {};
    __export(nip54_exports, {
      normalizeIdentifier: () => normalizeIdentifier
    });
    function normalizeIdentifier(name) {
      name = name.trim().toLowerCase();
      name = name.normalize("NFKC");
      return Array.from(name).map((char) => {
        if (/\p{Letter}/u.test(char) || /\p{Number}/u.test(char)) {
          return char;
        }
        return "-";
      }).join("");
    }

    // nip57.ts
    var nip57_exports = {};
    __export(nip57_exports, {
      getSatoshisAmountFromBolt11: () => getSatoshisAmountFromBolt11,
      getZapEndpoint: () => getZapEndpoint,
      makeZapReceipt: () => makeZapReceipt,
      makeZapRequest: () => makeZapRequest,
      useFetchImplementation: () => useFetchImplementation4,
      validateZapRequest: () => validateZapRequest
    });
    var _fetch4;
    try {
      _fetch4 = fetch;
    } catch {
    }
    function useFetchImplementation4(fetchImplementation) {
      _fetch4 = fetchImplementation;
    }
    async function getZapEndpoint(metadata) {
      try {
        let lnurl = "";
        let { lud06, lud16 } = JSON.parse(metadata.content);
        if (lud16) {
          let [name, domain] = lud16.split("@");
          lnurl = new URL(`/.well-known/lnurlp/${name}`, `https://${domain}`).toString();
        } else if (lud06) {
          let { words } = bech32.decode(lud06, 1e3);
          let data = bech32.fromWords(words);
          lnurl = utf8Decoder.decode(data);
        } else {
          return null;
        }
        let res = await _fetch4(lnurl);
        let body = await res.json();
        if (body.allowsNostr && body.nostrPubkey) {
          return body.callback;
        }
      } catch (err) {
      }
      return null;
    }
    function makeZapRequest(params) {
      let zr = {
        kind: 9734,
        created_at: Math.round(Date.now() / 1e3),
        content: params.comment || "",
        tags: [
          ["p", "pubkey" in params ? params.pubkey : params.event.pubkey],
          ["amount", params.amount.toString()],
          ["relays", ...params.relays]
        ]
      };
      if ("event" in params) {
        zr.tags.push(["e", params.event.id]);
        if (isReplaceableKind(params.event.kind)) {
          const a = ["a", `${params.event.kind}:${params.event.pubkey}:`];
          zr.tags.push(a);
        } else if (isAddressableKind(params.event.kind)) {
          let d = params.event.tags.find(([t, v]) => t === "d" && v);
          if (!d)
            throw new Error("d tag not found or is empty");
          const a = ["a", `${params.event.kind}:${params.event.pubkey}:${d[1]}`];
          zr.tags.push(a);
        }
        zr.tags.push(["k", params.event.kind.toString()]);
      }
      return zr;
    }
    function validateZapRequest(zapRequestString) {
      let zapRequest;
      try {
        zapRequest = JSON.parse(zapRequestString);
      } catch (err) {
        return "Invalid zap request JSON.";
      }
      if (!validateEvent(zapRequest))
        return "Zap request is not a valid Nostr event.";
      if (!verifyEvent(zapRequest))
        return "Invalid signature on zap request.";
      let p = zapRequest.tags.find(([t, v]) => t === "p" && v);
      if (!p)
        return "Zap request doesn't have a 'p' tag.";
      if (!p[1].match(/^[a-f0-9]{64}$/))
        return "Zap request 'p' tag is not valid hex.";
      let e = zapRequest.tags.find(([t, v]) => t === "e" && v);
      if (e && !e[1].match(/^[a-f0-9]{64}$/))
        return "Zap request 'e' tag is not valid hex.";
      let relays = zapRequest.tags.find(([t, v]) => t === "relays" && v);
      if (!relays)
        return "Zap request doesn't have a 'relays' tag.";
      return null;
    }
    function makeZapReceipt({
      zapRequest,
      preimage,
      bolt11,
      paidAt
    }) {
      let zr = JSON.parse(zapRequest);
      let tagsFromZapRequest = zr.tags.filter(([t]) => t === "e" || t === "p" || t === "a");
      let zap = {
        kind: 9735,
        created_at: Math.round(paidAt.getTime() / 1e3),
        content: "",
        tags: [...tagsFromZapRequest, ["P", zr.pubkey], ["bolt11", bolt11], ["description", zapRequest]]
      };
      if (preimage) {
        zap.tags.push(["preimage", preimage]);
      }
      return zap;
    }
    function getSatoshisAmountFromBolt11(bolt11) {
      if (bolt11.length < 50) {
        return 0;
      }
      bolt11 = bolt11.substring(0, 50);
      const idx = bolt11.lastIndexOf("1");
      if (idx === -1) {
        return 0;
      }
      const hrp = bolt11.substring(0, idx);
      if (!hrp.startsWith("lnbc")) {
        return 0;
      }
      const amount = hrp.substring(4);
      if (amount.length < 1) {
        return 0;
      }
      const char = amount[amount.length - 1];
      const digit = char.charCodeAt(0) - "0".charCodeAt(0);
      const isDigit = digit >= 0 && digit <= 9;
      let cutPoint = amount.length - 1;
      if (isDigit) {
        cutPoint++;
      }
      if (cutPoint < 1) {
        return 0;
      }
      const num = parseInt(amount.substring(0, cutPoint));
      switch (char) {
        case "m":
          return num * 1e5;
        case "u":
          return num * 100;
        case "n":
          return num / 10;
        case "p":
          return num / 1e4;
        default:
          return num * 1e8;
      }
    }

    // nip77.ts
    var nip77_exports = {};
    __export(nip77_exports, {
      Negentropy: () => Negentropy,
      NegentropyStorageVector: () => NegentropyStorageVector,
      NegentropySync: () => NegentropySync
    });
    var PROTOCOL_VERSION = 97;
    var ID_SIZE = 32;
    var FINGERPRINT_SIZE = 16;
    var Mode = {
      Skip: 0,
      Fingerprint: 1,
      IdList: 2
    };
    var WrappedBuffer = class {
      _raw;
      length;
      constructor(buffer) {
        if (typeof buffer === "number") {
          this._raw = new Uint8Array(buffer);
          this.length = 0;
        } else if (buffer instanceof Uint8Array) {
          this._raw = new Uint8Array(buffer);
          this.length = buffer.length;
        } else {
          this._raw = new Uint8Array(512);
          this.length = 0;
        }
      }
      unwrap() {
        return this._raw.subarray(0, this.length);
      }
      get capacity() {
        return this._raw.byteLength;
      }
      extend(buf) {
        if (buf instanceof WrappedBuffer)
          buf = buf.unwrap();
        if (typeof buf.length !== "number")
          throw Error("bad length");
        const targetSize = buf.length + this.length;
        if (this.capacity < targetSize) {
          const oldRaw = this._raw;
          const newCapacity = Math.max(this.capacity * 2, targetSize);
          this._raw = new Uint8Array(newCapacity);
          this._raw.set(oldRaw);
        }
        this._raw.set(buf, this.length);
        this.length += buf.length;
      }
      shift() {
        const first = this._raw[0];
        this._raw = this._raw.subarray(1);
        this.length--;
        return first;
      }
      shiftN(n = 1) {
        const firstSubarray = this._raw.subarray(0, n);
        this._raw = this._raw.subarray(n);
        this.length -= n;
        return firstSubarray;
      }
    };
    function decodeVarInt(buf) {
      let res = 0;
      while (1) {
        if (buf.length === 0)
          throw Error("parse ends prematurely");
        let byte = buf.shift();
        res = res << 7 | byte & 127;
        if ((byte & 128) === 0)
          break;
      }
      return res;
    }
    function encodeVarInt(n) {
      if (n === 0)
        return new WrappedBuffer(new Uint8Array([0]));
      let o = [];
      while (n !== 0) {
        o.push(n & 127);
        n >>>= 7;
      }
      o.reverse();
      for (let i2 = 0; i2 < o.length - 1; i2++)
        o[i2] |= 128;
      return new WrappedBuffer(new Uint8Array(o));
    }
    function getByte(buf) {
      return getBytes(buf, 1)[0];
    }
    function getBytes(buf, n) {
      if (buf.length < n)
        throw Error("parse ends prematurely");
      return buf.shiftN(n);
    }
    var Accumulator = class {
      buf;
      constructor() {
        this.setToZero();
      }
      setToZero() {
        this.buf = new Uint8Array(ID_SIZE);
      }
      add(otherBuf) {
        let currCarry = 0, nextCarry = 0;
        let p = new DataView(this.buf.buffer);
        let po = new DataView(otherBuf.buffer);
        for (let i2 = 0; i2 < 8; i2++) {
          let offset = i2 * 4;
          let orig = p.getUint32(offset, true);
          let otherV = po.getUint32(offset, true);
          let next = orig;
          next += currCarry;
          next += otherV;
          if (next > 4294967295)
            nextCarry = 1;
          p.setUint32(offset, next & 4294967295, true);
          currCarry = nextCarry;
          nextCarry = 0;
        }
      }
      negate() {
        let p = new DataView(this.buf.buffer);
        for (let i2 = 0; i2 < 8; i2++) {
          let offset = i2 * 4;
          p.setUint32(offset, ~p.getUint32(offset, true));
        }
        let one = new Uint8Array(ID_SIZE);
        one[0] = 1;
        this.add(one);
      }
      getFingerprint(n) {
        let input = new WrappedBuffer();
        input.extend(this.buf);
        input.extend(encodeVarInt(n));
        let hash = sha256(input.unwrap());
        return hash.subarray(0, FINGERPRINT_SIZE);
      }
    };
    var NegentropyStorageVector = class {
      items;
      sealed;
      constructor() {
        this.items = [];
        this.sealed = false;
      }
      insert(timestamp, id) {
        if (this.sealed)
          throw Error("already sealed");
        const idb = hexToBytes$1(id);
        if (idb.byteLength !== ID_SIZE)
          throw Error("bad id size for added item");
        this.items.push({ timestamp, id: idb });
      }
      seal() {
        if (this.sealed)
          throw Error("already sealed");
        this.sealed = true;
        this.items.sort(itemCompare);
        for (let i2 = 1; i2 < this.items.length; i2++) {
          if (itemCompare(this.items[i2 - 1], this.items[i2]) === 0)
            throw Error("duplicate item inserted");
        }
      }
      unseal() {
        this.sealed = false;
      }
      size() {
        this._checkSealed();
        return this.items.length;
      }
      getItem(i2) {
        this._checkSealed();
        if (i2 >= this.items.length)
          throw Error("out of range");
        return this.items[i2];
      }
      iterate(begin, end, cb) {
        this._checkSealed();
        this._checkBounds(begin, end);
        for (let i2 = begin; i2 < end; ++i2) {
          if (!cb(this.items[i2], i2))
            break;
        }
      }
      findLowerBound(begin, end, bound) {
        this._checkSealed();
        this._checkBounds(begin, end);
        return this._binarySearch(this.items, begin, end, (a) => itemCompare(a, bound) < 0);
      }
      fingerprint(begin, end) {
        let out = new Accumulator();
        out.setToZero();
        this.iterate(begin, end, (item) => {
          out.add(item.id);
          return true;
        });
        return out.getFingerprint(end - begin);
      }
      _checkSealed() {
        if (!this.sealed)
          throw Error("not sealed");
      }
      _checkBounds(begin, end) {
        if (begin > end || end > this.items.length)
          throw Error("bad range");
      }
      _binarySearch(arr, first, last, cmp) {
        let count = last - first;
        while (count > 0) {
          let it = first;
          let step = Math.floor(count / 2);
          it += step;
          if (cmp(arr[it])) {
            first = ++it;
            count -= step + 1;
          } else {
            count = step;
          }
        }
        return first;
      }
    };
    var Negentropy = class {
      storage;
      frameSizeLimit;
      lastTimestampIn;
      lastTimestampOut;
      constructor(storage, frameSizeLimit = 6e4) {
        if (frameSizeLimit < 4096)
          throw Error("frameSizeLimit too small");
        this.storage = storage;
        this.frameSizeLimit = frameSizeLimit;
        this.lastTimestampIn = 0;
        this.lastTimestampOut = 0;
      }
      _bound(timestamp, id) {
        return { timestamp, id: id || new Uint8Array(0) };
      }
      initiate() {
        let output = new WrappedBuffer();
        output.extend(new Uint8Array([PROTOCOL_VERSION]));
        this.splitRange(0, this.storage.size(), this._bound(Number.MAX_VALUE), output);
        return bytesToHex(output.unwrap());
      }
      reconcile(queryMsg, onhave, onneed) {
        const query = new WrappedBuffer(hexToBytes$1(queryMsg));
        this.lastTimestampIn = this.lastTimestampOut = 0;
        let fullOutput = new WrappedBuffer();
        fullOutput.extend(new Uint8Array([PROTOCOL_VERSION]));
        let protocolVersion = getByte(query);
        if (protocolVersion < 96 || protocolVersion > 111)
          throw Error("invalid negentropy protocol version byte");
        if (protocolVersion !== PROTOCOL_VERSION) {
          throw Error("unsupported negentropy protocol version requested: " + (protocolVersion - 96));
        }
        let storageSize = this.storage.size();
        let prevBound = this._bound(0);
        let prevIndex = 0;
        let skip = false;
        while (query.length !== 0) {
          let o = new WrappedBuffer();
          let doSkip = () => {
            if (skip) {
              skip = false;
              o.extend(this.encodeBound(prevBound));
              o.extend(encodeVarInt(Mode.Skip));
            }
          };
          let currBound = this.decodeBound(query);
          let mode = decodeVarInt(query);
          let lower = prevIndex;
          let upper = this.storage.findLowerBound(prevIndex, storageSize, currBound);
          if (mode === Mode.Skip) {
            skip = true;
          } else if (mode === Mode.Fingerprint) {
            let theirFingerprint = getBytes(query, FINGERPRINT_SIZE);
            let ourFingerprint = this.storage.fingerprint(lower, upper);
            if (compareUint8Array(theirFingerprint, ourFingerprint) !== 0) {
              doSkip();
              this.splitRange(lower, upper, currBound, o);
            } else {
              skip = true;
            }
          } else if (mode === Mode.IdList) {
            let numIds = decodeVarInt(query);
            let theirElems = {};
            for (let i2 = 0; i2 < numIds; i2++) {
              let e = getBytes(query, ID_SIZE);
              theirElems[bytesToHex(e)] = e;
            }
            skip = true;
            this.storage.iterate(lower, upper, (item) => {
              let k = item.id;
              const id = bytesToHex(k);
              if (!theirElems[id]) {
                onhave?.(id);
              } else {
                delete theirElems[bytesToHex(k)];
              }
              return true;
            });
            if (onneed) {
              for (let v of Object.values(theirElems)) {
                onneed(bytesToHex(v));
              }
            }
          } else {
            throw Error("unexpected mode");
          }
          if (this.exceededFrameSizeLimit(fullOutput.length + o.length)) {
            let remainingFingerprint = this.storage.fingerprint(upper, storageSize);
            fullOutput.extend(this.encodeBound(this._bound(Number.MAX_VALUE)));
            fullOutput.extend(encodeVarInt(Mode.Fingerprint));
            fullOutput.extend(remainingFingerprint);
            break;
          } else {
            fullOutput.extend(o);
          }
          prevIndex = upper;
          prevBound = currBound;
        }
        return fullOutput.length === 1 ? null : bytesToHex(fullOutput.unwrap());
      }
      splitRange(lower, upper, upperBound, o) {
        let numElems = upper - lower;
        let buckets = 16;
        if (numElems < buckets * 2) {
          o.extend(this.encodeBound(upperBound));
          o.extend(encodeVarInt(Mode.IdList));
          o.extend(encodeVarInt(numElems));
          this.storage.iterate(lower, upper, (item) => {
            o.extend(item.id);
            return true;
          });
        } else {
          let itemsPerBucket = Math.floor(numElems / buckets);
          let bucketsWithExtra = numElems % buckets;
          let curr = lower;
          for (let i2 = 0; i2 < buckets; i2++) {
            let bucketSize = itemsPerBucket + (i2 < bucketsWithExtra ? 1 : 0);
            let ourFingerprint = this.storage.fingerprint(curr, curr + bucketSize);
            curr += bucketSize;
            let nextBound;
            if (curr === upper) {
              nextBound = upperBound;
            } else {
              let prevItem;
              let currItem;
              this.storage.iterate(curr - 1, curr + 1, (item, index) => {
                if (index === curr - 1)
                  prevItem = item;
                else
                  currItem = item;
                return true;
              });
              nextBound = this.getMinimalBound(prevItem, currItem);
            }
            o.extend(this.encodeBound(nextBound));
            o.extend(encodeVarInt(Mode.Fingerprint));
            o.extend(ourFingerprint);
          }
        }
      }
      exceededFrameSizeLimit(n) {
        return n > this.frameSizeLimit - 200;
      }
      decodeTimestampIn(encoded) {
        let timestamp = decodeVarInt(encoded);
        timestamp = timestamp === 0 ? Number.MAX_VALUE : timestamp - 1;
        if (this.lastTimestampIn === Number.MAX_VALUE || timestamp === Number.MAX_VALUE) {
          this.lastTimestampIn = Number.MAX_VALUE;
          return Number.MAX_VALUE;
        }
        timestamp += this.lastTimestampIn;
        this.lastTimestampIn = timestamp;
        return timestamp;
      }
      decodeBound(encoded) {
        let timestamp = this.decodeTimestampIn(encoded);
        let len = decodeVarInt(encoded);
        if (len > ID_SIZE)
          throw Error("bound key too long");
        let id = getBytes(encoded, len);
        return { timestamp, id };
      }
      encodeTimestampOut(timestamp) {
        if (timestamp === Number.MAX_VALUE) {
          this.lastTimestampOut = Number.MAX_VALUE;
          return encodeVarInt(0);
        }
        let temp = timestamp;
        timestamp -= this.lastTimestampOut;
        this.lastTimestampOut = temp;
        return encodeVarInt(timestamp + 1);
      }
      encodeBound(key) {
        let output = new WrappedBuffer();
        output.extend(this.encodeTimestampOut(key.timestamp));
        output.extend(encodeVarInt(key.id.length));
        output.extend(key.id);
        return output;
      }
      getMinimalBound(prev, curr) {
        if (curr.timestamp !== prev.timestamp) {
          return this._bound(curr.timestamp);
        } else {
          let sharedPrefixBytes = 0;
          let currKey = curr.id;
          let prevKey = prev.id;
          for (let i2 = 0; i2 < ID_SIZE; i2++) {
            if (currKey[i2] !== prevKey[i2])
              break;
            sharedPrefixBytes++;
          }
          return this._bound(curr.timestamp, curr.id.subarray(0, sharedPrefixBytes + 1));
        }
      }
    };
    function compareUint8Array(a, b) {
      for (let i2 = 0; i2 < a.byteLength; i2++) {
        if (a[i2] < b[i2])
          return -1;
        if (a[i2] > b[i2])
          return 1;
      }
      if (a.byteLength > b.byteLength)
        return 1;
      if (a.byteLength < b.byteLength)
        return -1;
      return 0;
    }
    function itemCompare(a, b) {
      if (a.timestamp === b.timestamp) {
        return compareUint8Array(a.id, b.id);
      }
      return a.timestamp - b.timestamp;
    }
    var NegentropySync = class {
      relay;
      storage;
      neg;
      filter;
      subscription;
      onhave;
      onneed;
      constructor(relay, storage, filter, params = {}) {
        this.relay = relay;
        this.storage = storage;
        this.neg = new Negentropy(storage);
        this.onhave = params.onhave;
        this.onneed = params.onneed;
        this.filter = filter;
        this.subscription = this.relay.prepareSubscription([{}], { label: params.label || "negentropy" });
        this.subscription.oncustom = (data) => {
          switch (data[0]) {
            case "NEG-MSG": {
              if (data.length < 3) {
                console.warn(`got invalid NEG-MSG from ${this.relay.url}: ${data}`);
              }
              try {
                const response = this.neg.reconcile(data[2], this.onhave, this.onneed);
                if (response) {
                  this.relay.send(`["NEG-MSG", "${this.subscription.id}", "${response}"]`);
                } else {
                  this.close();
                  params.onclose?.();
                }
              } catch (error) {
                console.error("negentropy reconcile error:", error);
                params?.onclose?.(`reconcile error: ${error}`);
              }
              break;
            }
            case "NEG-CLOSE": {
              const reason = data[2];
              console.warn("negentropy error:", reason);
              params.onclose?.(reason);
              break;
            }
            case "NEG-ERR": {
              params.onclose?.();
            }
          }
        };
      }
      async start() {
        const initMsg = this.neg.initiate();
        this.relay.send(`["NEG-OPEN","${this.subscription.id}",${JSON.stringify(this.filter)},"${initMsg}"]`);
      }
      close() {
        this.relay.send(`["NEG-CLOSE","${this.subscription.id}"]`);
        this.subscription.close();
      }
    };

    // nip98.ts
    var nip98_exports = {};
    __export(nip98_exports, {
      getToken: () => getToken,
      hashPayload: () => hashPayload,
      unpackEventFromToken: () => unpackEventFromToken,
      validateEvent: () => validateEvent2,
      validateEventKind: () => validateEventKind,
      validateEventMethodTag: () => validateEventMethodTag,
      validateEventPayloadTag: () => validateEventPayloadTag,
      validateEventTimestamp: () => validateEventTimestamp,
      validateEventUrlTag: () => validateEventUrlTag,
      validateToken: () => validateToken
    });
    var _authorizationScheme = "Nostr ";
    async function getToken(loginUrl, httpMethod, sign, includeAuthorizationScheme = false, payload) {
      const event = {
        kind: HTTPAuth,
        tags: [
          ["u", loginUrl],
          ["method", httpMethod]
        ],
        created_at: Math.round(new Date().getTime() / 1e3),
        content: ""
      };
      if (payload) {
        event.tags.push(["payload", hashPayload(payload)]);
      }
      const signedEvent = await sign(event);
      const authorizationScheme = includeAuthorizationScheme ? _authorizationScheme : "";
      return authorizationScheme + base64.encode(utf8Encoder.encode(JSON.stringify(signedEvent)));
    }
    async function validateToken(token, url, method) {
      const event = await unpackEventFromToken(token).catch((error) => {
        throw error;
      });
      const valid = await validateEvent2(event, url, method).catch((error) => {
        throw error;
      });
      return valid;
    }
    async function unpackEventFromToken(token) {
      if (!token) {
        throw new Error("Missing token");
      }
      token = token.replace(_authorizationScheme, "");
      const eventB64 = utf8Decoder.decode(base64.decode(token));
      if (!eventB64 || eventB64.length === 0 || !eventB64.startsWith("{")) {
        throw new Error("Invalid token");
      }
      const event = JSON.parse(eventB64);
      return event;
    }
    function validateEventTimestamp(event) {
      if (!event.created_at) {
        return false;
      }
      return Math.round(new Date().getTime() / 1e3) - event.created_at < 60;
    }
    function validateEventKind(event) {
      return event.kind === HTTPAuth;
    }
    function validateEventUrlTag(event, url) {
      const urlTag = event.tags.find((t) => t[0] === "u");
      if (!urlTag) {
        return false;
      }
      return urlTag.length > 0 && urlTag[1] === url;
    }
    function validateEventMethodTag(event, method) {
      const methodTag = event.tags.find((t) => t[0] === "method");
      if (!methodTag) {
        return false;
      }
      return methodTag.length > 0 && methodTag[1].toLowerCase() === method.toLowerCase();
    }
    function hashPayload(payload) {
      const hash = sha256(utf8Encoder.encode(JSON.stringify(payload)));
      return bytesToHex(hash);
    }
    function validateEventPayloadTag(event, payload) {
      const payloadTag = event.tags.find((t) => t[0] === "payload");
      if (!payloadTag) {
        return false;
      }
      const payloadHash = hashPayload(payload);
      return payloadTag.length > 0 && payloadTag[1] === payloadHash;
    }
    async function validateEvent2(event, url, method, body) {
      if (!verifyEvent(event)) {
        throw new Error("Invalid nostr event, signature invalid");
      }
      if (!validateEventKind(event)) {
        throw new Error("Invalid nostr event, kind invalid");
      }
      if (!validateEventTimestamp(event)) {
        throw new Error("Invalid nostr event, created_at timestamp invalid");
      }
      if (!validateEventUrlTag(event, url)) {
        throw new Error("Invalid nostr event, url tag invalid");
      }
      if (!validateEventMethodTag(event, method)) {
        throw new Error("Invalid nostr event, method tag invalid");
      }
      if (Boolean(body) && typeof body === "object" && Object.keys(body).length > 0) {
        if (!validateEventPayloadTag(event, body)) {
          throw new Error("Invalid nostr event, payload tag does not match request body hash");
        }
      }
      return true;
    }

    /**
     * Utilities for hex, bytes, CSPRNG.
     * @module
     */
    /*! noble-hashes - MIT License (c) 2022 Paul Miller (paulmillr.com) */
    // We use WebCrypto aka globalThis.crypto, which exists in browsers and node.js 16+.
    // node.js versions earlier than v19 don't declare it in global scope.
    // For node.js, package.json#exports field mapping rewrites import
    // from `crypto` to `cryptoNode`, which imports native module.
    // Makes the utils un-importable in browsers without a bundler.
    // Once node.js 18 is deprecated (2025-04-30), we can just drop the import.
    // Built-in hex conversion https://caniuse.com/mdn-javascript_builtins_uint8array_fromhex
    const hasHexBuiltin = /* @__PURE__ */ (() => 
    // @ts-ignore
    typeof Uint8Array.from([]).toHex === 'function' && typeof Uint8Array.fromHex === 'function')();
    // We use optimized technique to convert hex string to byte array
    const asciis = { _0: 48, _9: 57, A: 65, F: 70, a: 97, f: 102 };
    function asciiToBase16(ch) {
        if (ch >= asciis._0 && ch <= asciis._9)
            return ch - asciis._0; // '2' => 50-48
        if (ch >= asciis.A && ch <= asciis.F)
            return ch - (asciis.A - 10); // 'B' => 66-(65-10)
        if (ch >= asciis.a && ch <= asciis.f)
            return ch - (asciis.a - 10); // 'b' => 98-(97-10)
        return;
    }
    /**
     * Convert hex string to byte array. Uses built-in function, when available.
     * @example hexToBytes('cafe0123') // Uint8Array.from([0xca, 0xfe, 0x01, 0x23])
     */
    function hexToBytes(hex) {
        if (typeof hex !== 'string')
            throw new Error('hex string expected, got ' + typeof hex);
        // @ts-ignore
        if (hasHexBuiltin)
            return Uint8Array.fromHex(hex);
        const hl = hex.length;
        const al = hl / 2;
        if (hl % 2)
            throw new Error('hex string expected, got unpadded hex of length ' + hl);
        const array = new Uint8Array(al);
        for (let ai = 0, hi = 0; ai < al; ai++, hi += 2) {
            const n1 = asciiToBase16(hex.charCodeAt(hi));
            const n2 = asciiToBase16(hex.charCodeAt(hi + 1));
            if (n1 === undefined || n2 === undefined) {
                const char = hex[hi] + hex[hi + 1];
                throw new Error('hex string expected, got non-hex character "' + char + '" at index ' + hi);
            }
            array[ai] = n1 * 16 + n2; // multiply first octet, e.g. 'a3' => 10*16+3 => 160 + 3 => 163
        }
        return array;
    }

    function getDefaultExportFromCjs (x) {
    	return x && x.__esModule && Object.prototype.hasOwnProperty.call(x, 'default') ? x['default'] : x;
    }

    var browser = {};

    var canPromise;
    var hasRequiredCanPromise;

    function requireCanPromise () {
    	if (hasRequiredCanPromise) return canPromise;
    	hasRequiredCanPromise = 1;
    	// can-promise has a crash in some versions of react native that dont have
    	// standard global objects
    	// https://github.com/soldair/node-qrcode/issues/157

    	canPromise = function () {
    	  return typeof Promise === 'function' && Promise.prototype && Promise.prototype.then
    	};
    	return canPromise;
    }

    var qrcode = {};

    var utils$1 = {};

    var hasRequiredUtils$1;

    function requireUtils$1 () {
    	if (hasRequiredUtils$1) return utils$1;
    	hasRequiredUtils$1 = 1;
    	let toSJISFunction;
    	const CODEWORDS_COUNT = [
    	  0, // Not used
    	  26, 44, 70, 100, 134, 172, 196, 242, 292, 346,
    	  404, 466, 532, 581, 655, 733, 815, 901, 991, 1085,
    	  1156, 1258, 1364, 1474, 1588, 1706, 1828, 1921, 2051, 2185,
    	  2323, 2465, 2611, 2761, 2876, 3034, 3196, 3362, 3532, 3706
    	];

    	/**
    	 * Returns the QR Code size for the specified version
    	 *
    	 * @param  {Number} version QR Code version
    	 * @return {Number}         size of QR code
    	 */
    	utils$1.getSymbolSize = function getSymbolSize (version) {
    	  if (!version) throw new Error('"version" cannot be null or undefined')
    	  if (version < 1 || version > 40) throw new Error('"version" should be in range from 1 to 40')
    	  return version * 4 + 17
    	};

    	/**
    	 * Returns the total number of codewords used to store data and EC information.
    	 *
    	 * @param  {Number} version QR Code version
    	 * @return {Number}         Data length in bits
    	 */
    	utils$1.getSymbolTotalCodewords = function getSymbolTotalCodewords (version) {
    	  return CODEWORDS_COUNT[version]
    	};

    	/**
    	 * Encode data with Bose-Chaudhuri-Hocquenghem
    	 *
    	 * @param  {Number} data Value to encode
    	 * @return {Number}      Encoded value
    	 */
    	utils$1.getBCHDigit = function (data) {
    	  let digit = 0;

    	  while (data !== 0) {
    	    digit++;
    	    data >>>= 1;
    	  }

    	  return digit
    	};

    	utils$1.setToSJISFunction = function setToSJISFunction (f) {
    	  if (typeof f !== 'function') {
    	    throw new Error('"toSJISFunc" is not a valid function.')
    	  }

    	  toSJISFunction = f;
    	};

    	utils$1.isKanjiModeEnabled = function () {
    	  return typeof toSJISFunction !== 'undefined'
    	};

    	utils$1.toSJIS = function toSJIS (kanji) {
    	  return toSJISFunction(kanji)
    	};
    	return utils$1;
    }

    var errorCorrectionLevel = {};

    var hasRequiredErrorCorrectionLevel;

    function requireErrorCorrectionLevel () {
    	if (hasRequiredErrorCorrectionLevel) return errorCorrectionLevel;
    	hasRequiredErrorCorrectionLevel = 1;
    	(function (exports) {
    		exports.L = { bit: 1 };
    		exports.M = { bit: 0 };
    		exports.Q = { bit: 3 };
    		exports.H = { bit: 2 };

    		function fromString (string) {
    		  if (typeof string !== 'string') {
    		    throw new Error('Param is not a string')
    		  }

    		  const lcStr = string.toLowerCase();

    		  switch (lcStr) {
    		    case 'l':
    		    case 'low':
    		      return exports.L

    		    case 'm':
    		    case 'medium':
    		      return exports.M

    		    case 'q':
    		    case 'quartile':
    		      return exports.Q

    		    case 'h':
    		    case 'high':
    		      return exports.H

    		    default:
    		      throw new Error('Unknown EC Level: ' + string)
    		  }
    		}

    		exports.isValid = function isValid (level) {
    		  return level && typeof level.bit !== 'undefined' &&
    		    level.bit >= 0 && level.bit < 4
    		};

    		exports.from = function from (value, defaultValue) {
    		  if (exports.isValid(value)) {
    		    return value
    		  }

    		  try {
    		    return fromString(value)
    		  } catch (e) {
    		    return defaultValue
    		  }
    		}; 
    	} (errorCorrectionLevel));
    	return errorCorrectionLevel;
    }

    var bitBuffer;
    var hasRequiredBitBuffer;

    function requireBitBuffer () {
    	if (hasRequiredBitBuffer) return bitBuffer;
    	hasRequiredBitBuffer = 1;
    	function BitBuffer () {
    	  this.buffer = [];
    	  this.length = 0;
    	}

    	BitBuffer.prototype = {

    	  get: function (index) {
    	    const bufIndex = Math.floor(index / 8);
    	    return ((this.buffer[bufIndex] >>> (7 - index % 8)) & 1) === 1
    	  },

    	  put: function (num, length) {
    	    for (let i = 0; i < length; i++) {
    	      this.putBit(((num >>> (length - i - 1)) & 1) === 1);
    	    }
    	  },

    	  getLengthInBits: function () {
    	    return this.length
    	  },

    	  putBit: function (bit) {
    	    const bufIndex = Math.floor(this.length / 8);
    	    if (this.buffer.length <= bufIndex) {
    	      this.buffer.push(0);
    	    }

    	    if (bit) {
    	      this.buffer[bufIndex] |= (0x80 >>> (this.length % 8));
    	    }

    	    this.length++;
    	  }
    	};

    	bitBuffer = BitBuffer;
    	return bitBuffer;
    }

    /**
     * Helper class to handle QR Code symbol modules
     *
     * @param {Number} size Symbol size
     */

    var bitMatrix;
    var hasRequiredBitMatrix;

    function requireBitMatrix () {
    	if (hasRequiredBitMatrix) return bitMatrix;
    	hasRequiredBitMatrix = 1;
    	function BitMatrix (size) {
    	  if (!size || size < 1) {
    	    throw new Error('BitMatrix size must be defined and greater than 0')
    	  }

    	  this.size = size;
    	  this.data = new Uint8Array(size * size);
    	  this.reservedBit = new Uint8Array(size * size);
    	}

    	/**
    	 * Set bit value at specified location
    	 * If reserved flag is set, this bit will be ignored during masking process
    	 *
    	 * @param {Number}  row
    	 * @param {Number}  col
    	 * @param {Boolean} value
    	 * @param {Boolean} reserved
    	 */
    	BitMatrix.prototype.set = function (row, col, value, reserved) {
    	  const index = row * this.size + col;
    	  this.data[index] = value;
    	  if (reserved) this.reservedBit[index] = true;
    	};

    	/**
    	 * Returns bit value at specified location
    	 *
    	 * @param  {Number}  row
    	 * @param  {Number}  col
    	 * @return {Boolean}
    	 */
    	BitMatrix.prototype.get = function (row, col) {
    	  return this.data[row * this.size + col]
    	};

    	/**
    	 * Applies xor operator at specified location
    	 * (used during masking process)
    	 *
    	 * @param {Number}  row
    	 * @param {Number}  col
    	 * @param {Boolean} value
    	 */
    	BitMatrix.prototype.xor = function (row, col, value) {
    	  this.data[row * this.size + col] ^= value;
    	};

    	/**
    	 * Check if bit at specified location is reserved
    	 *
    	 * @param {Number}   row
    	 * @param {Number}   col
    	 * @return {Boolean}
    	 */
    	BitMatrix.prototype.isReserved = function (row, col) {
    	  return this.reservedBit[row * this.size + col]
    	};

    	bitMatrix = BitMatrix;
    	return bitMatrix;
    }

    var alignmentPattern = {};

    /**
     * Alignment pattern are fixed reference pattern in defined positions
     * in a matrix symbology, which enables the decode software to re-synchronise
     * the coordinate mapping of the image modules in the event of moderate amounts
     * of distortion of the image.
     *
     * Alignment patterns are present only in QR Code symbols of version 2 or larger
     * and their number depends on the symbol version.
     */

    var hasRequiredAlignmentPattern;

    function requireAlignmentPattern () {
    	if (hasRequiredAlignmentPattern) return alignmentPattern;
    	hasRequiredAlignmentPattern = 1;
    	(function (exports) {
    		const getSymbolSize = requireUtils$1().getSymbolSize;

    		/**
    		 * Calculate the row/column coordinates of the center module of each alignment pattern
    		 * for the specified QR Code version.
    		 *
    		 * The alignment patterns are positioned symmetrically on either side of the diagonal
    		 * running from the top left corner of the symbol to the bottom right corner.
    		 *
    		 * Since positions are simmetrical only half of the coordinates are returned.
    		 * Each item of the array will represent in turn the x and y coordinate.
    		 * @see {@link getPositions}
    		 *
    		 * @param  {Number} version QR Code version
    		 * @return {Array}          Array of coordinate
    		 */
    		exports.getRowColCoords = function getRowColCoords (version) {
    		  if (version === 1) return []

    		  const posCount = Math.floor(version / 7) + 2;
    		  const size = getSymbolSize(version);
    		  const intervals = size === 145 ? 26 : Math.ceil((size - 13) / (2 * posCount - 2)) * 2;
    		  const positions = [size - 7]; // Last coord is always (size - 7)

    		  for (let i = 1; i < posCount - 1; i++) {
    		    positions[i] = positions[i - 1] - intervals;
    		  }

    		  positions.push(6); // First coord is always 6

    		  return positions.reverse()
    		};

    		/**
    		 * Returns an array containing the positions of each alignment pattern.
    		 * Each array's element represent the center point of the pattern as (x, y) coordinates
    		 *
    		 * Coordinates are calculated expanding the row/column coordinates returned by {@link getRowColCoords}
    		 * and filtering out the items that overlaps with finder pattern
    		 *
    		 * @example
    		 * For a Version 7 symbol {@link getRowColCoords} returns values 6, 22 and 38.
    		 * The alignment patterns, therefore, are to be centered on (row, column)
    		 * positions (6,22), (22,6), (22,22), (22,38), (38,22), (38,38).
    		 * Note that the coordinates (6,6), (6,38), (38,6) are occupied by finder patterns
    		 * and are not therefore used for alignment patterns.
    		 *
    		 * let pos = getPositions(7)
    		 * // [[6,22], [22,6], [22,22], [22,38], [38,22], [38,38]]
    		 *
    		 * @param  {Number} version QR Code version
    		 * @return {Array}          Array of coordinates
    		 */
    		exports.getPositions = function getPositions (version) {
    		  const coords = [];
    		  const pos = exports.getRowColCoords(version);
    		  const posLength = pos.length;

    		  for (let i = 0; i < posLength; i++) {
    		    for (let j = 0; j < posLength; j++) {
    		      // Skip if position is occupied by finder patterns
    		      if ((i === 0 && j === 0) || // top-left
    		          (i === 0 && j === posLength - 1) || // bottom-left
    		          (i === posLength - 1 && j === 0)) { // top-right
    		        continue
    		      }

    		      coords.push([pos[i], pos[j]]);
    		    }
    		  }

    		  return coords
    		}; 
    	} (alignmentPattern));
    	return alignmentPattern;
    }

    var finderPattern = {};

    var hasRequiredFinderPattern;

    function requireFinderPattern () {
    	if (hasRequiredFinderPattern) return finderPattern;
    	hasRequiredFinderPattern = 1;
    	const getSymbolSize = requireUtils$1().getSymbolSize;
    	const FINDER_PATTERN_SIZE = 7;

    	/**
    	 * Returns an array containing the positions of each finder pattern.
    	 * Each array's element represent the top-left point of the pattern as (x, y) coordinates
    	 *
    	 * @param  {Number} version QR Code version
    	 * @return {Array}          Array of coordinates
    	 */
    	finderPattern.getPositions = function getPositions (version) {
    	  const size = getSymbolSize(version);

    	  return [
    	    // top-left
    	    [0, 0],
    	    // top-right
    	    [size - FINDER_PATTERN_SIZE, 0],
    	    // bottom-left
    	    [0, size - FINDER_PATTERN_SIZE]
    	  ]
    	};
    	return finderPattern;
    }

    var maskPattern = {};

    /**
     * Data mask pattern reference
     * @type {Object}
     */

    var hasRequiredMaskPattern;

    function requireMaskPattern () {
    	if (hasRequiredMaskPattern) return maskPattern;
    	hasRequiredMaskPattern = 1;
    	(function (exports) {
    		exports.Patterns = {
    		  PATTERN000: 0,
    		  PATTERN001: 1,
    		  PATTERN010: 2,
    		  PATTERN011: 3,
    		  PATTERN100: 4,
    		  PATTERN101: 5,
    		  PATTERN110: 6,
    		  PATTERN111: 7
    		};

    		/**
    		 * Weighted penalty scores for the undesirable features
    		 * @type {Object}
    		 */
    		const PenaltyScores = {
    		  N1: 3,
    		  N2: 3,
    		  N3: 40,
    		  N4: 10
    		};

    		/**
    		 * Check if mask pattern value is valid
    		 *
    		 * @param  {Number}  mask    Mask pattern
    		 * @return {Boolean}         true if valid, false otherwise
    		 */
    		exports.isValid = function isValid (mask) {
    		  return mask != null && mask !== '' && !isNaN(mask) && mask >= 0 && mask <= 7
    		};

    		/**
    		 * Returns mask pattern from a value.
    		 * If value is not valid, returns undefined
    		 *
    		 * @param  {Number|String} value        Mask pattern value
    		 * @return {Number}                     Valid mask pattern or undefined
    		 */
    		exports.from = function from (value) {
    		  return exports.isValid(value) ? parseInt(value, 10) : undefined
    		};

    		/**
    		* Find adjacent modules in row/column with the same color
    		* and assign a penalty value.
    		*
    		* Points: N1 + i
    		* i is the amount by which the number of adjacent modules of the same color exceeds 5
    		*/
    		exports.getPenaltyN1 = function getPenaltyN1 (data) {
    		  const size = data.size;
    		  let points = 0;
    		  let sameCountCol = 0;
    		  let sameCountRow = 0;
    		  let lastCol = null;
    		  let lastRow = null;

    		  for (let row = 0; row < size; row++) {
    		    sameCountCol = sameCountRow = 0;
    		    lastCol = lastRow = null;

    		    for (let col = 0; col < size; col++) {
    		      let module = data.get(row, col);
    		      if (module === lastCol) {
    		        sameCountCol++;
    		      } else {
    		        if (sameCountCol >= 5) points += PenaltyScores.N1 + (sameCountCol - 5);
    		        lastCol = module;
    		        sameCountCol = 1;
    		      }

    		      module = data.get(col, row);
    		      if (module === lastRow) {
    		        sameCountRow++;
    		      } else {
    		        if (sameCountRow >= 5) points += PenaltyScores.N1 + (sameCountRow - 5);
    		        lastRow = module;
    		        sameCountRow = 1;
    		      }
    		    }

    		    if (sameCountCol >= 5) points += PenaltyScores.N1 + (sameCountCol - 5);
    		    if (sameCountRow >= 5) points += PenaltyScores.N1 + (sameCountRow - 5);
    		  }

    		  return points
    		};

    		/**
    		 * Find 2x2 blocks with the same color and assign a penalty value
    		 *
    		 * Points: N2 * (m - 1) * (n - 1)
    		 */
    		exports.getPenaltyN2 = function getPenaltyN2 (data) {
    		  const size = data.size;
    		  let points = 0;

    		  for (let row = 0; row < size - 1; row++) {
    		    for (let col = 0; col < size - 1; col++) {
    		      const last = data.get(row, col) +
    		        data.get(row, col + 1) +
    		        data.get(row + 1, col) +
    		        data.get(row + 1, col + 1);

    		      if (last === 4 || last === 0) points++;
    		    }
    		  }

    		  return points * PenaltyScores.N2
    		};

    		/**
    		 * Find 1:1:3:1:1 ratio (dark:light:dark:light:dark) pattern in row/column,
    		 * preceded or followed by light area 4 modules wide
    		 *
    		 * Points: N3 * number of pattern found
    		 */
    		exports.getPenaltyN3 = function getPenaltyN3 (data) {
    		  const size = data.size;
    		  let points = 0;
    		  let bitsCol = 0;
    		  let bitsRow = 0;

    		  for (let row = 0; row < size; row++) {
    		    bitsCol = bitsRow = 0;
    		    for (let col = 0; col < size; col++) {
    		      bitsCol = ((bitsCol << 1) & 0x7FF) | data.get(row, col);
    		      if (col >= 10 && (bitsCol === 0x5D0 || bitsCol === 0x05D)) points++;

    		      bitsRow = ((bitsRow << 1) & 0x7FF) | data.get(col, row);
    		      if (col >= 10 && (bitsRow === 0x5D0 || bitsRow === 0x05D)) points++;
    		    }
    		  }

    		  return points * PenaltyScores.N3
    		};

    		/**
    		 * Calculate proportion of dark modules in entire symbol
    		 *
    		 * Points: N4 * k
    		 *
    		 * k is the rating of the deviation of the proportion of dark modules
    		 * in the symbol from 50% in steps of 5%
    		 */
    		exports.getPenaltyN4 = function getPenaltyN4 (data) {
    		  let darkCount = 0;
    		  const modulesCount = data.data.length;

    		  for (let i = 0; i < modulesCount; i++) darkCount += data.data[i];

    		  const k = Math.abs(Math.ceil((darkCount * 100 / modulesCount) / 5) - 10);

    		  return k * PenaltyScores.N4
    		};

    		/**
    		 * Return mask value at given position
    		 *
    		 * @param  {Number} maskPattern Pattern reference value
    		 * @param  {Number} i           Row
    		 * @param  {Number} j           Column
    		 * @return {Boolean}            Mask value
    		 */
    		function getMaskAt (maskPattern, i, j) {
    		  switch (maskPattern) {
    		    case exports.Patterns.PATTERN000: return (i + j) % 2 === 0
    		    case exports.Patterns.PATTERN001: return i % 2 === 0
    		    case exports.Patterns.PATTERN010: return j % 3 === 0
    		    case exports.Patterns.PATTERN011: return (i + j) % 3 === 0
    		    case exports.Patterns.PATTERN100: return (Math.floor(i / 2) + Math.floor(j / 3)) % 2 === 0
    		    case exports.Patterns.PATTERN101: return (i * j) % 2 + (i * j) % 3 === 0
    		    case exports.Patterns.PATTERN110: return ((i * j) % 2 + (i * j) % 3) % 2 === 0
    		    case exports.Patterns.PATTERN111: return ((i * j) % 3 + (i + j) % 2) % 2 === 0

    		    default: throw new Error('bad maskPattern:' + maskPattern)
    		  }
    		}

    		/**
    		 * Apply a mask pattern to a BitMatrix
    		 *
    		 * @param  {Number}    pattern Pattern reference number
    		 * @param  {BitMatrix} data    BitMatrix data
    		 */
    		exports.applyMask = function applyMask (pattern, data) {
    		  const size = data.size;

    		  for (let col = 0; col < size; col++) {
    		    for (let row = 0; row < size; row++) {
    		      if (data.isReserved(row, col)) continue
    		      data.xor(row, col, getMaskAt(pattern, row, col));
    		    }
    		  }
    		};

    		/**
    		 * Returns the best mask pattern for data
    		 *
    		 * @param  {BitMatrix} data
    		 * @return {Number} Mask pattern reference number
    		 */
    		exports.getBestMask = function getBestMask (data, setupFormatFunc) {
    		  const numPatterns = Object.keys(exports.Patterns).length;
    		  let bestPattern = 0;
    		  let lowerPenalty = Infinity;

    		  for (let p = 0; p < numPatterns; p++) {
    		    setupFormatFunc(p);
    		    exports.applyMask(p, data);

    		    // Calculate penalty
    		    const penalty =
    		      exports.getPenaltyN1(data) +
    		      exports.getPenaltyN2(data) +
    		      exports.getPenaltyN3(data) +
    		      exports.getPenaltyN4(data);

    		    // Undo previously applied mask
    		    exports.applyMask(p, data);

    		    if (penalty < lowerPenalty) {
    		      lowerPenalty = penalty;
    		      bestPattern = p;
    		    }
    		  }

    		  return bestPattern
    		}; 
    	} (maskPattern));
    	return maskPattern;
    }

    var errorCorrectionCode = {};

    var hasRequiredErrorCorrectionCode;

    function requireErrorCorrectionCode () {
    	if (hasRequiredErrorCorrectionCode) return errorCorrectionCode;
    	hasRequiredErrorCorrectionCode = 1;
    	const ECLevel = requireErrorCorrectionLevel();

    	const EC_BLOCKS_TABLE = [
    	// L  M  Q  H
    	  1, 1, 1, 1,
    	  1, 1, 1, 1,
    	  1, 1, 2, 2,
    	  1, 2, 2, 4,
    	  1, 2, 4, 4,
    	  2, 4, 4, 4,
    	  2, 4, 6, 5,
    	  2, 4, 6, 6,
    	  2, 5, 8, 8,
    	  4, 5, 8, 8,
    	  4, 5, 8, 11,
    	  4, 8, 10, 11,
    	  4, 9, 12, 16,
    	  4, 9, 16, 16,
    	  6, 10, 12, 18,
    	  6, 10, 17, 16,
    	  6, 11, 16, 19,
    	  6, 13, 18, 21,
    	  7, 14, 21, 25,
    	  8, 16, 20, 25,
    	  8, 17, 23, 25,
    	  9, 17, 23, 34,
    	  9, 18, 25, 30,
    	  10, 20, 27, 32,
    	  12, 21, 29, 35,
    	  12, 23, 34, 37,
    	  12, 25, 34, 40,
    	  13, 26, 35, 42,
    	  14, 28, 38, 45,
    	  15, 29, 40, 48,
    	  16, 31, 43, 51,
    	  17, 33, 45, 54,
    	  18, 35, 48, 57,
    	  19, 37, 51, 60,
    	  19, 38, 53, 63,
    	  20, 40, 56, 66,
    	  21, 43, 59, 70,
    	  22, 45, 62, 74,
    	  24, 47, 65, 77,
    	  25, 49, 68, 81
    	];

    	const EC_CODEWORDS_TABLE = [
    	// L  M  Q  H
    	  7, 10, 13, 17,
    	  10, 16, 22, 28,
    	  15, 26, 36, 44,
    	  20, 36, 52, 64,
    	  26, 48, 72, 88,
    	  36, 64, 96, 112,
    	  40, 72, 108, 130,
    	  48, 88, 132, 156,
    	  60, 110, 160, 192,
    	  72, 130, 192, 224,
    	  80, 150, 224, 264,
    	  96, 176, 260, 308,
    	  104, 198, 288, 352,
    	  120, 216, 320, 384,
    	  132, 240, 360, 432,
    	  144, 280, 408, 480,
    	  168, 308, 448, 532,
    	  180, 338, 504, 588,
    	  196, 364, 546, 650,
    	  224, 416, 600, 700,
    	  224, 442, 644, 750,
    	  252, 476, 690, 816,
    	  270, 504, 750, 900,
    	  300, 560, 810, 960,
    	  312, 588, 870, 1050,
    	  336, 644, 952, 1110,
    	  360, 700, 1020, 1200,
    	  390, 728, 1050, 1260,
    	  420, 784, 1140, 1350,
    	  450, 812, 1200, 1440,
    	  480, 868, 1290, 1530,
    	  510, 924, 1350, 1620,
    	  540, 980, 1440, 1710,
    	  570, 1036, 1530, 1800,
    	  570, 1064, 1590, 1890,
    	  600, 1120, 1680, 1980,
    	  630, 1204, 1770, 2100,
    	  660, 1260, 1860, 2220,
    	  720, 1316, 1950, 2310,
    	  750, 1372, 2040, 2430
    	];

    	/**
    	 * Returns the number of error correction block that the QR Code should contain
    	 * for the specified version and error correction level.
    	 *
    	 * @param  {Number} version              QR Code version
    	 * @param  {Number} errorCorrectionLevel Error correction level
    	 * @return {Number}                      Number of error correction blocks
    	 */
    	errorCorrectionCode.getBlocksCount = function getBlocksCount (version, errorCorrectionLevel) {
    	  switch (errorCorrectionLevel) {
    	    case ECLevel.L:
    	      return EC_BLOCKS_TABLE[(version - 1) * 4 + 0]
    	    case ECLevel.M:
    	      return EC_BLOCKS_TABLE[(version - 1) * 4 + 1]
    	    case ECLevel.Q:
    	      return EC_BLOCKS_TABLE[(version - 1) * 4 + 2]
    	    case ECLevel.H:
    	      return EC_BLOCKS_TABLE[(version - 1) * 4 + 3]
    	    default:
    	      return undefined
    	  }
    	};

    	/**
    	 * Returns the number of error correction codewords to use for the specified
    	 * version and error correction level.
    	 *
    	 * @param  {Number} version              QR Code version
    	 * @param  {Number} errorCorrectionLevel Error correction level
    	 * @return {Number}                      Number of error correction codewords
    	 */
    	errorCorrectionCode.getTotalCodewordsCount = function getTotalCodewordsCount (version, errorCorrectionLevel) {
    	  switch (errorCorrectionLevel) {
    	    case ECLevel.L:
    	      return EC_CODEWORDS_TABLE[(version - 1) * 4 + 0]
    	    case ECLevel.M:
    	      return EC_CODEWORDS_TABLE[(version - 1) * 4 + 1]
    	    case ECLevel.Q:
    	      return EC_CODEWORDS_TABLE[(version - 1) * 4 + 2]
    	    case ECLevel.H:
    	      return EC_CODEWORDS_TABLE[(version - 1) * 4 + 3]
    	    default:
    	      return undefined
    	  }
    	};
    	return errorCorrectionCode;
    }

    var polynomial = {};

    var galoisField = {};

    var hasRequiredGaloisField;

    function requireGaloisField () {
    	if (hasRequiredGaloisField) return galoisField;
    	hasRequiredGaloisField = 1;
    	const EXP_TABLE = new Uint8Array(512);
    	const LOG_TABLE = new Uint8Array(256)
    	/**
    	 * Precompute the log and anti-log tables for faster computation later
    	 *
    	 * For each possible value in the galois field 2^8, we will pre-compute
    	 * the logarithm and anti-logarithm (exponential) of this value
    	 *
    	 * ref {@link https://en.wikiversity.org/wiki/Reed%E2%80%93Solomon_codes_for_coders#Introduction_to_mathematical_fields}
    	 */
    	;(function initTables () {
    	  let x = 1;
    	  for (let i = 0; i < 255; i++) {
    	    EXP_TABLE[i] = x;
    	    LOG_TABLE[x] = i;

    	    x <<= 1; // multiply by 2

    	    // The QR code specification says to use byte-wise modulo 100011101 arithmetic.
    	    // This means that when a number is 256 or larger, it should be XORed with 0x11D.
    	    if (x & 0x100) { // similar to x >= 256, but a lot faster (because 0x100 == 256)
    	      x ^= 0x11D;
    	    }
    	  }

    	  // Optimization: double the size of the anti-log table so that we don't need to mod 255 to
    	  // stay inside the bounds (because we will mainly use this table for the multiplication of
    	  // two GF numbers, no more).
    	  // @see {@link mul}
    	  for (let i = 255; i < 512; i++) {
    	    EXP_TABLE[i] = EXP_TABLE[i - 255];
    	  }
    	}());

    	/**
    	 * Returns log value of n inside Galois Field
    	 *
    	 * @param  {Number} n
    	 * @return {Number}
    	 */
    	galoisField.log = function log (n) {
    	  if (n < 1) throw new Error('log(' + n + ')')
    	  return LOG_TABLE[n]
    	};

    	/**
    	 * Returns anti-log value of n inside Galois Field
    	 *
    	 * @param  {Number} n
    	 * @return {Number}
    	 */
    	galoisField.exp = function exp (n) {
    	  return EXP_TABLE[n]
    	};

    	/**
    	 * Multiplies two number inside Galois Field
    	 *
    	 * @param  {Number} x
    	 * @param  {Number} y
    	 * @return {Number}
    	 */
    	galoisField.mul = function mul (x, y) {
    	  if (x === 0 || y === 0) return 0

    	  // should be EXP_TABLE[(LOG_TABLE[x] + LOG_TABLE[y]) % 255] if EXP_TABLE wasn't oversized
    	  // @see {@link initTables}
    	  return EXP_TABLE[LOG_TABLE[x] + LOG_TABLE[y]]
    	};
    	return galoisField;
    }

    var hasRequiredPolynomial;

    function requirePolynomial () {
    	if (hasRequiredPolynomial) return polynomial;
    	hasRequiredPolynomial = 1;
    	(function (exports) {
    		const GF = requireGaloisField();

    		/**
    		 * Multiplies two polynomials inside Galois Field
    		 *
    		 * @param  {Uint8Array} p1 Polynomial
    		 * @param  {Uint8Array} p2 Polynomial
    		 * @return {Uint8Array}    Product of p1 and p2
    		 */
    		exports.mul = function mul (p1, p2) {
    		  const coeff = new Uint8Array(p1.length + p2.length - 1);

    		  for (let i = 0; i < p1.length; i++) {
    		    for (let j = 0; j < p2.length; j++) {
    		      coeff[i + j] ^= GF.mul(p1[i], p2[j]);
    		    }
    		  }

    		  return coeff
    		};

    		/**
    		 * Calculate the remainder of polynomials division
    		 *
    		 * @param  {Uint8Array} divident Polynomial
    		 * @param  {Uint8Array} divisor  Polynomial
    		 * @return {Uint8Array}          Remainder
    		 */
    		exports.mod = function mod (divident, divisor) {
    		  let result = new Uint8Array(divident);

    		  while ((result.length - divisor.length) >= 0) {
    		    const coeff = result[0];

    		    for (let i = 0; i < divisor.length; i++) {
    		      result[i] ^= GF.mul(divisor[i], coeff);
    		    }

    		    // remove all zeros from buffer head
    		    let offset = 0;
    		    while (offset < result.length && result[offset] === 0) offset++;
    		    result = result.slice(offset);
    		  }

    		  return result
    		};

    		/**
    		 * Generate an irreducible generator polynomial of specified degree
    		 * (used by Reed-Solomon encoder)
    		 *
    		 * @param  {Number} degree Degree of the generator polynomial
    		 * @return {Uint8Array}    Buffer containing polynomial coefficients
    		 */
    		exports.generateECPolynomial = function generateECPolynomial (degree) {
    		  let poly = new Uint8Array([1]);
    		  for (let i = 0; i < degree; i++) {
    		    poly = exports.mul(poly, new Uint8Array([1, GF.exp(i)]));
    		  }

    		  return poly
    		}; 
    	} (polynomial));
    	return polynomial;
    }

    var reedSolomonEncoder;
    var hasRequiredReedSolomonEncoder;

    function requireReedSolomonEncoder () {
    	if (hasRequiredReedSolomonEncoder) return reedSolomonEncoder;
    	hasRequiredReedSolomonEncoder = 1;
    	const Polynomial = requirePolynomial();

    	function ReedSolomonEncoder (degree) {
    	  this.genPoly = undefined;
    	  this.degree = degree;

    	  if (this.degree) this.initialize(this.degree);
    	}

    	/**
    	 * Initialize the encoder.
    	 * The input param should correspond to the number of error correction codewords.
    	 *
    	 * @param  {Number} degree
    	 */
    	ReedSolomonEncoder.prototype.initialize = function initialize (degree) {
    	  // create an irreducible generator polynomial
    	  this.degree = degree;
    	  this.genPoly = Polynomial.generateECPolynomial(this.degree);
    	};

    	/**
    	 * Encodes a chunk of data
    	 *
    	 * @param  {Uint8Array} data Buffer containing input data
    	 * @return {Uint8Array}      Buffer containing encoded data
    	 */
    	ReedSolomonEncoder.prototype.encode = function encode (data) {
    	  if (!this.genPoly) {
    	    throw new Error('Encoder not initialized')
    	  }

    	  // Calculate EC for this data block
    	  // extends data size to data+genPoly size
    	  const paddedData = new Uint8Array(data.length + this.degree);
    	  paddedData.set(data);

    	  // The error correction codewords are the remainder after dividing the data codewords
    	  // by a generator polynomial
    	  const remainder = Polynomial.mod(paddedData, this.genPoly);

    	  // return EC data blocks (last n byte, where n is the degree of genPoly)
    	  // If coefficients number in remainder are less than genPoly degree,
    	  // pad with 0s to the left to reach the needed number of coefficients
    	  const start = this.degree - remainder.length;
    	  if (start > 0) {
    	    const buff = new Uint8Array(this.degree);
    	    buff.set(remainder, start);

    	    return buff
    	  }

    	  return remainder
    	};

    	reedSolomonEncoder = ReedSolomonEncoder;
    	return reedSolomonEncoder;
    }

    var version = {};

    var mode = {};

    var versionCheck = {};

    /**
     * Check if QR Code version is valid
     *
     * @param  {Number}  version QR Code version
     * @return {Boolean}         true if valid version, false otherwise
     */

    var hasRequiredVersionCheck;

    function requireVersionCheck () {
    	if (hasRequiredVersionCheck) return versionCheck;
    	hasRequiredVersionCheck = 1;
    	versionCheck.isValid = function isValid (version) {
    	  return !isNaN(version) && version >= 1 && version <= 40
    	};
    	return versionCheck;
    }

    var regex = {};

    var hasRequiredRegex;

    function requireRegex () {
    	if (hasRequiredRegex) return regex;
    	hasRequiredRegex = 1;
    	const numeric = '[0-9]+';
    	const alphanumeric = '[A-Z $%*+\\-./:]+';
    	let kanji = '(?:[u3000-u303F]|[u3040-u309F]|[u30A0-u30FF]|' +
    	  '[uFF00-uFFEF]|[u4E00-u9FAF]|[u2605-u2606]|[u2190-u2195]|u203B|' +
    	  '[u2010u2015u2018u2019u2025u2026u201Cu201Du2225u2260]|' +
    	  '[u0391-u0451]|[u00A7u00A8u00B1u00B4u00D7u00F7])+';
    	kanji = kanji.replace(/u/g, '\\u');

    	const byte = '(?:(?![A-Z0-9 $%*+\\-./:]|' + kanji + ')(?:.|[\r\n]))+';

    	regex.KANJI = new RegExp(kanji, 'g');
    	regex.BYTE_KANJI = new RegExp('[^A-Z0-9 $%*+\\-./:]+', 'g');
    	regex.BYTE = new RegExp(byte, 'g');
    	regex.NUMERIC = new RegExp(numeric, 'g');
    	regex.ALPHANUMERIC = new RegExp(alphanumeric, 'g');

    	const TEST_KANJI = new RegExp('^' + kanji + '$');
    	const TEST_NUMERIC = new RegExp('^' + numeric + '$');
    	const TEST_ALPHANUMERIC = new RegExp('^[A-Z0-9 $%*+\\-./:]+$');

    	regex.testKanji = function testKanji (str) {
    	  return TEST_KANJI.test(str)
    	};

    	regex.testNumeric = function testNumeric (str) {
    	  return TEST_NUMERIC.test(str)
    	};

    	regex.testAlphanumeric = function testAlphanumeric (str) {
    	  return TEST_ALPHANUMERIC.test(str)
    	};
    	return regex;
    }

    var hasRequiredMode;

    function requireMode () {
    	if (hasRequiredMode) return mode;
    	hasRequiredMode = 1;
    	(function (exports) {
    		const VersionCheck = requireVersionCheck();
    		const Regex = requireRegex();

    		/**
    		 * Numeric mode encodes data from the decimal digit set (0 - 9)
    		 * (byte values 30HEX to 39HEX).
    		 * Normally, 3 data characters are represented by 10 bits.
    		 *
    		 * @type {Object}
    		 */
    		exports.NUMERIC = {
    		  id: 'Numeric',
    		  bit: 1 << 0,
    		  ccBits: [10, 12, 14]
    		};

    		/**
    		 * Alphanumeric mode encodes data from a set of 45 characters,
    		 * i.e. 10 numeric digits (0 - 9),
    		 *      26 alphabetic characters (A - Z),
    		 *   and 9 symbols (SP, $, %, *, +, -, ., /, :).
    		 * Normally, two input characters are represented by 11 bits.
    		 *
    		 * @type {Object}
    		 */
    		exports.ALPHANUMERIC = {
    		  id: 'Alphanumeric',
    		  bit: 1 << 1,
    		  ccBits: [9, 11, 13]
    		};

    		/**
    		 * In byte mode, data is encoded at 8 bits per character.
    		 *
    		 * @type {Object}
    		 */
    		exports.BYTE = {
    		  id: 'Byte',
    		  bit: 1 << 2,
    		  ccBits: [8, 16, 16]
    		};

    		/**
    		 * The Kanji mode efficiently encodes Kanji characters in accordance with
    		 * the Shift JIS system based on JIS X 0208.
    		 * The Shift JIS values are shifted from the JIS X 0208 values.
    		 * JIS X 0208 gives details of the shift coded representation.
    		 * Each two-byte character value is compacted to a 13-bit binary codeword.
    		 *
    		 * @type {Object}
    		 */
    		exports.KANJI = {
    		  id: 'Kanji',
    		  bit: 1 << 3,
    		  ccBits: [8, 10, 12]
    		};

    		/**
    		 * Mixed mode will contain a sequences of data in a combination of any of
    		 * the modes described above
    		 *
    		 * @type {Object}
    		 */
    		exports.MIXED = {
    		  bit: -1
    		};

    		/**
    		 * Returns the number of bits needed to store the data length
    		 * according to QR Code specifications.
    		 *
    		 * @param  {Mode}   mode    Data mode
    		 * @param  {Number} version QR Code version
    		 * @return {Number}         Number of bits
    		 */
    		exports.getCharCountIndicator = function getCharCountIndicator (mode, version) {
    		  if (!mode.ccBits) throw new Error('Invalid mode: ' + mode)

    		  if (!VersionCheck.isValid(version)) {
    		    throw new Error('Invalid version: ' + version)
    		  }

    		  if (version >= 1 && version < 10) return mode.ccBits[0]
    		  else if (version < 27) return mode.ccBits[1]
    		  return mode.ccBits[2]
    		};

    		/**
    		 * Returns the most efficient mode to store the specified data
    		 *
    		 * @param  {String} dataStr Input data string
    		 * @return {Mode}           Best mode
    		 */
    		exports.getBestModeForData = function getBestModeForData (dataStr) {
    		  if (Regex.testNumeric(dataStr)) return exports.NUMERIC
    		  else if (Regex.testAlphanumeric(dataStr)) return exports.ALPHANUMERIC
    		  else if (Regex.testKanji(dataStr)) return exports.KANJI
    		  else return exports.BYTE
    		};

    		/**
    		 * Return mode name as string
    		 *
    		 * @param {Mode} mode Mode object
    		 * @returns {String}  Mode name
    		 */
    		exports.toString = function toString (mode) {
    		  if (mode && mode.id) return mode.id
    		  throw new Error('Invalid mode')
    		};

    		/**
    		 * Check if input param is a valid mode object
    		 *
    		 * @param   {Mode}    mode Mode object
    		 * @returns {Boolean} True if valid mode, false otherwise
    		 */
    		exports.isValid = function isValid (mode) {
    		  return mode && mode.bit && mode.ccBits
    		};

    		/**
    		 * Get mode object from its name
    		 *
    		 * @param   {String} string Mode name
    		 * @returns {Mode}          Mode object
    		 */
    		function fromString (string) {
    		  if (typeof string !== 'string') {
    		    throw new Error('Param is not a string')
    		  }

    		  const lcStr = string.toLowerCase();

    		  switch (lcStr) {
    		    case 'numeric':
    		      return exports.NUMERIC
    		    case 'alphanumeric':
    		      return exports.ALPHANUMERIC
    		    case 'kanji':
    		      return exports.KANJI
    		    case 'byte':
    		      return exports.BYTE
    		    default:
    		      throw new Error('Unknown mode: ' + string)
    		  }
    		}

    		/**
    		 * Returns mode from a value.
    		 * If value is not a valid mode, returns defaultValue
    		 *
    		 * @param  {Mode|String} value        Encoding mode
    		 * @param  {Mode}        defaultValue Fallback value
    		 * @return {Mode}                     Encoding mode
    		 */
    		exports.from = function from (value, defaultValue) {
    		  if (exports.isValid(value)) {
    		    return value
    		  }

    		  try {
    		    return fromString(value)
    		  } catch (e) {
    		    return defaultValue
    		  }
    		}; 
    	} (mode));
    	return mode;
    }

    var hasRequiredVersion;

    function requireVersion () {
    	if (hasRequiredVersion) return version;
    	hasRequiredVersion = 1;
    	(function (exports) {
    		const Utils = requireUtils$1();
    		const ECCode = requireErrorCorrectionCode();
    		const ECLevel = requireErrorCorrectionLevel();
    		const Mode = requireMode();
    		const VersionCheck = requireVersionCheck();

    		// Generator polynomial used to encode version information
    		const G18 = (1 << 12) | (1 << 11) | (1 << 10) | (1 << 9) | (1 << 8) | (1 << 5) | (1 << 2) | (1 << 0);
    		const G18_BCH = Utils.getBCHDigit(G18);

    		function getBestVersionForDataLength (mode, length, errorCorrectionLevel) {
    		  for (let currentVersion = 1; currentVersion <= 40; currentVersion++) {
    		    if (length <= exports.getCapacity(currentVersion, errorCorrectionLevel, mode)) {
    		      return currentVersion
    		    }
    		  }

    		  return undefined
    		}

    		function getReservedBitsCount (mode, version) {
    		  // Character count indicator + mode indicator bits
    		  return Mode.getCharCountIndicator(mode, version) + 4
    		}

    		function getTotalBitsFromDataArray (segments, version) {
    		  let totalBits = 0;

    		  segments.forEach(function (data) {
    		    const reservedBits = getReservedBitsCount(data.mode, version);
    		    totalBits += reservedBits + data.getBitsLength();
    		  });

    		  return totalBits
    		}

    		function getBestVersionForMixedData (segments, errorCorrectionLevel) {
    		  for (let currentVersion = 1; currentVersion <= 40; currentVersion++) {
    		    const length = getTotalBitsFromDataArray(segments, currentVersion);
    		    if (length <= exports.getCapacity(currentVersion, errorCorrectionLevel, Mode.MIXED)) {
    		      return currentVersion
    		    }
    		  }

    		  return undefined
    		}

    		/**
    		 * Returns version number from a value.
    		 * If value is not a valid version, returns defaultValue
    		 *
    		 * @param  {Number|String} value        QR Code version
    		 * @param  {Number}        defaultValue Fallback value
    		 * @return {Number}                     QR Code version number
    		 */
    		exports.from = function from (value, defaultValue) {
    		  if (VersionCheck.isValid(value)) {
    		    return parseInt(value, 10)
    		  }

    		  return defaultValue
    		};

    		/**
    		 * Returns how much data can be stored with the specified QR code version
    		 * and error correction level
    		 *
    		 * @param  {Number} version              QR Code version (1-40)
    		 * @param  {Number} errorCorrectionLevel Error correction level
    		 * @param  {Mode}   mode                 Data mode
    		 * @return {Number}                      Quantity of storable data
    		 */
    		exports.getCapacity = function getCapacity (version, errorCorrectionLevel, mode) {
    		  if (!VersionCheck.isValid(version)) {
    		    throw new Error('Invalid QR Code version')
    		  }

    		  // Use Byte mode as default
    		  if (typeof mode === 'undefined') mode = Mode.BYTE;

    		  // Total codewords for this QR code version (Data + Error correction)
    		  const totalCodewords = Utils.getSymbolTotalCodewords(version);

    		  // Total number of error correction codewords
    		  const ecTotalCodewords = ECCode.getTotalCodewordsCount(version, errorCorrectionLevel);

    		  // Total number of data codewords
    		  const dataTotalCodewordsBits = (totalCodewords - ecTotalCodewords) * 8;

    		  if (mode === Mode.MIXED) return dataTotalCodewordsBits

    		  const usableBits = dataTotalCodewordsBits - getReservedBitsCount(mode, version);

    		  // Return max number of storable codewords
    		  switch (mode) {
    		    case Mode.NUMERIC:
    		      return Math.floor((usableBits / 10) * 3)

    		    case Mode.ALPHANUMERIC:
    		      return Math.floor((usableBits / 11) * 2)

    		    case Mode.KANJI:
    		      return Math.floor(usableBits / 13)

    		    case Mode.BYTE:
    		    default:
    		      return Math.floor(usableBits / 8)
    		  }
    		};

    		/**
    		 * Returns the minimum version needed to contain the amount of data
    		 *
    		 * @param  {Segment} data                    Segment of data
    		 * @param  {Number} [errorCorrectionLevel=H] Error correction level
    		 * @param  {Mode} mode                       Data mode
    		 * @return {Number}                          QR Code version
    		 */
    		exports.getBestVersionForData = function getBestVersionForData (data, errorCorrectionLevel) {
    		  let seg;

    		  const ecl = ECLevel.from(errorCorrectionLevel, ECLevel.M);

    		  if (Array.isArray(data)) {
    		    if (data.length > 1) {
    		      return getBestVersionForMixedData(data, ecl)
    		    }

    		    if (data.length === 0) {
    		      return 1
    		    }

    		    seg = data[0];
    		  } else {
    		    seg = data;
    		  }

    		  return getBestVersionForDataLength(seg.mode, seg.getLength(), ecl)
    		};

    		/**
    		 * Returns version information with relative error correction bits
    		 *
    		 * The version information is included in QR Code symbols of version 7 or larger.
    		 * It consists of an 18-bit sequence containing 6 data bits,
    		 * with 12 error correction bits calculated using the (18, 6) Golay code.
    		 *
    		 * @param  {Number} version QR Code version
    		 * @return {Number}         Encoded version info bits
    		 */
    		exports.getEncodedBits = function getEncodedBits (version) {
    		  if (!VersionCheck.isValid(version) || version < 7) {
    		    throw new Error('Invalid QR Code version')
    		  }

    		  let d = version << 12;

    		  while (Utils.getBCHDigit(d) - G18_BCH >= 0) {
    		    d ^= (G18 << (Utils.getBCHDigit(d) - G18_BCH));
    		  }

    		  return (version << 12) | d
    		}; 
    	} (version));
    	return version;
    }

    var formatInfo = {};

    var hasRequiredFormatInfo;

    function requireFormatInfo () {
    	if (hasRequiredFormatInfo) return formatInfo;
    	hasRequiredFormatInfo = 1;
    	const Utils = requireUtils$1();

    	const G15 = (1 << 10) | (1 << 8) | (1 << 5) | (1 << 4) | (1 << 2) | (1 << 1) | (1 << 0);
    	const G15_MASK = (1 << 14) | (1 << 12) | (1 << 10) | (1 << 4) | (1 << 1);
    	const G15_BCH = Utils.getBCHDigit(G15);

    	/**
    	 * Returns format information with relative error correction bits
    	 *
    	 * The format information is a 15-bit sequence containing 5 data bits,
    	 * with 10 error correction bits calculated using the (15, 5) BCH code.
    	 *
    	 * @param  {Number} errorCorrectionLevel Error correction level
    	 * @param  {Number} mask                 Mask pattern
    	 * @return {Number}                      Encoded format information bits
    	 */
    	formatInfo.getEncodedBits = function getEncodedBits (errorCorrectionLevel, mask) {
    	  const data = ((errorCorrectionLevel.bit << 3) | mask);
    	  let d = data << 10;

    	  while (Utils.getBCHDigit(d) - G15_BCH >= 0) {
    	    d ^= (G15 << (Utils.getBCHDigit(d) - G15_BCH));
    	  }

    	  // xor final data with mask pattern in order to ensure that
    	  // no combination of Error Correction Level and data mask pattern
    	  // will result in an all-zero data string
    	  return ((data << 10) | d) ^ G15_MASK
    	};
    	return formatInfo;
    }

    var segments = {};

    var numericData;
    var hasRequiredNumericData;

    function requireNumericData () {
    	if (hasRequiredNumericData) return numericData;
    	hasRequiredNumericData = 1;
    	const Mode = requireMode();

    	function NumericData (data) {
    	  this.mode = Mode.NUMERIC;
    	  this.data = data.toString();
    	}

    	NumericData.getBitsLength = function getBitsLength (length) {
    	  return 10 * Math.floor(length / 3) + ((length % 3) ? ((length % 3) * 3 + 1) : 0)
    	};

    	NumericData.prototype.getLength = function getLength () {
    	  return this.data.length
    	};

    	NumericData.prototype.getBitsLength = function getBitsLength () {
    	  return NumericData.getBitsLength(this.data.length)
    	};

    	NumericData.prototype.write = function write (bitBuffer) {
    	  let i, group, value;

    	  // The input data string is divided into groups of three digits,
    	  // and each group is converted to its 10-bit binary equivalent.
    	  for (i = 0; i + 3 <= this.data.length; i += 3) {
    	    group = this.data.substr(i, 3);
    	    value = parseInt(group, 10);

    	    bitBuffer.put(value, 10);
    	  }

    	  // If the number of input digits is not an exact multiple of three,
    	  // the final one or two digits are converted to 4 or 7 bits respectively.
    	  const remainingNum = this.data.length - i;
    	  if (remainingNum > 0) {
    	    group = this.data.substr(i);
    	    value = parseInt(group, 10);

    	    bitBuffer.put(value, remainingNum * 3 + 1);
    	  }
    	};

    	numericData = NumericData;
    	return numericData;
    }

    var alphanumericData;
    var hasRequiredAlphanumericData;

    function requireAlphanumericData () {
    	if (hasRequiredAlphanumericData) return alphanumericData;
    	hasRequiredAlphanumericData = 1;
    	const Mode = requireMode();

    	/**
    	 * Array of characters available in alphanumeric mode
    	 *
    	 * As per QR Code specification, to each character
    	 * is assigned a value from 0 to 44 which in this case coincides
    	 * with the array index
    	 *
    	 * @type {Array}
    	 */
    	const ALPHA_NUM_CHARS = [
    	  '0', '1', '2', '3', '4', '5', '6', '7', '8', '9',
    	  'A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L', 'M',
    	  'N', 'O', 'P', 'Q', 'R', 'S', 'T', 'U', 'V', 'W', 'X', 'Y', 'Z',
    	  ' ', '$', '%', '*', '+', '-', '.', '/', ':'
    	];

    	function AlphanumericData (data) {
    	  this.mode = Mode.ALPHANUMERIC;
    	  this.data = data;
    	}

    	AlphanumericData.getBitsLength = function getBitsLength (length) {
    	  return 11 * Math.floor(length / 2) + 6 * (length % 2)
    	};

    	AlphanumericData.prototype.getLength = function getLength () {
    	  return this.data.length
    	};

    	AlphanumericData.prototype.getBitsLength = function getBitsLength () {
    	  return AlphanumericData.getBitsLength(this.data.length)
    	};

    	AlphanumericData.prototype.write = function write (bitBuffer) {
    	  let i;

    	  // Input data characters are divided into groups of two characters
    	  // and encoded as 11-bit binary codes.
    	  for (i = 0; i + 2 <= this.data.length; i += 2) {
    	    // The character value of the first character is multiplied by 45
    	    let value = ALPHA_NUM_CHARS.indexOf(this.data[i]) * 45;

    	    // The character value of the second digit is added to the product
    	    value += ALPHA_NUM_CHARS.indexOf(this.data[i + 1]);

    	    // The sum is then stored as 11-bit binary number
    	    bitBuffer.put(value, 11);
    	  }

    	  // If the number of input data characters is not a multiple of two,
    	  // the character value of the final character is encoded as a 6-bit binary number.
    	  if (this.data.length % 2) {
    	    bitBuffer.put(ALPHA_NUM_CHARS.indexOf(this.data[i]), 6);
    	  }
    	};

    	alphanumericData = AlphanumericData;
    	return alphanumericData;
    }

    var byteData;
    var hasRequiredByteData;

    function requireByteData () {
    	if (hasRequiredByteData) return byteData;
    	hasRequiredByteData = 1;
    	const Mode = requireMode();

    	function ByteData (data) {
    	  this.mode = Mode.BYTE;
    	  if (typeof (data) === 'string') {
    	    this.data = new TextEncoder().encode(data);
    	  } else {
    	    this.data = new Uint8Array(data);
    	  }
    	}

    	ByteData.getBitsLength = function getBitsLength (length) {
    	  return length * 8
    	};

    	ByteData.prototype.getLength = function getLength () {
    	  return this.data.length
    	};

    	ByteData.prototype.getBitsLength = function getBitsLength () {
    	  return ByteData.getBitsLength(this.data.length)
    	};

    	ByteData.prototype.write = function (bitBuffer) {
    	  for (let i = 0, l = this.data.length; i < l; i++) {
    	    bitBuffer.put(this.data[i], 8);
    	  }
    	};

    	byteData = ByteData;
    	return byteData;
    }

    var kanjiData;
    var hasRequiredKanjiData;

    function requireKanjiData () {
    	if (hasRequiredKanjiData) return kanjiData;
    	hasRequiredKanjiData = 1;
    	const Mode = requireMode();
    	const Utils = requireUtils$1();

    	function KanjiData (data) {
    	  this.mode = Mode.KANJI;
    	  this.data = data;
    	}

    	KanjiData.getBitsLength = function getBitsLength (length) {
    	  return length * 13
    	};

    	KanjiData.prototype.getLength = function getLength () {
    	  return this.data.length
    	};

    	KanjiData.prototype.getBitsLength = function getBitsLength () {
    	  return KanjiData.getBitsLength(this.data.length)
    	};

    	KanjiData.prototype.write = function (bitBuffer) {
    	  let i;

    	  // In the Shift JIS system, Kanji characters are represented by a two byte combination.
    	  // These byte values are shifted from the JIS X 0208 values.
    	  // JIS X 0208 gives details of the shift coded representation.
    	  for (i = 0; i < this.data.length; i++) {
    	    let value = Utils.toSJIS(this.data[i]);

    	    // For characters with Shift JIS values from 0x8140 to 0x9FFC:
    	    if (value >= 0x8140 && value <= 0x9FFC) {
    	      // Subtract 0x8140 from Shift JIS value
    	      value -= 0x8140;

    	    // For characters with Shift JIS values from 0xE040 to 0xEBBF
    	    } else if (value >= 0xE040 && value <= 0xEBBF) {
    	      // Subtract 0xC140 from Shift JIS value
    	      value -= 0xC140;
    	    } else {
    	      throw new Error(
    	        'Invalid SJIS character: ' + this.data[i] + '\n' +
    	        'Make sure your charset is UTF-8')
    	    }

    	    // Multiply most significant byte of result by 0xC0
    	    // and add least significant byte to product
    	    value = (((value >>> 8) & 0xff) * 0xC0) + (value & 0xff);

    	    // Convert result to a 13-bit binary string
    	    bitBuffer.put(value, 13);
    	  }
    	};

    	kanjiData = KanjiData;
    	return kanjiData;
    }

    var dijkstra = {exports: {}};

    var hasRequiredDijkstra;

    function requireDijkstra () {
    	if (hasRequiredDijkstra) return dijkstra.exports;
    	hasRequiredDijkstra = 1;
    	(function (module) {

    		/******************************************************************************
    		 * Created 2008-08-19.
    		 *
    		 * Dijkstra path-finding functions. Adapted from the Dijkstar Python project.
    		 *
    		 * Copyright (C) 2008
    		 *   Wyatt Baldwin <self@wyattbaldwin.com>
    		 *   All rights reserved
    		 *
    		 * Licensed under the MIT license.
    		 *
    		 *   http://www.opensource.org/licenses/mit-license.php
    		 *
    		 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
    		 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
    		 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
    		 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
    		 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
    		 * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
    		 * THE SOFTWARE.
    		 *****************************************************************************/
    		var dijkstra = {
    		  single_source_shortest_paths: function(graph, s, d) {
    		    // Predecessor map for each node that has been encountered.
    		    // node ID => predecessor node ID
    		    var predecessors = {};

    		    // Costs of shortest paths from s to all nodes encountered.
    		    // node ID => cost
    		    var costs = {};
    		    costs[s] = 0;

    		    // Costs of shortest paths from s to all nodes encountered; differs from
    		    // `costs` in that it provides easy access to the node that currently has
    		    // the known shortest path from s.
    		    // XXX: Do we actually need both `costs` and `open`?
    		    var open = dijkstra.PriorityQueue.make();
    		    open.push(s, 0);

    		    var closest,
    		        u, v,
    		        cost_of_s_to_u,
    		        adjacent_nodes,
    		        cost_of_e,
    		        cost_of_s_to_u_plus_cost_of_e,
    		        cost_of_s_to_v,
    		        first_visit;
    		    while (!open.empty()) {
    		      // In the nodes remaining in graph that have a known cost from s,
    		      // find the node, u, that currently has the shortest path from s.
    		      closest = open.pop();
    		      u = closest.value;
    		      cost_of_s_to_u = closest.cost;

    		      // Get nodes adjacent to u...
    		      adjacent_nodes = graph[u] || {};

    		      // ...and explore the edges that connect u to those nodes, updating
    		      // the cost of the shortest paths to any or all of those nodes as
    		      // necessary. v is the node across the current edge from u.
    		      for (v in adjacent_nodes) {
    		        if (adjacent_nodes.hasOwnProperty(v)) {
    		          // Get the cost of the edge running from u to v.
    		          cost_of_e = adjacent_nodes[v];

    		          // Cost of s to u plus the cost of u to v across e--this is *a*
    		          // cost from s to v that may or may not be less than the current
    		          // known cost to v.
    		          cost_of_s_to_u_plus_cost_of_e = cost_of_s_to_u + cost_of_e;

    		          // If we haven't visited v yet OR if the current known cost from s to
    		          // v is greater than the new cost we just found (cost of s to u plus
    		          // cost of u to v across e), update v's cost in the cost list and
    		          // update v's predecessor in the predecessor list (it's now u).
    		          cost_of_s_to_v = costs[v];
    		          first_visit = (typeof costs[v] === 'undefined');
    		          if (first_visit || cost_of_s_to_v > cost_of_s_to_u_plus_cost_of_e) {
    		            costs[v] = cost_of_s_to_u_plus_cost_of_e;
    		            open.push(v, cost_of_s_to_u_plus_cost_of_e);
    		            predecessors[v] = u;
    		          }
    		        }
    		      }
    		    }

    		    if (typeof d !== 'undefined' && typeof costs[d] === 'undefined') {
    		      var msg = ['Could not find a path from ', s, ' to ', d, '.'].join('');
    		      throw new Error(msg);
    		    }

    		    return predecessors;
    		  },

    		  extract_shortest_path_from_predecessor_list: function(predecessors, d) {
    		    var nodes = [];
    		    var u = d;
    		    while (u) {
    		      nodes.push(u);
    		      predecessors[u];
    		      u = predecessors[u];
    		    }
    		    nodes.reverse();
    		    return nodes;
    		  },

    		  find_path: function(graph, s, d) {
    		    var predecessors = dijkstra.single_source_shortest_paths(graph, s, d);
    		    return dijkstra.extract_shortest_path_from_predecessor_list(
    		      predecessors, d);
    		  },

    		  /**
    		   * A very naive priority queue implementation.
    		   */
    		  PriorityQueue: {
    		    make: function (opts) {
    		      var T = dijkstra.PriorityQueue,
    		          t = {},
    		          key;
    		      opts = opts || {};
    		      for (key in T) {
    		        if (T.hasOwnProperty(key)) {
    		          t[key] = T[key];
    		        }
    		      }
    		      t.queue = [];
    		      t.sorter = opts.sorter || T.default_sorter;
    		      return t;
    		    },

    		    default_sorter: function (a, b) {
    		      return a.cost - b.cost;
    		    },

    		    /**
    		     * Add a new item to the queue and ensure the highest priority element
    		     * is at the front of the queue.
    		     */
    		    push: function (value, cost) {
    		      var item = {value: value, cost: cost};
    		      this.queue.push(item);
    		      this.queue.sort(this.sorter);
    		    },

    		    /**
    		     * Return the highest priority element in the queue.
    		     */
    		    pop: function () {
    		      return this.queue.shift();
    		    },

    		    empty: function () {
    		      return this.queue.length === 0;
    		    }
    		  }
    		};


    		// node.js module exports
    		{
    		  module.exports = dijkstra;
    		} 
    	} (dijkstra));
    	return dijkstra.exports;
    }

    var hasRequiredSegments;

    function requireSegments () {
    	if (hasRequiredSegments) return segments;
    	hasRequiredSegments = 1;
    	(function (exports) {
    		const Mode = requireMode();
    		const NumericData = requireNumericData();
    		const AlphanumericData = requireAlphanumericData();
    		const ByteData = requireByteData();
    		const KanjiData = requireKanjiData();
    		const Regex = requireRegex();
    		const Utils = requireUtils$1();
    		const dijkstra = requireDijkstra();

    		/**
    		 * Returns UTF8 byte length
    		 *
    		 * @param  {String} str Input string
    		 * @return {Number}     Number of byte
    		 */
    		function getStringByteLength (str) {
    		  return unescape(encodeURIComponent(str)).length
    		}

    		/**
    		 * Get a list of segments of the specified mode
    		 * from a string
    		 *
    		 * @param  {Mode}   mode Segment mode
    		 * @param  {String} str  String to process
    		 * @return {Array}       Array of object with segments data
    		 */
    		function getSegments (regex, mode, str) {
    		  const segments = [];
    		  let result;

    		  while ((result = regex.exec(str)) !== null) {
    		    segments.push({
    		      data: result[0],
    		      index: result.index,
    		      mode: mode,
    		      length: result[0].length
    		    });
    		  }

    		  return segments
    		}

    		/**
    		 * Extracts a series of segments with the appropriate
    		 * modes from a string
    		 *
    		 * @param  {String} dataStr Input string
    		 * @return {Array}          Array of object with segments data
    		 */
    		function getSegmentsFromString (dataStr) {
    		  const numSegs = getSegments(Regex.NUMERIC, Mode.NUMERIC, dataStr);
    		  const alphaNumSegs = getSegments(Regex.ALPHANUMERIC, Mode.ALPHANUMERIC, dataStr);
    		  let byteSegs;
    		  let kanjiSegs;

    		  if (Utils.isKanjiModeEnabled()) {
    		    byteSegs = getSegments(Regex.BYTE, Mode.BYTE, dataStr);
    		    kanjiSegs = getSegments(Regex.KANJI, Mode.KANJI, dataStr);
    		  } else {
    		    byteSegs = getSegments(Regex.BYTE_KANJI, Mode.BYTE, dataStr);
    		    kanjiSegs = [];
    		  }

    		  const segs = numSegs.concat(alphaNumSegs, byteSegs, kanjiSegs);

    		  return segs
    		    .sort(function (s1, s2) {
    		      return s1.index - s2.index
    		    })
    		    .map(function (obj) {
    		      return {
    		        data: obj.data,
    		        mode: obj.mode,
    		        length: obj.length
    		      }
    		    })
    		}

    		/**
    		 * Returns how many bits are needed to encode a string of
    		 * specified length with the specified mode
    		 *
    		 * @param  {Number} length String length
    		 * @param  {Mode} mode     Segment mode
    		 * @return {Number}        Bit length
    		 */
    		function getSegmentBitsLength (length, mode) {
    		  switch (mode) {
    		    case Mode.NUMERIC:
    		      return NumericData.getBitsLength(length)
    		    case Mode.ALPHANUMERIC:
    		      return AlphanumericData.getBitsLength(length)
    		    case Mode.KANJI:
    		      return KanjiData.getBitsLength(length)
    		    case Mode.BYTE:
    		      return ByteData.getBitsLength(length)
    		  }
    		}

    		/**
    		 * Merges adjacent segments which have the same mode
    		 *
    		 * @param  {Array} segs Array of object with segments data
    		 * @return {Array}      Array of object with segments data
    		 */
    		function mergeSegments (segs) {
    		  return segs.reduce(function (acc, curr) {
    		    const prevSeg = acc.length - 1 >= 0 ? acc[acc.length - 1] : null;
    		    if (prevSeg && prevSeg.mode === curr.mode) {
    		      acc[acc.length - 1].data += curr.data;
    		      return acc
    		    }

    		    acc.push(curr);
    		    return acc
    		  }, [])
    		}

    		/**
    		 * Generates a list of all possible nodes combination which
    		 * will be used to build a segments graph.
    		 *
    		 * Nodes are divided by groups. Each group will contain a list of all the modes
    		 * in which is possible to encode the given text.
    		 *
    		 * For example the text '12345' can be encoded as Numeric, Alphanumeric or Byte.
    		 * The group for '12345' will contain then 3 objects, one for each
    		 * possible encoding mode.
    		 *
    		 * Each node represents a possible segment.
    		 *
    		 * @param  {Array} segs Array of object with segments data
    		 * @return {Array}      Array of object with segments data
    		 */
    		function buildNodes (segs) {
    		  const nodes = [];
    		  for (let i = 0; i < segs.length; i++) {
    		    const seg = segs[i];

    		    switch (seg.mode) {
    		      case Mode.NUMERIC:
    		        nodes.push([seg,
    		          { data: seg.data, mode: Mode.ALPHANUMERIC, length: seg.length },
    		          { data: seg.data, mode: Mode.BYTE, length: seg.length }
    		        ]);
    		        break
    		      case Mode.ALPHANUMERIC:
    		        nodes.push([seg,
    		          { data: seg.data, mode: Mode.BYTE, length: seg.length }
    		        ]);
    		        break
    		      case Mode.KANJI:
    		        nodes.push([seg,
    		          { data: seg.data, mode: Mode.BYTE, length: getStringByteLength(seg.data) }
    		        ]);
    		        break
    		      case Mode.BYTE:
    		        nodes.push([
    		          { data: seg.data, mode: Mode.BYTE, length: getStringByteLength(seg.data) }
    		        ]);
    		    }
    		  }

    		  return nodes
    		}

    		/**
    		 * Builds a graph from a list of nodes.
    		 * All segments in each node group will be connected with all the segments of
    		 * the next group and so on.
    		 *
    		 * At each connection will be assigned a weight depending on the
    		 * segment's byte length.
    		 *
    		 * @param  {Array} nodes    Array of object with segments data
    		 * @param  {Number} version QR Code version
    		 * @return {Object}         Graph of all possible segments
    		 */
    		function buildGraph (nodes, version) {
    		  const table = {};
    		  const graph = { start: {} };
    		  let prevNodeIds = ['start'];

    		  for (let i = 0; i < nodes.length; i++) {
    		    const nodeGroup = nodes[i];
    		    const currentNodeIds = [];

    		    for (let j = 0; j < nodeGroup.length; j++) {
    		      const node = nodeGroup[j];
    		      const key = '' + i + j;

    		      currentNodeIds.push(key);
    		      table[key] = { node: node, lastCount: 0 };
    		      graph[key] = {};

    		      for (let n = 0; n < prevNodeIds.length; n++) {
    		        const prevNodeId = prevNodeIds[n];

    		        if (table[prevNodeId] && table[prevNodeId].node.mode === node.mode) {
    		          graph[prevNodeId][key] =
    		            getSegmentBitsLength(table[prevNodeId].lastCount + node.length, node.mode) -
    		            getSegmentBitsLength(table[prevNodeId].lastCount, node.mode);

    		          table[prevNodeId].lastCount += node.length;
    		        } else {
    		          if (table[prevNodeId]) table[prevNodeId].lastCount = node.length;

    		          graph[prevNodeId][key] = getSegmentBitsLength(node.length, node.mode) +
    		            4 + Mode.getCharCountIndicator(node.mode, version); // switch cost
    		        }
    		      }
    		    }

    		    prevNodeIds = currentNodeIds;
    		  }

    		  for (let n = 0; n < prevNodeIds.length; n++) {
    		    graph[prevNodeIds[n]].end = 0;
    		  }

    		  return { map: graph, table: table }
    		}

    		/**
    		 * Builds a segment from a specified data and mode.
    		 * If a mode is not specified, the more suitable will be used.
    		 *
    		 * @param  {String} data             Input data
    		 * @param  {Mode | String} modesHint Data mode
    		 * @return {Segment}                 Segment
    		 */
    		function buildSingleSegment (data, modesHint) {
    		  let mode;
    		  const bestMode = Mode.getBestModeForData(data);

    		  mode = Mode.from(modesHint, bestMode);

    		  // Make sure data can be encoded
    		  if (mode !== Mode.BYTE && mode.bit < bestMode.bit) {
    		    throw new Error('"' + data + '"' +
    		      ' cannot be encoded with mode ' + Mode.toString(mode) +
    		      '.\n Suggested mode is: ' + Mode.toString(bestMode))
    		  }

    		  // Use Mode.BYTE if Kanji support is disabled
    		  if (mode === Mode.KANJI && !Utils.isKanjiModeEnabled()) {
    		    mode = Mode.BYTE;
    		  }

    		  switch (mode) {
    		    case Mode.NUMERIC:
    		      return new NumericData(data)

    		    case Mode.ALPHANUMERIC:
    		      return new AlphanumericData(data)

    		    case Mode.KANJI:
    		      return new KanjiData(data)

    		    case Mode.BYTE:
    		      return new ByteData(data)
    		  }
    		}

    		/**
    		 * Builds a list of segments from an array.
    		 * Array can contain Strings or Objects with segment's info.
    		 *
    		 * For each item which is a string, will be generated a segment with the given
    		 * string and the more appropriate encoding mode.
    		 *
    		 * For each item which is an object, will be generated a segment with the given
    		 * data and mode.
    		 * Objects must contain at least the property "data".
    		 * If property "mode" is not present, the more suitable mode will be used.
    		 *
    		 * @param  {Array} array Array of objects with segments data
    		 * @return {Array}       Array of Segments
    		 */
    		exports.fromArray = function fromArray (array) {
    		  return array.reduce(function (acc, seg) {
    		    if (typeof seg === 'string') {
    		      acc.push(buildSingleSegment(seg, null));
    		    } else if (seg.data) {
    		      acc.push(buildSingleSegment(seg.data, seg.mode));
    		    }

    		    return acc
    		  }, [])
    		};

    		/**
    		 * Builds an optimized sequence of segments from a string,
    		 * which will produce the shortest possible bitstream.
    		 *
    		 * @param  {String} data    Input string
    		 * @param  {Number} version QR Code version
    		 * @return {Array}          Array of segments
    		 */
    		exports.fromString = function fromString (data, version) {
    		  const segs = getSegmentsFromString(data, Utils.isKanjiModeEnabled());

    		  const nodes = buildNodes(segs);
    		  const graph = buildGraph(nodes, version);
    		  const path = dijkstra.find_path(graph.map, 'start', 'end');

    		  const optimizedSegs = [];
    		  for (let i = 1; i < path.length - 1; i++) {
    		    optimizedSegs.push(graph.table[path[i]].node);
    		  }

    		  return exports.fromArray(mergeSegments(optimizedSegs))
    		};

    		/**
    		 * Splits a string in various segments with the modes which
    		 * best represent their content.
    		 * The produced segments are far from being optimized.
    		 * The output of this function is only used to estimate a QR Code version
    		 * which may contain the data.
    		 *
    		 * @param  {string} data Input string
    		 * @return {Array}       Array of segments
    		 */
    		exports.rawSplit = function rawSplit (data) {
    		  return exports.fromArray(
    		    getSegmentsFromString(data, Utils.isKanjiModeEnabled())
    		  )
    		}; 
    	} (segments));
    	return segments;
    }

    var hasRequiredQrcode;

    function requireQrcode () {
    	if (hasRequiredQrcode) return qrcode;
    	hasRequiredQrcode = 1;
    	const Utils = requireUtils$1();
    	const ECLevel = requireErrorCorrectionLevel();
    	const BitBuffer = requireBitBuffer();
    	const BitMatrix = requireBitMatrix();
    	const AlignmentPattern = requireAlignmentPattern();
    	const FinderPattern = requireFinderPattern();
    	const MaskPattern = requireMaskPattern();
    	const ECCode = requireErrorCorrectionCode();
    	const ReedSolomonEncoder = requireReedSolomonEncoder();
    	const Version = requireVersion();
    	const FormatInfo = requireFormatInfo();
    	const Mode = requireMode();
    	const Segments = requireSegments();

    	/**
    	 * QRCode for JavaScript
    	 *
    	 * modified by Ryan Day for nodejs support
    	 * Copyright (c) 2011 Ryan Day
    	 *
    	 * Licensed under the MIT license:
    	 *   http://www.opensource.org/licenses/mit-license.php
    	 *
    	//---------------------------------------------------------------------
    	// QRCode for JavaScript
    	//
    	// Copyright (c) 2009 Kazuhiko Arase
    	//
    	// URL: http://www.d-project.com/
    	//
    	// Licensed under the MIT license:
    	//   http://www.opensource.org/licenses/mit-license.php
    	//
    	// The word "QR Code" is registered trademark of
    	// DENSO WAVE INCORPORATED
    	//   http://www.denso-wave.com/qrcode/faqpatent-e.html
    	//
    	//---------------------------------------------------------------------
    	*/

    	/**
    	 * Add finder patterns bits to matrix
    	 *
    	 * @param  {BitMatrix} matrix  Modules matrix
    	 * @param  {Number}    version QR Code version
    	 */
    	function setupFinderPattern (matrix, version) {
    	  const size = matrix.size;
    	  const pos = FinderPattern.getPositions(version);

    	  for (let i = 0; i < pos.length; i++) {
    	    const row = pos[i][0];
    	    const col = pos[i][1];

    	    for (let r = -1; r <= 7; r++) {
    	      if (row + r <= -1 || size <= row + r) continue

    	      for (let c = -1; c <= 7; c++) {
    	        if (col + c <= -1 || size <= col + c) continue

    	        if ((r >= 0 && r <= 6 && (c === 0 || c === 6)) ||
    	          (c >= 0 && c <= 6 && (r === 0 || r === 6)) ||
    	          (r >= 2 && r <= 4 && c >= 2 && c <= 4)) {
    	          matrix.set(row + r, col + c, true, true);
    	        } else {
    	          matrix.set(row + r, col + c, false, true);
    	        }
    	      }
    	    }
    	  }
    	}

    	/**
    	 * Add timing pattern bits to matrix
    	 *
    	 * Note: this function must be called before {@link setupAlignmentPattern}
    	 *
    	 * @param  {BitMatrix} matrix Modules matrix
    	 */
    	function setupTimingPattern (matrix) {
    	  const size = matrix.size;

    	  for (let r = 8; r < size - 8; r++) {
    	    const value = r % 2 === 0;
    	    matrix.set(r, 6, value, true);
    	    matrix.set(6, r, value, true);
    	  }
    	}

    	/**
    	 * Add alignment patterns bits to matrix
    	 *
    	 * Note: this function must be called after {@link setupTimingPattern}
    	 *
    	 * @param  {BitMatrix} matrix  Modules matrix
    	 * @param  {Number}    version QR Code version
    	 */
    	function setupAlignmentPattern (matrix, version) {
    	  const pos = AlignmentPattern.getPositions(version);

    	  for (let i = 0; i < pos.length; i++) {
    	    const row = pos[i][0];
    	    const col = pos[i][1];

    	    for (let r = -2; r <= 2; r++) {
    	      for (let c = -2; c <= 2; c++) {
    	        if (r === -2 || r === 2 || c === -2 || c === 2 ||
    	          (r === 0 && c === 0)) {
    	          matrix.set(row + r, col + c, true, true);
    	        } else {
    	          matrix.set(row + r, col + c, false, true);
    	        }
    	      }
    	    }
    	  }
    	}

    	/**
    	 * Add version info bits to matrix
    	 *
    	 * @param  {BitMatrix} matrix  Modules matrix
    	 * @param  {Number}    version QR Code version
    	 */
    	function setupVersionInfo (matrix, version) {
    	  const size = matrix.size;
    	  const bits = Version.getEncodedBits(version);
    	  let row, col, mod;

    	  for (let i = 0; i < 18; i++) {
    	    row = Math.floor(i / 3);
    	    col = i % 3 + size - 8 - 3;
    	    mod = ((bits >> i) & 1) === 1;

    	    matrix.set(row, col, mod, true);
    	    matrix.set(col, row, mod, true);
    	  }
    	}

    	/**
    	 * Add format info bits to matrix
    	 *
    	 * @param  {BitMatrix} matrix               Modules matrix
    	 * @param  {ErrorCorrectionLevel}    errorCorrectionLevel Error correction level
    	 * @param  {Number}    maskPattern          Mask pattern reference value
    	 */
    	function setupFormatInfo (matrix, errorCorrectionLevel, maskPattern) {
    	  const size = matrix.size;
    	  const bits = FormatInfo.getEncodedBits(errorCorrectionLevel, maskPattern);
    	  let i, mod;

    	  for (i = 0; i < 15; i++) {
    	    mod = ((bits >> i) & 1) === 1;

    	    // vertical
    	    if (i < 6) {
    	      matrix.set(i, 8, mod, true);
    	    } else if (i < 8) {
    	      matrix.set(i + 1, 8, mod, true);
    	    } else {
    	      matrix.set(size - 15 + i, 8, mod, true);
    	    }

    	    // horizontal
    	    if (i < 8) {
    	      matrix.set(8, size - i - 1, mod, true);
    	    } else if (i < 9) {
    	      matrix.set(8, 15 - i - 1 + 1, mod, true);
    	    } else {
    	      matrix.set(8, 15 - i - 1, mod, true);
    	    }
    	  }

    	  // fixed module
    	  matrix.set(size - 8, 8, 1, true);
    	}

    	/**
    	 * Add encoded data bits to matrix
    	 *
    	 * @param  {BitMatrix}  matrix Modules matrix
    	 * @param  {Uint8Array} data   Data codewords
    	 */
    	function setupData (matrix, data) {
    	  const size = matrix.size;
    	  let inc = -1;
    	  let row = size - 1;
    	  let bitIndex = 7;
    	  let byteIndex = 0;

    	  for (let col = size - 1; col > 0; col -= 2) {
    	    if (col === 6) col--;

    	    while (true) {
    	      for (let c = 0; c < 2; c++) {
    	        if (!matrix.isReserved(row, col - c)) {
    	          let dark = false;

    	          if (byteIndex < data.length) {
    	            dark = (((data[byteIndex] >>> bitIndex) & 1) === 1);
    	          }

    	          matrix.set(row, col - c, dark);
    	          bitIndex--;

    	          if (bitIndex === -1) {
    	            byteIndex++;
    	            bitIndex = 7;
    	          }
    	        }
    	      }

    	      row += inc;

    	      if (row < 0 || size <= row) {
    	        row -= inc;
    	        inc = -inc;
    	        break
    	      }
    	    }
    	  }
    	}

    	/**
    	 * Create encoded codewords from data input
    	 *
    	 * @param  {Number}   version              QR Code version
    	 * @param  {ErrorCorrectionLevel}   errorCorrectionLevel Error correction level
    	 * @param  {ByteData} data                 Data input
    	 * @return {Uint8Array}                    Buffer containing encoded codewords
    	 */
    	function createData (version, errorCorrectionLevel, segments) {
    	  // Prepare data buffer
    	  const buffer = new BitBuffer();

    	  segments.forEach(function (data) {
    	    // prefix data with mode indicator (4 bits)
    	    buffer.put(data.mode.bit, 4);

    	    // Prefix data with character count indicator.
    	    // The character count indicator is a string of bits that represents the
    	    // number of characters that are being encoded.
    	    // The character count indicator must be placed after the mode indicator
    	    // and must be a certain number of bits long, depending on the QR version
    	    // and data mode
    	    // @see {@link Mode.getCharCountIndicator}.
    	    buffer.put(data.getLength(), Mode.getCharCountIndicator(data.mode, version));

    	    // add binary data sequence to buffer
    	    data.write(buffer);
    	  });

    	  // Calculate required number of bits
    	  const totalCodewords = Utils.getSymbolTotalCodewords(version);
    	  const ecTotalCodewords = ECCode.getTotalCodewordsCount(version, errorCorrectionLevel);
    	  const dataTotalCodewordsBits = (totalCodewords - ecTotalCodewords) * 8;

    	  // Add a terminator.
    	  // If the bit string is shorter than the total number of required bits,
    	  // a terminator of up to four 0s must be added to the right side of the string.
    	  // If the bit string is more than four bits shorter than the required number of bits,
    	  // add four 0s to the end.
    	  if (buffer.getLengthInBits() + 4 <= dataTotalCodewordsBits) {
    	    buffer.put(0, 4);
    	  }

    	  // If the bit string is fewer than four bits shorter, add only the number of 0s that
    	  // are needed to reach the required number of bits.

    	  // After adding the terminator, if the number of bits in the string is not a multiple of 8,
    	  // pad the string on the right with 0s to make the string's length a multiple of 8.
    	  while (buffer.getLengthInBits() % 8 !== 0) {
    	    buffer.putBit(0);
    	  }

    	  // Add pad bytes if the string is still shorter than the total number of required bits.
    	  // Extend the buffer to fill the data capacity of the symbol corresponding to
    	  // the Version and Error Correction Level by adding the Pad Codewords 11101100 (0xEC)
    	  // and 00010001 (0x11) alternately.
    	  const remainingByte = (dataTotalCodewordsBits - buffer.getLengthInBits()) / 8;
    	  for (let i = 0; i < remainingByte; i++) {
    	    buffer.put(i % 2 ? 0x11 : 0xEC, 8);
    	  }

    	  return createCodewords(buffer, version, errorCorrectionLevel)
    	}

    	/**
    	 * Encode input data with Reed-Solomon and return codewords with
    	 * relative error correction bits
    	 *
    	 * @param  {BitBuffer} bitBuffer            Data to encode
    	 * @param  {Number}    version              QR Code version
    	 * @param  {ErrorCorrectionLevel} errorCorrectionLevel Error correction level
    	 * @return {Uint8Array}                     Buffer containing encoded codewords
    	 */
    	function createCodewords (bitBuffer, version, errorCorrectionLevel) {
    	  // Total codewords for this QR code version (Data + Error correction)
    	  const totalCodewords = Utils.getSymbolTotalCodewords(version);

    	  // Total number of error correction codewords
    	  const ecTotalCodewords = ECCode.getTotalCodewordsCount(version, errorCorrectionLevel);

    	  // Total number of data codewords
    	  const dataTotalCodewords = totalCodewords - ecTotalCodewords;

    	  // Total number of blocks
    	  const ecTotalBlocks = ECCode.getBlocksCount(version, errorCorrectionLevel);

    	  // Calculate how many blocks each group should contain
    	  const blocksInGroup2 = totalCodewords % ecTotalBlocks;
    	  const blocksInGroup1 = ecTotalBlocks - blocksInGroup2;

    	  const totalCodewordsInGroup1 = Math.floor(totalCodewords / ecTotalBlocks);

    	  const dataCodewordsInGroup1 = Math.floor(dataTotalCodewords / ecTotalBlocks);
    	  const dataCodewordsInGroup2 = dataCodewordsInGroup1 + 1;

    	  // Number of EC codewords is the same for both groups
    	  const ecCount = totalCodewordsInGroup1 - dataCodewordsInGroup1;

    	  // Initialize a Reed-Solomon encoder with a generator polynomial of degree ecCount
    	  const rs = new ReedSolomonEncoder(ecCount);

    	  let offset = 0;
    	  const dcData = new Array(ecTotalBlocks);
    	  const ecData = new Array(ecTotalBlocks);
    	  let maxDataSize = 0;
    	  const buffer = new Uint8Array(bitBuffer.buffer);

    	  // Divide the buffer into the required number of blocks
    	  for (let b = 0; b < ecTotalBlocks; b++) {
    	    const dataSize = b < blocksInGroup1 ? dataCodewordsInGroup1 : dataCodewordsInGroup2;

    	    // extract a block of data from buffer
    	    dcData[b] = buffer.slice(offset, offset + dataSize);

    	    // Calculate EC codewords for this data block
    	    ecData[b] = rs.encode(dcData[b]);

    	    offset += dataSize;
    	    maxDataSize = Math.max(maxDataSize, dataSize);
    	  }

    	  // Create final data
    	  // Interleave the data and error correction codewords from each block
    	  const data = new Uint8Array(totalCodewords);
    	  let index = 0;
    	  let i, r;

    	  // Add data codewords
    	  for (i = 0; i < maxDataSize; i++) {
    	    for (r = 0; r < ecTotalBlocks; r++) {
    	      if (i < dcData[r].length) {
    	        data[index++] = dcData[r][i];
    	      }
    	    }
    	  }

    	  // Apped EC codewords
    	  for (i = 0; i < ecCount; i++) {
    	    for (r = 0; r < ecTotalBlocks; r++) {
    	      data[index++] = ecData[r][i];
    	    }
    	  }

    	  return data
    	}

    	/**
    	 * Build QR Code symbol
    	 *
    	 * @param  {String} data                 Input string
    	 * @param  {Number} version              QR Code version
    	 * @param  {ErrorCorretionLevel} errorCorrectionLevel Error level
    	 * @param  {MaskPattern} maskPattern     Mask pattern
    	 * @return {Object}                      Object containing symbol data
    	 */
    	function createSymbol (data, version, errorCorrectionLevel, maskPattern) {
    	  let segments;

    	  if (Array.isArray(data)) {
    	    segments = Segments.fromArray(data);
    	  } else if (typeof data === 'string') {
    	    let estimatedVersion = version;

    	    if (!estimatedVersion) {
    	      const rawSegments = Segments.rawSplit(data);

    	      // Estimate best version that can contain raw splitted segments
    	      estimatedVersion = Version.getBestVersionForData(rawSegments, errorCorrectionLevel);
    	    }

    	    // Build optimized segments
    	    // If estimated version is undefined, try with the highest version
    	    segments = Segments.fromString(data, estimatedVersion || 40);
    	  } else {
    	    throw new Error('Invalid data')
    	  }

    	  // Get the min version that can contain data
    	  const bestVersion = Version.getBestVersionForData(segments, errorCorrectionLevel);

    	  // If no version is found, data cannot be stored
    	  if (!bestVersion) {
    	    throw new Error('The amount of data is too big to be stored in a QR Code')
    	  }

    	  // If not specified, use min version as default
    	  if (!version) {
    	    version = bestVersion;

    	  // Check if the specified version can contain the data
    	  } else if (version < bestVersion) {
    	    throw new Error('\n' +
    	      'The chosen QR Code version cannot contain this amount of data.\n' +
    	      'Minimum version required to store current data is: ' + bestVersion + '.\n'
    	    )
    	  }

    	  const dataBits = createData(version, errorCorrectionLevel, segments);

    	  // Allocate matrix buffer
    	  const moduleCount = Utils.getSymbolSize(version);
    	  const modules = new BitMatrix(moduleCount);

    	  // Add function modules
    	  setupFinderPattern(modules, version);
    	  setupTimingPattern(modules);
    	  setupAlignmentPattern(modules, version);

    	  // Add temporary dummy bits for format info just to set them as reserved.
    	  // This is needed to prevent these bits from being masked by {@link MaskPattern.applyMask}
    	  // since the masking operation must be performed only on the encoding region.
    	  // These blocks will be replaced with correct values later in code.
    	  setupFormatInfo(modules, errorCorrectionLevel, 0);

    	  if (version >= 7) {
    	    setupVersionInfo(modules, version);
    	  }

    	  // Add data codewords
    	  setupData(modules, dataBits);

    	  if (isNaN(maskPattern)) {
    	    // Find best mask pattern
    	    maskPattern = MaskPattern.getBestMask(modules,
    	      setupFormatInfo.bind(null, modules, errorCorrectionLevel));
    	  }

    	  // Apply mask pattern
    	  MaskPattern.applyMask(maskPattern, modules);

    	  // Replace format info bits with correct values
    	  setupFormatInfo(modules, errorCorrectionLevel, maskPattern);

    	  return {
    	    modules: modules,
    	    version: version,
    	    errorCorrectionLevel: errorCorrectionLevel,
    	    maskPattern: maskPattern,
    	    segments: segments
    	  }
    	}

    	/**
    	 * QR Code
    	 *
    	 * @param {String | Array} data                 Input data
    	 * @param {Object} options                      Optional configurations
    	 * @param {Number} options.version              QR Code version
    	 * @param {String} options.errorCorrectionLevel Error correction level
    	 * @param {Function} options.toSJISFunc         Helper func to convert utf8 to sjis
    	 */
    	qrcode.create = function create (data, options) {
    	  if (typeof data === 'undefined' || data === '') {
    	    throw new Error('No input text')
    	  }

    	  let errorCorrectionLevel = ECLevel.M;
    	  let version;
    	  let mask;

    	  if (typeof options !== 'undefined') {
    	    // Use higher error correction level as default
    	    errorCorrectionLevel = ECLevel.from(options.errorCorrectionLevel, ECLevel.M);
    	    version = Version.from(options.version);
    	    mask = MaskPattern.from(options.maskPattern);

    	    if (options.toSJISFunc) {
    	      Utils.setToSJISFunction(options.toSJISFunc);
    	    }
    	  }

    	  return createSymbol(data, version, errorCorrectionLevel, mask)
    	};
    	return qrcode;
    }

    var canvas = {};

    var utils = {};

    var hasRequiredUtils;

    function requireUtils () {
    	if (hasRequiredUtils) return utils;
    	hasRequiredUtils = 1;
    	(function (exports) {
    		function hex2rgba (hex) {
    		  if (typeof hex === 'number') {
    		    hex = hex.toString();
    		  }

    		  if (typeof hex !== 'string') {
    		    throw new Error('Color should be defined as hex string')
    		  }

    		  let hexCode = hex.slice().replace('#', '').split('');
    		  if (hexCode.length < 3 || hexCode.length === 5 || hexCode.length > 8) {
    		    throw new Error('Invalid hex color: ' + hex)
    		  }

    		  // Convert from short to long form (fff -> ffffff)
    		  if (hexCode.length === 3 || hexCode.length === 4) {
    		    hexCode = Array.prototype.concat.apply([], hexCode.map(function (c) {
    		      return [c, c]
    		    }));
    		  }

    		  // Add default alpha value
    		  if (hexCode.length === 6) hexCode.push('F', 'F');

    		  const hexValue = parseInt(hexCode.join(''), 16);

    		  return {
    		    r: (hexValue >> 24) & 255,
    		    g: (hexValue >> 16) & 255,
    		    b: (hexValue >> 8) & 255,
    		    a: hexValue & 255,
    		    hex: '#' + hexCode.slice(0, 6).join('')
    		  }
    		}

    		exports.getOptions = function getOptions (options) {
    		  if (!options) options = {};
    		  if (!options.color) options.color = {};

    		  const margin = typeof options.margin === 'undefined' ||
    		    options.margin === null ||
    		    options.margin < 0
    		    ? 4
    		    : options.margin;

    		  const width = options.width && options.width >= 21 ? options.width : undefined;
    		  const scale = options.scale || 4;

    		  return {
    		    width: width,
    		    scale: width ? 4 : scale,
    		    margin: margin,
    		    color: {
    		      dark: hex2rgba(options.color.dark || '#000000ff'),
    		      light: hex2rgba(options.color.light || '#ffffffff')
    		    },
    		    type: options.type,
    		    rendererOpts: options.rendererOpts || {}
    		  }
    		};

    		exports.getScale = function getScale (qrSize, opts) {
    		  return opts.width && opts.width >= qrSize + opts.margin * 2
    		    ? opts.width / (qrSize + opts.margin * 2)
    		    : opts.scale
    		};

    		exports.getImageWidth = function getImageWidth (qrSize, opts) {
    		  const scale = exports.getScale(qrSize, opts);
    		  return Math.floor((qrSize + opts.margin * 2) * scale)
    		};

    		exports.qrToImageData = function qrToImageData (imgData, qr, opts) {
    		  const size = qr.modules.size;
    		  const data = qr.modules.data;
    		  const scale = exports.getScale(size, opts);
    		  const symbolSize = Math.floor((size + opts.margin * 2) * scale);
    		  const scaledMargin = opts.margin * scale;
    		  const palette = [opts.color.light, opts.color.dark];

    		  for (let i = 0; i < symbolSize; i++) {
    		    for (let j = 0; j < symbolSize; j++) {
    		      let posDst = (i * symbolSize + j) * 4;
    		      let pxColor = opts.color.light;

    		      if (i >= scaledMargin && j >= scaledMargin &&
    		        i < symbolSize - scaledMargin && j < symbolSize - scaledMargin) {
    		        const iSrc = Math.floor((i - scaledMargin) / scale);
    		        const jSrc = Math.floor((j - scaledMargin) / scale);
    		        pxColor = palette[data[iSrc * size + jSrc] ? 1 : 0];
    		      }

    		      imgData[posDst++] = pxColor.r;
    		      imgData[posDst++] = pxColor.g;
    		      imgData[posDst++] = pxColor.b;
    		      imgData[posDst] = pxColor.a;
    		    }
    		  }
    		}; 
    	} (utils));
    	return utils;
    }

    var hasRequiredCanvas;

    function requireCanvas () {
    	if (hasRequiredCanvas) return canvas;
    	hasRequiredCanvas = 1;
    	(function (exports) {
    		const Utils = requireUtils();

    		function clearCanvas (ctx, canvas, size) {
    		  ctx.clearRect(0, 0, canvas.width, canvas.height);

    		  if (!canvas.style) canvas.style = {};
    		  canvas.height = size;
    		  canvas.width = size;
    		  canvas.style.height = size + 'px';
    		  canvas.style.width = size + 'px';
    		}

    		function getCanvasElement () {
    		  try {
    		    return document.createElement('canvas')
    		  } catch (e) {
    		    throw new Error('You need to specify a canvas element')
    		  }
    		}

    		exports.render = function render (qrData, canvas, options) {
    		  let opts = options;
    		  let canvasEl = canvas;

    		  if (typeof opts === 'undefined' && (!canvas || !canvas.getContext)) {
    		    opts = canvas;
    		    canvas = undefined;
    		  }

    		  if (!canvas) {
    		    canvasEl = getCanvasElement();
    		  }

    		  opts = Utils.getOptions(opts);
    		  const size = Utils.getImageWidth(qrData.modules.size, opts);

    		  const ctx = canvasEl.getContext('2d');
    		  const image = ctx.createImageData(size, size);
    		  Utils.qrToImageData(image.data, qrData, opts);

    		  clearCanvas(ctx, canvasEl, size);
    		  ctx.putImageData(image, 0, 0);

    		  return canvasEl
    		};

    		exports.renderToDataURL = function renderToDataURL (qrData, canvas, options) {
    		  let opts = options;

    		  if (typeof opts === 'undefined' && (!canvas || !canvas.getContext)) {
    		    opts = canvas;
    		    canvas = undefined;
    		  }

    		  if (!opts) opts = {};

    		  const canvasEl = exports.render(qrData, canvas, opts);

    		  const type = opts.type || 'image/png';
    		  const rendererOpts = opts.rendererOpts || {};

    		  return canvasEl.toDataURL(type, rendererOpts.quality)
    		}; 
    	} (canvas));
    	return canvas;
    }

    var svgTag = {};

    var hasRequiredSvgTag;

    function requireSvgTag () {
    	if (hasRequiredSvgTag) return svgTag;
    	hasRequiredSvgTag = 1;
    	const Utils = requireUtils();

    	function getColorAttrib (color, attrib) {
    	  const alpha = color.a / 255;
    	  const str = attrib + '="' + color.hex + '"';

    	  return alpha < 1
    	    ? str + ' ' + attrib + '-opacity="' + alpha.toFixed(2).slice(1) + '"'
    	    : str
    	}

    	function svgCmd (cmd, x, y) {
    	  let str = cmd + x;
    	  if (typeof y !== 'undefined') str += ' ' + y;

    	  return str
    	}

    	function qrToPath (data, size, margin) {
    	  let path = '';
    	  let moveBy = 0;
    	  let newRow = false;
    	  let lineLength = 0;

    	  for (let i = 0; i < data.length; i++) {
    	    const col = Math.floor(i % size);
    	    const row = Math.floor(i / size);

    	    if (!col && !newRow) newRow = true;

    	    if (data[i]) {
    	      lineLength++;

    	      if (!(i > 0 && col > 0 && data[i - 1])) {
    	        path += newRow
    	          ? svgCmd('M', col + margin, 0.5 + row + margin)
    	          : svgCmd('m', moveBy, 0);

    	        moveBy = 0;
    	        newRow = false;
    	      }

    	      if (!(col + 1 < size && data[i + 1])) {
    	        path += svgCmd('h', lineLength);
    	        lineLength = 0;
    	      }
    	    } else {
    	      moveBy++;
    	    }
    	  }

    	  return path
    	}

    	svgTag.render = function render (qrData, options, cb) {
    	  const opts = Utils.getOptions(options);
    	  const size = qrData.modules.size;
    	  const data = qrData.modules.data;
    	  const qrcodesize = size + opts.margin * 2;

    	  const bg = !opts.color.light.a
    	    ? ''
    	    : '<path ' + getColorAttrib(opts.color.light, 'fill') +
    	      ' d="M0 0h' + qrcodesize + 'v' + qrcodesize + 'H0z"/>';

    	  const path =
    	    '<path ' + getColorAttrib(opts.color.dark, 'stroke') +
    	    ' d="' + qrToPath(data, size, opts.margin) + '"/>';

    	  const viewBox = 'viewBox="' + '0 0 ' + qrcodesize + ' ' + qrcodesize + '"';

    	  const width = !opts.width ? '' : 'width="' + opts.width + '" height="' + opts.width + '" ';

    	  const svgTag = '<svg xmlns="http://www.w3.org/2000/svg" ' + width + viewBox + ' shape-rendering="crispEdges">' + bg + path + '</svg>\n';

    	  if (typeof cb === 'function') {
    	    cb(null, svgTag);
    	  }

    	  return svgTag
    	};
    	return svgTag;
    }

    var hasRequiredBrowser;

    function requireBrowser () {
    	if (hasRequiredBrowser) return browser;
    	hasRequiredBrowser = 1;
    	const canPromise = requireCanPromise();

    	const QRCode = requireQrcode();
    	const CanvasRenderer = requireCanvas();
    	const SvgRenderer = requireSvgTag();

    	function renderCanvas (renderFunc, canvas, text, opts, cb) {
    	  const args = [].slice.call(arguments, 1);
    	  const argsNum = args.length;
    	  const isLastArgCb = typeof args[argsNum - 1] === 'function';

    	  if (!isLastArgCb && !canPromise()) {
    	    throw new Error('Callback required as last argument')
    	  }

    	  if (isLastArgCb) {
    	    if (argsNum < 2) {
    	      throw new Error('Too few arguments provided')
    	    }

    	    if (argsNum === 2) {
    	      cb = text;
    	      text = canvas;
    	      canvas = opts = undefined;
    	    } else if (argsNum === 3) {
    	      if (canvas.getContext && typeof cb === 'undefined') {
    	        cb = opts;
    	        opts = undefined;
    	      } else {
    	        cb = opts;
    	        opts = text;
    	        text = canvas;
    	        canvas = undefined;
    	      }
    	    }
    	  } else {
    	    if (argsNum < 1) {
    	      throw new Error('Too few arguments provided')
    	    }

    	    if (argsNum === 1) {
    	      text = canvas;
    	      canvas = opts = undefined;
    	    } else if (argsNum === 2 && !canvas.getContext) {
    	      opts = text;
    	      text = canvas;
    	      canvas = undefined;
    	    }

    	    return new Promise(function (resolve, reject) {
    	      try {
    	        const data = QRCode.create(text, opts);
    	        resolve(renderFunc(data, canvas, opts));
    	      } catch (e) {
    	        reject(e);
    	      }
    	    })
    	  }

    	  try {
    	    const data = QRCode.create(text, opts);
    	    cb(null, renderFunc(data, canvas, opts));
    	  } catch (e) {
    	    cb(e);
    	  }
    	}

    	browser.create = QRCode.create;
    	browser.toCanvas = renderCanvas.bind(null, CanvasRenderer.render);
    	browser.toDataURL = renderCanvas.bind(null, CanvasRenderer.renderToDataURL);

    	// only svg for now.
    	browser.toString = renderCanvas.bind(null, function (data, _, opts) {
    	  return SvgRenderer.render(data, opts)
    	});
    	return browser;
    }

    var browserExports = requireBrowser();
    var QRCode = /*@__PURE__*/getDefaultExportFromCjs(browserExports);

    /**
     * NWC Checkout - checkout page script (source, built via `npm run build`)
     *
     * Responsibilities:
     *  - "Connect wallet" UI: accept paste of nostr+walletconnect:// URI
     *  - "Pay" UI: create invoice, send pay_invoice via NWC relay, poll status
     *  - Fallback: show BOLT11 QR if relay does not respond within timeout
     */


    // ---------------------------------------------------------------------------
    // Globals injected via wp_localize_script
    // ---------------------------------------------------------------------------
    const cfg = window.NWCCheckout || {};

    // ---------------------------------------------------------------------------
    // Bootstrap
    // ---------------------------------------------------------------------------
    document.addEventListener( 'DOMContentLoaded', () => {
      mountConnectForm();
      mountPayButton();
      mountDisconnectButton();
      interceptCheckoutSubmit();
    } );

    // ---------------------------------------------------------------------------
    // "Connect wallet" form
    // ---------------------------------------------------------------------------
    function mountConnectForm() {
      const form = document.getElementById( 'nwc-connect-form' );
      if ( ! form ) return;

      form.addEventListener( 'submit', async ( e ) => {
        e.preventDefault();
        const uri    = form.querySelector( '#nwc-uri-input' )?.value?.trim() ?? '';
        const status = form.querySelector( '#nwc-connect-status' );

        if ( ! uri.startsWith( 'nostr+walletconnect://' ) ) {
          showStatus( status, cfg.i18n.error, 'error' );
          return;
        }

        setLoading( form, true );
        const res = await ajax( 'nwc_save_connection', { uri } );
        setLoading( form, false );

        if ( res.success ) {
          cfg.hasConnection = true;
          form.closest( '.nwc-connect-wrap' )?.remove();
          mountPayButton( true );
        } else {
          showStatus( status, res.data || cfg.i18n.error, 'error' );
        }
      } );
    }

    // ---------------------------------------------------------------------------
    // Disconnect button (checkout pay template + My Account tab)
    // ---------------------------------------------------------------------------
    function mountDisconnectButton() {
      const btn = document.getElementById( 'nwc-disconnect-btn' );
      if ( ! btn ) return;

      btn.addEventListener( 'click', async () => {
        if ( ! confirm( 'Disconnect your Lightning wallet from this site?' ) ) return;

        btn.disabled = true;
        const res = await ajax( 'nwc_delete_connection' );
        if ( res.success ) {
          cfg.hasConnection = false;
          location.reload();
        } else {
          btn.disabled = false;
        }
      } );
    }

    // ---------------------------------------------------------------------------
    // "Pay with connected wallet" button (shown once connection is saved)
    // ---------------------------------------------------------------------------
    function mountPayButton( freshlyConnected = false ) {
      const btn = document.getElementById( 'nwc-pay-btn' );
      if ( ! btn ) return;

      if ( freshlyConnected ) {
        btn.closest( '.nwc-pay-wrap' )?.classList.remove( 'hidden' );
      }

      btn.addEventListener( 'click', async ( e ) => {
        e.preventDefault();
        await runPaymentFlow( btn );
      } );
    }

    // ---------------------------------------------------------------------------
    // Intercept WooCommerce AJAX checkout so we can auto-trigger NWC payment
    // after the order is created on the thank-you / order-pay page.
    // ---------------------------------------------------------------------------
    function interceptCheckoutSubmit() {
      document.body.addEventListener( 'click', ( e ) => {
        const btn = e.target.closest( '#place_order' );
        if ( ! btn ) return;

        const gateway = document.querySelector( '#payment_method_nwc_checkout' );
        if ( ! gateway?.checked ) return;

        if ( ! cfg.hasConnection ) return; // Let native checkout handle connect flow.

        // WooCommerce processes the order via its own AJAX and redirects to
        // the order-received page. We attach a one-time handler to trigger
        // NWC payment as soon as the thank-you page loads.
        sessionStorage.setItem( 'nwc_autoplay', '1' );
      } );

      // On thank-you page: check for pending order.
      const orderId = getOrderIdFromUrl();
      if ( orderId && sessionStorage.getItem( 'nwc_autoplay' ) ) {
        sessionStorage.removeItem( 'nwc_autoplay' );
        runPaymentFlowForOrder( orderId );
      }
    }

    // ---------------------------------------------------------------------------
    // Core payment flow
    // ---------------------------------------------------------------------------
    async function runPaymentFlow( triggerEl = null ) {
      const orderId = getOrderIdFromUrl();
      if ( ! orderId ) return;
      await runPaymentFlowForOrder( orderId, triggerEl );
    }

    async function runPaymentFlowForOrder( orderId, triggerEl = null ) {
      const status = document.getElementById( 'nwc-pay-status' ) ?? createStatusEl();

      try {
        // 1. Create invoice.
        showStatus( status, cfg.i18n.connecting, 'loading' );
        const invoiceRes = await ajax( 'nwc_create_invoice', { order_id: orderId } );
        if ( ! invoiceRes.success ) throw new Error( invoiceRes.data );

        if ( invoiceRes.data.already_paid ) {
          showStatus( status, cfg.i18n.paid, 'success' );
          reloadAfterDelay();
          return;
        }

        const { invoiceId, bolt11 } = invoiceRes.data;

        // 2. Get connection details.
        const connRes = await ajax( 'nwc_get_connection' );
        if ( ! connRes.success ) throw new Error( 'No wallet connection found.' );
        const conn = connRes.data;

        // 3. Send pay_invoice via NWC relay.
        showStatus( status, cfg.i18n.paying, 'loading' );
        const relayResult = await sendViaRelay( conn, bolt11 );

        if ( relayResult.error ) {
          // Wallet returned an error (e.g. insufficient funds).
          throw new Error( relayResult.error.message || cfg.i18n.error );
        }

        // 4. Poll BTCPay until confirmed or timeout.
        showStatus( status, cfg.i18n.waitingWallet, 'loading' );
        await pollUntilPaid( orderId, invoiceId, status );

      } catch ( err ) {
        console.error( '[NWC Checkout]', err );

        // Fallback: show QR if we have bolt11.
        if ( err.__bolt11 ) {
          showQRFallback( err.__bolt11, status );
        } else {
          showStatus( status, err.message || cfg.i18n.error, 'error' );
        }
      }
    }

    // ---------------------------------------------------------------------------
    // NWC relay communication
    // ---------------------------------------------------------------------------
    async function sendViaRelay( conn, bolt11 ) {
      const clientSecretBytes = hexToBytes( conn.clientSecret );
      const clientPubkey      = getPublicKey$1( clientSecretBytes );
      const walletPubkey      = conn.walletPubkey;

      const payload = JSON.stringify( {
        method: 'pay_invoice',
        params: { invoice: bolt11 },
      } );

      const encryptedContent = nip44_exports.encrypt( payload, nip44_exports.getConversationKey( clientSecretBytes, walletPubkey ) );

      const event = finalizeEvent$1(
        {
          kind:       23194,
          created_at: Math.floor( Date.now() / 1000 ),
          tags:       [ [ 'p', walletPubkey ] ],
          content:    encryptedContent,
        },
        clientSecretBytes
      );

      return new Promise( ( resolve, reject ) => {
        const ws = new WebSocket( conn.relay );
        let settled = false;
        const timeout = setTimeout( () => {
          if ( settled ) return;
          settled = true;
          ws.close();
          const err = new Error( cfg.i18n.fallback );
          err.__bolt11 = bolt11;
          reject( err );
        }, cfg.relayTimeout ?? 15000 );

        ws.addEventListener( 'open', () => {
          // Publish request.
          ws.send( JSON.stringify( [ 'EVENT', event ] ) );
          // Subscribe for response: kind 23195 tagged to our pubkey for this event.
          ws.send( JSON.stringify( [
            'REQ',
            'nwc-res',
            { kinds: [ 23195 ], '#p': [ clientPubkey ], '#e': [ event.id ] },
          ] ) );
        } );

        ws.addEventListener( 'message', ( msg ) => {
          let parsed;
          try { parsed = JSON.parse( msg.data ); } catch { return; }

          if ( ! Array.isArray( parsed ) || parsed[ 0 ] !== 'EVENT' ) return;

          const responseEvent = parsed[ 2 ];
          if ( responseEvent?.kind !== 23195 ) return;

          let response;
          try {
            const convKey  = nip44_exports.getConversationKey( clientSecretBytes, walletPubkey );
            const decrypted = nip44_exports.decrypt( responseEvent.content, convKey );
            response = JSON.parse( decrypted );
          } catch ( e ) {
            return;
          }

          if ( ! settled ) {
            settled = true;
            clearTimeout( timeout );
            ws.close();
            resolve( response );
          }
        } );

        ws.addEventListener( 'error', () => {
          if ( settled ) return;
          settled = true;
          clearTimeout( timeout );
          const err = new Error( cfg.i18n.fallback );
          err.__bolt11 = bolt11;
          reject( err );
        } );
      } );
    }

    // ---------------------------------------------------------------------------
    // Polling
    // ---------------------------------------------------------------------------
    async function pollUntilPaid( orderId, invoiceId, statusEl ) {
      const deadline = Date.now() + ( cfg.pollTimeout ?? 90000 );
      const interval = cfg.pollInterval ?? 3000;

      while ( Date.now() < deadline ) {
        await sleep( interval );
        const res = await ajax( 'nwc_poll_invoice', { order_id: orderId, invoice_id: invoiceId } );
        if ( ! res.success ) continue;

        if ( res.data.status === 'paid' ) {
          showStatus( statusEl, cfg.i18n.paid, 'success' );
          reloadAfterDelay( 1500 );
          return;
        }

        if ( res.data.status === 'expired' ) {
          throw new Error( 'Invoice expired.' );
        }
      }

      throw new Error( 'Payment confirmation timed out.' );
    }

    // ---------------------------------------------------------------------------
    // QR fallback
    // ---------------------------------------------------------------------------
    async function showQRFallback( bolt11, statusEl ) {
      showStatus( statusEl, cfg.i18n.fallback, 'warning' );

      const wrap = document.getElementById( 'nwc-qr-fallback' ) ?? document.createElement( 'div' );
      wrap.id = 'nwc-qr-fallback';
      wrap.innerHTML = '';

      const canvas = document.createElement( 'canvas' );
      wrap.appendChild( canvas );

      const copyBtn = document.createElement( 'button' );
      copyBtn.type        = 'button';
      copyBtn.textContent = 'Copy invoice';
      copyBtn.className   = 'button nwc-copy-btn';
      copyBtn.addEventListener( 'click', () => {
        navigator.clipboard.writeText( bolt11 ).then( () => {
          copyBtn.textContent = 'Copied!';
          setTimeout( () => { copyBtn.textContent = 'Copy invoice'; }, 2000 );
        } );
      } );
      wrap.appendChild( copyBtn );

      statusEl?.after( wrap );

      await QRCode.toCanvas( canvas, bolt11.toUpperCase(), { width: 300, margin: 2 } );
    }

    // ---------------------------------------------------------------------------
    // Helpers
    // ---------------------------------------------------------------------------
    function ajax( action, data = {} ) {
      const body = new URLSearchParams( {
        action,
        nonce: cfg.nonce,
        ...data,
      } );
      return fetch( cfg.ajaxUrl, { method: 'POST', body } ).then( r => r.json() );
    }

    function getOrderIdFromUrl() {
      // Works on /checkout/order-received/{id}/ and /checkout/order-pay/{id}/
      const m = location.pathname.match( /order-(?:received|pay)\/(\d+)\// );
      return m ? m[ 1 ] : null;
    }

    function showStatus( el, message, type ) {
      if ( ! el ) return;
      el.textContent  = message;
      el.className    = `nwc-status nwc-status--${type}`;
      el.style.display = 'block';
    }

    function setLoading( form, loading ) {
      const btn = form.querySelector( '[type="submit"]' );
      if ( btn ) btn.disabled = loading;
    }

    function createStatusEl() {
      const el = document.createElement( 'p' );
      el.id = 'nwc-pay-status';
      document.querySelector( '.nwc-pay-wrap' )?.appendChild( el );
      return el;
    }

    function sleep( ms ) {
      return new Promise( r => setTimeout( r, ms ) );
    }

    function reloadAfterDelay( ms = 2000 ) {
      setTimeout( () => location.reload(), ms );
    }

})();
//# sourceMappingURL=nwc-checkout.js.map
