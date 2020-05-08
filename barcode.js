/** 2D barcode symbol creation by javascript
* @author alois zingl
* @version V20.15 april 2020
* @copyright MIT open-source license software
* @url https://github.com/zingl/2D-Barcode
* @description the indention of this library is a short and compact implementation to create the 2D barcodes 
*  of Data Matrix, (micro) QR or Aztec symbols so it could be easily adapted for individual requirements.
*  Data Matrix and Aztec barcodes immediately  set the cells by a callback function, QR returns an array matrix.
*  All could be converted to an array matrix, SVG path or GIF image.
*  The smallest bar code symbol fitting the data is automatically selected.
* functions: 
*	datamatrix(setCell,text,rect)   create Data Matrix barcode
*	quickresponse(text,level,ver)   create QR and micro QR barcode
*	aztec(setCell,text,sec,lay)     create Aztec, compact Aztec and Aztec runes
*	code128(setCell,text)           create Code 128 barcode
*	toPath(mat)                     convert array matrix to SVG path
*	toGif(mat,scale,trans,rgb,max)  convert array matrix to GIF image
*	toMatrix()                      fill array matrix by call back function setCell
*  there is no dependency between functions, just copy the ones you need
*  'Small is beautiful' - Leopold Kohr.
*/
"use strict";

/** Data Matrix symbol creation according ISO/IEC 16022:2006
* @param setCell call back drawing function(x,y)
* @param text to encode
* @param rect optional: flag - true for rectangular barcode
* @return array [width,height] of symbol ([0,0] if text too long)
*/
function datamatrix(setCell,text,rect) {
	var enc = [], cw = 0, ce = 0; // byte stream
	function push(val) { // encode bit stream c40/text/x12
		cw = 40*cw+val;
		if (ce++ == 2) { // full, add code
			enc.push(++cw>>8); // 3 chars in 2 bytes
			enc.push(cw&255);
			ce = cw = 0;
		}
	}
	var cost = [ // compute char cost in 1/12 bytes for mode..
		function(c) { return ((c-48)&255) < 10 ? 6 : c < 128 ? 12 : 24 ; }, // ascii
		function(c) { return ((c-48)&255) < 10 || ((c-65)&255) < 26 || c == 32 ? 8 : c < 128 ? 16 : 16+cost[1](c&127); }, // c40
		function(c) { return ((c-48)&255) < 10 || ((c-97)&255) < 26 || c == 32 ? 8 : c < 128 ? 16 : 16+cost[2](c&127); }, // text
		function(c) { return ((c-48)&255) < 10 || ((c-65)&255) < 26 || c == 32 || c == 13 || c == 62 || c == 42 ? 8 : 1e9; }, //x12
		function(c) { return c >= 32 && c < 95 ? 9 : 1e9; }, // edifact
		function(c) { return 12; } // base256
	];
	var latch = [0, 24, 24, 24, 21, 25]; // latch+unlatch costs
	var count = [0, 12, 12, 12, 12, 25]; // actual costs (start by latch only)
	var c, i, p, cm = 0, nm = 0; // current / next mode
	var bytes = []; // cost table in 1/12 bytes

	bytes[text.length] = count.slice(); // compute byte costs..
	for (p = text.length; p-- > 0; ) { // ..by dynamic programming
		for (c = 1e9, i = 0; i < count.length; i++ ) {
			count[i] += cost[i](text.charCodeAt(p)); // accumulate costs from back
			c = Math.min(c,Math.ceil(count[i]/12)*12); // get minimum in full bytes
		}					// ascii mode: if non digit round up to full byte
		if (cost[0](text.charCodeAt(p)) > 6) count[0] = Math.ceil(count[0]/12)*12;
		for (i = 0 ; i < count.length; i++) // latch to shorter mode?
			if (c+latch[i] < count[i]) count[i] = c+latch[i];
		bytes[p] = count.slice(); // record costs
	}
	for (p = 0; ; cm = nm) { // encode text
		c = bytes[p][cm]-latch[cm];
		if (p+(cm == 4 ? 3 : cm < 4 ?  2 : 0) >= text.length) nm = 0; // finished, return to ascii
		else for (i = cost.length; i-- > 0; ) // check if a mode is shorter
				if (Math.ceil((bytes[p+1][i]+cost[i](text.charCodeAt(p)))/12)*12 == c)
					nm = i; // change to shorter mode

		if (cm != nm && cm > 0) // return to ascii mode
			if (cm < 4) enc.push(254); // unlatch c40/text/x12
			else if (cm == 4) enc.push(31|cw&255); // unlatch edifact, add last byte
			else {			// encode base256 in 255 state rand algo
				if (ce > 249) enc.push((ce/250+250+(149*(enc.length+1))%255)&255); // high
				enc.push((ce%250+(149*(enc.length+1))%255+1)&255); // encode low length
				for ( ;ce > 0; ce--) // encode base256 data 
					enc.push((text.charCodeAt(p-ce)+(149*(enc.length+1))%255+1)&255);
			}
		if (p >= text.length) break; // encoding finished
		if (cm != nm) cw = ce = 0; // reset packing
		if (cm != nm && nm > 0) // latch to c40/text/x12/edifact/base256
			enc.push([230,239,238,240,231][nm-1]);

		if (nm == 0) { // encode ascii
			c = text.charCodeAt(p++); i = (c-48)&255;
			if (i < 10 && p < text.length && ((text.charCodeAt(p)-48)&255) < 10)
				enc.push(i*10+text.charCodeAt(p++)-48+130); // two digits
			else {
				if (c > 127) enc.push(235); // upper shift
				enc.push((c&127)+1); // encode data
			}
			if (cm == 4 || ce < 0) ce--; // count post edifact chars
		} else if (nm < 4) { // encode c40, text, x12	        	
			var set = [[31,0,32,119,47,133,57,179,64,173,90,207,95,277,127,386,255,1], // c40
				[31,0,32,119,47,133,57,179,64,173,90,258,95,277,122,335,127,386,255,1], // text
				[13,55,32,119,42,167,57,179,62,243,90,207,255,3]][nm-1]; // x12
			do { // set contains character range dupels: upper value, shift*4+set-1
				c = text.charCodeAt(p++);
				if (c > 127) { push(1); push(30); c &= 127; } // upper shift
				for (i = 0; c > set[i]; i += 2); // select char set
				if ((set[i+1]&3) < 3) push(set[i+1]&3); // select set
				push(c-(set[i+1]>>2));
			} while (ce > 0);
		} else if (nm == 4) { // encode edifact
			if (ce > 0) enc.push(255&cw+(text.charCodeAt(p++)&63)); // 3rd byte
			for (cw = ce = 0; ce < 3; ce++)
				cw = 64*(cw+(text.charCodeAt(p++)&63));
			enc.push(cw>>16); // 4 chars in 3 bytes
			enc.push((cw>>8)&255);
		} else { p++; ce++; } // count base256 chars
	}
	var el = enc.length; // compute symbol size
	var h,w, nc = 1,nr = 1, fw,fh; // symbol size, regions, region size
	var j = -1, l, r, s, b = 1, k;

	if (ce == -1 || (cm && cm < 5)) nm = 1; // c40/text/x12/edifact unlatch removable
	if (rect && el-nm < 50) { // rectangular symbol possible
		k = [16,7, 28,11, 24,14, 32,18, 32,24, 44,28]; // symbol width, checkwords
		do {
			w = k[++j]; // width w/o finder pattern
			h = 6+(j&12); // height
			l = w*h/8; // # of bytes in symbol
		} while (l-k[++j] < el-nm); // data + check fit in symbol?
		if (w > 25) nc = 2; // column regions
	} else { // square symbol
		w = h = 6;
		i = 2; // size increment
		k = [5,7,10,12,14,18,20,24,28,36,42,48,56,68,84,
				112,144,192,224,272,336,408,496,620]; // RS checkwords
		do {
			if (++j == k.length) return [0,0]; // message too long for Datamatrix
			if (w > 11*i) i = 4+i&12; // advance increment
			w = h += i;
			l = (w*h)>>3;
		} while (l-k[j] < el-nm); // data + check fit in symbol?
		if (w > 27) nr = nc = 2*Math.floor(w/54)+2; // regions
		if (l > 255) b = 2*(l>>9)+2; // blocks
	}
	s = k[j]; // RS checkwords
	if (l-s+1 == el && nm > 0) { // remove last unlatch to fit in smaller symbol
		el--; 				// replace edifact unlatch by char
		if (ce == -1) enc[el-1] ^= 31^(enc[el]-1)&63;
	}
	fw = w/nc; fh = h/nr; // region size
	if (el < l-s) enc[el++] = 129; // first padding
	while (el < l-s) // add more padding
		enc[el++] = (((149*el)%253)+130)%254;

	s /= b; // compute Reed Solomon error detection and correction
	var rs = new Array(70), rc = new Array(70); // reed/solomon code
	var lg = new Array(256), ex = new Array(255); // log/exp table for multiplication
	for (j = 1, i = 0; i < 255; i++) { // compute log/exp table of Galois field
		ex[i] = j; lg[j] = i;
		j += j; if (j > 255)  j ^= 301; // GF polynomial a^8+a^5+a^3+a^2+1 = 100101101b = 301
	}
	for (rs[s] = 0, i = 1; i <= s; i++)  // compute RS generator polynomial
		for (j = s-i, rs[j] = 1; j < s; j++)
			rs[j] = rs[j+1]^ex[(lg[rs[j]]+i)%255];
	for (c = 0; c < b; c++) { // compute RS correction data for each block
		for (i = 0; i <= s; i++) rc[i] = 0;
		for (i = c; i < el; i += b)
			for (j = 0, x = rc[0]^enc[i]; j < s; j++)
				rc[j] = rc[j+1]^(x ? ex[(lg[rs[j]]+lg[x])%255] : 0);
		for (i = 0; i < s; i++) // add interleaved correction data
			enc[el+c+i*b] = rc[i];
	}
	// layout perimeter finder pattern, 0/0 = upper left corner
	for (i = 0; i < h+2*nr; i += fh+2) // horizontal
		for (j = 0; j < w+2*nc; j++) {
			setCell(j, i+fh+1);
			if ((j&1) == 0) setCell(j, i);
		}
	for (i = 0; i < w+2*nc; i += fw+2)  // vertical
		for (j = 0; j < h; j++) {
 			setCell(i, j+(j/fh|0)*2+1);
			if ((j&1) == 1) setCell(i+fw+1, j+(j/fh|0)*2);
		}
	// layout data
	s = 2; c = 0; r = 4; // step,column,row of data position
	b = [0,0, -1,0, -2,0, 0,-1, -1,-1, -2,-1, -1,-2, -2,-2]; // nominal byte layout
	for (i = 0; i < l; r -= s, c += s) { // diagonal steps
		if (r == h-3 && c == -1) // corner A layout
			k = [w,6-h, w,5-h, w,4-h, w,3-h, w-1,3-h, 3,2, 2,2, 1,2];
		else if (r == h+1 && c == 1 && (w&7) == 0 && (h&7) == 6) // corner D layout
			k = [w-2,-h, w-3,-h, w-4,-h, w-2,-1-h, w-3,-1-h, w-4,-1-h, w-2,-2, -1,-2];
		else {
			if (r == 0 && c == w-2 && (w&3)) continue; // corner B: omit upper left
			if (r < 0 || c >= w || r >= h || c < 0) {  // outside
				s = -s;	r += 2+s/2;	c += 2-s/2;        // turn around
				while (r < 0 || c >= w || r >= h || c < 0) { r -= s; c += s; }
			}
			if (r == h-2 && c == 0 && (w&3)) // corner B layout
				k = [w-1,3-h, w-1,2-h, w-2,2-h, w-3,2-h, w-4,2-h, 0,1, 0,0, 0,-1];
			else if (r == h-2 && c == 0 && (w&7) == 4) // corner C layout
				k = [w-1,5-h, w-1,4-h, w-1,3-h, w-1,2-h, w-2,2-h, 0,1, 0,0, 0,-1];
			else if (r == 1 && c == w-1 && (w&7) == 0 && (h&7) == 6) continue; // omit corner D
			else k = b; // nominal L-shape layout
		}
		for (el = enc[i++], j = 0; el > 0; j += 2, el >>= 1) { // layout each bit
			if (el&1) {
				var x = c+k[j], y = r+k[j+1];
				if (x < 0) { x += w; y += 4-((w+4)&7); } // wrap around
				if (y < 0) { y += h; x += 4-((h+4)&7); }
				setCell(x+2*(x/fw|0)+1,y+2*(y/fh|0)+1); // add region gap
			}
		}
	}
	for (i = w; i&3; i--) setCell(i,i); // unfilled corner
	return [w+2*nc,h+2*nr]; // width and height of symbol
}

/**	QR Code 2005 bar code symbol creation according ISO/IEC 18004:2006
*	creates QR and micro QR bar code symbol as javascript matrix array.
* @param text to encode
* @param level optional: quality level LMQH
* @param ver optional: minimum version size (-3:M1, -2:M2, .. 1, .. 40), set to 1 for QR only
* @return matrix array of QR symbol ([] if text is too long or chars uncodable)
*/
function quickresponse(text,level,ver) { // create QR and micro QR bar code symbol
	function alphanum(c) { // char code of alphanumeric encoding
		return "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ $%*+-./:".indexOf(String.fromCharCode(c));
	}
	function isKanji(i) {
		if (text.charCodeAt(i) < 256) return -1;
		return k1.indexOf(text.charAt(i),k1.length>>1);
	}
	var mode, size, align, blk, ec;
	var i, j, k, k1, c, b, d, w, x, y, n, a;
	var enc = [0], el, eb = 0; // encoding data, length, bits
	var erc = [ // error correction words L,M,Q,H; blocks L,M,Q,H
		[2,99,99,999, 1,1,1,1], // micro QR version M1 (99=N/A)
		[5,6,999,999, 1,1,1,1], // M2
		[6,8,999,999, 1,1,1,1], // M3
		[8,10,14,999, 1,1,1,1], // M4
		[ 7,10,13,17, 1,1,1,1], // QR version 1
		[10,16,22,28, 1,1,1,1], // 2
		[15,26,18,22, 1,1,2,2], // 3
		[20,18,26,16, 1,2,2,4], // 4
		[26,24,18,22, 1,2,4,4], // 5
		[18,16,24,28, 2,4,4,4], // 6
		[20,18,18,26, 2,4,6,5], // 7
		[24,22,22,26, 2,4,6,6], // 8
		[30,22,20,24, 2,5,8,8], // 9
		[18,26,24,28, 4,5,8,8], // 10
		[20,30,28,24, 4,5,8,11], // 11
		[24,22,26,28, 4,8,10,11], // 12
		[26,22,24,22, 4,9,12,16], // 13
		[30,24,20,24, 4,9,16,16], // 14
		[22,24,30,24, 6,10,12,18], // 15
		[24,28,24,30, 6,10,17,16], // 16
		[28,28,28,28, 6,11,16,19], // 17
		[30,26,28,28, 6,13,18,21], // 18
		[28,26,26,26, 7,14,21,25], // 19
		[28,26,30,28, 8,16,20,25], // 20
		[28,26,28,30, 8,17,23,25], // 21
		[28,28,30,24, 9,17,23,34], // 22
		[30,28,30,30, 9,18,25,30], // 23
		[30,28,30,30, 10,20,27,32], // 24
		[26,28,30,30, 12,21,29,35], // 25
		[28,28,28,30, 12,23,34,37], // 26
		[30,28,30,30, 12,25,34,40], // 27
		[30,28,30,30, 13,26,35,42], // 28
		[30,28,30,30, 14,28,38,45], // 29
		[30,28,30,30, 15,29,40,48], // 30
		[30,28,30,30, 16,31,43,51], // 31
		[30,28,30,30, 17,33,45,54], // 32
		[30,28,30,30, 18,35,48,57], // 33
		[30,28,30,30, 19,37,51,60], // 34
		[30,28,30,30, 19,38,53,63], // 35
		[30,28,30,30, 20,40,56,66], // 36
		[30,28,30,30, 21,43,59,70], // 37
		[30,28,30,30, 22,45,62,74], // 38
		[30,28,30,30, 24,47,65,77], // 39
		[30,28,30,30, 25,49,68,81]  // 40
	];
	var lev = 3-"HQMLhqml3210".indexOf(level||0)&3; // level "LMQH" to 0,1,2,3
	k1 = (typeof kanji === 'undefined') ? "" : kanji; // for no kanji.js
	/** data analysis */
	for (i = text.length; i-- > 0; ) // check for kanji
		if (text.charCodeAt(i) > 127 && isKanji(i) < 0) // unicode to UTF-8
			text = text.substr(0,i)+unescape(encodeURIComponent(text.substr(i,1)))+text.substr(i+1);
	/** compute symbol version size, ver < 1: micro QR */
	function push(val,bits) { // add data to bit stream
		val <<= 8; eb += bits;
		enc[enc.length-1] |= val>>eb;
		while (eb > 7) enc[enc.length] = (val>>(eb -= 8))&255;
	}
	function cib(m) { // get # of bits of count indicator
		return ver < 1 ? ver+((19-2*m)/3|0) : // micro QR
			[[10,12,14],[9,11,13],[8,16,16],[8,10,12]][m][(ver+7)/17|0]; // QR
	}
	ver = ver == undefined ? 1 : ver-1;
	do { // increase version till message fits
		if (++ver >= erc.length-3) return []; // text too long for QR
		if (ver < 2 || ver == 10 || ver == 27) { // recompute stream
			var NUMERIC = 0, ALPHA = 1, BYTE = 2, KANJI = 3; // encoding modes
			var numHead   = ((ver > 0 ? 4 : ver+3)+cib(0))*6; // segment header sizes,
			var alphaHead = ((ver > 0 ? 4 : ver+3)+cib(1))*6; // measured in 1/6 bits
			var byteHead  = ((ver > 0 ? 4 : ver+3)+cib(2))*6;
			var byteBits = [], alphaBits = [], numBits = []; // len in 1/6 bits
			for (j = text.length; j >= 0; j--) { // compute optimal encoding
				if (j == text.length || isKanji(j) >= 0) {
					i = 0; n = a = b = 1e9; // init values
				} else { // calculate the bit table using dynamic programming
					n += text.charCodeAt(j)-48>>>0 < 10 ? 20 : 1e9; // 10/3 bits per char
					a += alphanum(text.charCodeAt(j)) >= 0 ? 33 : 1e9; // 11/2 bits per char
					b += 48;  // 8 bits per byte
					i = Math.ceil(Math.min(b,a,n)/6)*6; // round up fractional bits
				}
				n = numBits[j] = Math.min(i+numHead,n); // switch to shorter encoding
				a = alphaBits[j] = Math.min(i+alphaHead,a);
				b = byteBits[j] = Math.min(i+byteHead,b);
			}
			enc = [0]; eb = 0; // start encoding with mode of fewest bits
			mode = isKanji(0) >= 0 ? KANJI : b <= a && b <= n ? BYTE : a <= n ? ALPHA : NUMERIC;
			for (i = 0, j = 1; j <= text.length; j++) { // calc optimal encoding for each char
				b = mode == NUMERIC ? numBits[j]-numHead : mode == ALPHA ? alphaBits[j]-alphaHead : byteBits[j]-byteHead;
				if (j == text.length || isKanji(j) >= 0) 
					n = KANJI; // mode of next char
				else if (mode == KANJI) // restart with mode of fewest bits
					n = byteBits[j] <= Math.min(alphaBits[j], numBits[j]) ? BYTE :
						alphaBits[j] <= numBits[j] ? ALPHA : NUMERIC;
				else if (text.charCodeAt(j)-48>>>0 < 10 && (mode == NUMERIC || Math.ceil((numBits[j+1]+20)/6)*6 == b))
					n = NUMERIC; // switch to shortest encoding
				else if (alphanum(text.charCodeAt(j)) >= 0 && (mode == ALPHA || Math.ceil((alphaBits[j+1]+33)/6)*6 == b))
					n = ALPHA; // switch to shortest encoding
				else n = BYTE;	
				if (mode != n || j == text.length) { // mode changes -> encode previous
					if (ver < -1 && ver+3 < mode) push(0,100); // block illegal modes
					if (ver > 0) push(1<<mode,4); // mode indicator, QR
					else push(mode,ver+3); // mode indicator micro QR
					push(j-i,cib(mode)); // character count indicator
					if (mode == NUMERIC) { // encode numeric data
						for (; i < j-2; i += 3)
							push(text.substr(i,3),10); // 3 digits in 10 bits
						if (i < j) push(text.substring(i),j-i == 1 ? 4 : 7);
					} else if (mode == ALPHA) { // encode alphanumeric data
						for (; i < j-1; i += 2)  // 2 chars in 11 bits
							push(alphanum(text.charCodeAt(i))*45+alphanum(text.charCodeAt(i+1)),11);
						if (i < j) push(alphanum(text.charCodeAt(i)),6);
					} else if (mode == BYTE) // encode binary data
						for (; i < j; i++) 
							push(text.charCodeAt(i),8); // 1 char in 8 bits
					else for (; i < j; i++) { // encode Kanji
							c = (k1.charCodeAt(isKanji(i)-(k1.length>>1))&0x3fff)-320; // shift JIS X 0208
							push((c>>8)*192+(c&255),13); // 1 char in 13 bits
						}
					i = j; mode = n; // next segment
				}
			}
		}
		size = ver*(ver < 1 ? 2 : 4)+17; // symbol size
		align = ver < 2 ? 0 : (ver/7|0)+2; // # of align patterns
		el = (size-1)*(size-1)-(5*align-1)*(5*align-1); // total bits - align - timing
		el -= ver < 1 ? 59 : ver < 2 ? 191 : ver < 7 ? 136 : 172; // finder, version, format
		i = ver < 1 ? 8-(ver&1)*4 : 8; // M1+M3: last byte only one nibble
		c = erc[ver+3][lev+4]*erc[ver+3][lev]; // # of error correction blocks/bytes
	} while ((el&-8)-c*8 < enc.length*8+eb-i); // message fits in version

	for (;(!level || (level.charCodeAt(0)&-33) == 65) && lev < 3; lev++) {
		j = erc[ver+3][lev+5]*erc[ver+3][lev+1]; // increase security level
		if ((el&-8)-j*8 < enc.length*8+eb-i) break; // if data fits in same size
	}
	blk = erc[ver+3][lev+4]; // # of error correction blocks
	ec = erc[ver+3][lev]; // # of error correction bytes
	el = (el>>3)-ec*blk; // remaining data bytes
	w = Math.floor(el/blk); // # of words in group 1 (group 2: w+1)
	b = blk+w*blk-el; // # of blocks in group 1 (group 2: blk-b)

	if ((-3&ver) == -3 && el == enc.length)
		enc[w-1] >>= 4; // M1, M3: shift high bits to low nibble
	if (el >= enc.length) push(0,ver > 0 ? 4 : ver+6); // terminator
	if (eb == 0 || el < enc.length) enc.pop(); // bit padding
	for (i = 236; el > enc.length; i ^= 236^17) // byte padding
		enc.push((-3&ver) == -3 && enc.length == el-1 ? 0 : i); // M1, M3: last 4 bit zero

	/** error correction coding */
	var rs = new Array(ec+1); // reed/solomon code
	var lg = new Array(256), ex = new Array(255); // log/exp table for multiplication
	for (j = 1, i = 0; i < 255; i++) { // compute log/exp table of Galois field prime
		ex[i] = j; lg[j] = i;
		j += j; if (j > 255) j ^= 285; // GF polynomial a^8+a^4+a^3+a^2+1 = 100011101b = 285
	}
	for (i = 0, rs[0] = 1; i < ec; i++) // compute RS generator polynomial
		for (j = i+1, rs[j] = 0; j > 0; j--)
			rs[j] ^= ex[(lg[rs[j-1]]+i)%255];
	for (i = 0; i <= ec*blk; i++) enc.push(0); // clr checkwords
	for (k = c = 0, eb = el; c < blk; c++, eb += ec) // for each data block
		for (i = c < b ? w : w+1; i-- > 0; k++) // compute RS checkwords 
			for (j = 0, x = enc[eb]^enc[k]; j++ < ec; )
				enc[eb+j-1] = enc[eb+j]^(x ? ex[(lg[rs[j]]+lg[x])%255] : 0);

	/** layout symbol */
	var mat = new Array(size); // bit 2 reserved space
	for (i = 0; i < size; i++) mat[i] = new Array(size); // define matrix
	function set(x,y,pat) { // layout fixed pattern: finder & align
		for (var i = 0; i < pat.length; i++)
			for (var p = pat[i], j = 0; 1<<j <= pat[0]; j++, p >>= 1)
				mat[y+i][x+j] = (p&1)|2;
	}
	c = ver < 1 ? 0 : 6;
	for (i = 8; i < size; i++) mat[c][i] = mat[i][c] = i&1^3; // timing pattern
	set(0,0,[383,321,349,349,349,321,383,256,511]); // finder upper left +format
	if (ver > 0) {
		set(0,size-8,[256,383,321,349,349,349,321,383]); // finder lower left
		set(size-8,0,[254,130,186,186,186,130,254,0,255]); // finder upper right
		c = 2*Math.floor(2*(ver+1)/(1-align)); // alignment pattern spacing
		for (x = 0; x < align; x++) // alignment grid
			for (y = 0; y < align; y++) 
				if ((x > 0 && y > 0) || (x != y && x+y != align-1)) // no align at finder
					set(x == 0 ? 4 : size-9+c*(align-1-x), // set alignment pattern
						y == 0 ? 4 : size-9+c*(align-1-y),[31,17,21,17,31]);
		if (ver > 6) // reserve version area
			for (i = 0; i < 18; i++) 
				mat[size+i%3-11][i/3|0] = mat[i/3|0][size+i%3-11] = 2;
	}
	/** layout codewords */
	y = x = size-1; // start lower right
	for (i = 0; i < eb; i++) {
		c = k = 0; j = w+1; // interleave data
		if (i >= el) { c = k = el; j = ec; } // interleave checkwords
		else if (i+blk-b >= el) c = k = -b; // interleave group 2 last bytes
		else if (i%blk >= b) c = -b; // interleave group 2 
		else j--; // interleave group 1
		c = enc[c+(i-k)%blk*j+((i-k)/blk|0)]; // interleave data
		for (j = (-3&ver) == -3 && i == el-1 ? 8 : 128; j > 0; j >>= 1) { // M1,M3: 4 bit
			if (c & j) mat[y][x] = 1; // layout bit
			k = ver > 0 && x < 6 ? 1 : 0; // skip vertical timing pattern
			do	if (1 & x-- ^ k) { // advance x,y
					if (size-x-k & 2) if (y > 0) y--; else continue; // top turn
					else 		if (y < size-1) y++; else continue; // bottom turn
					x += 2; // no turn
				}
			while (mat[y][x]&2); // skip reserved area
		}
	}
	/** data masking */
	var pat = [ function(x,y) { return (x+y)&1; }, // pattern generation conditions
				function(x,y) { return  y&1; },
				function(x,y) { return  x%3; },
				function(x,y) { return (x+y)%3; },
				function(x,y) { return (x/3+(y>>1))&1; },
				function(x,y) { return ((x*y)&1)+x*y%3; },
				function(x,y) { return (x*y+x*y%3)&1; },
				function(x,y) { return (x+y+x*y%3)&1; } ];
	if (ver < 1) pat = [pat[1],pat[4],pat[6],pat[7]]; // mask pattern for micro QR
	function get(x,y,p) { // test pattern mask
		var d = mat[y][x];
		if ((d&2) == 0) d ^= pat[p](x,y) == 0; // invert only data according mask
		return d&1;
	}
	var msk = 0, pen = 100000;
	for (var p = 0; p < pat.length; p++) { // compute penalty
		if (ver < 1) { // penalty micro QR
			for (x = y = i = 1; i < size; i++) {
				x -= get(i,size-1,p);
				y -= get(size-1,i,p);
			}
			j = x > y ? 16*x+y : x+16*y;
		} else { // penalty QR
			d = 0; k1 = ""; // # of darks, prev line
			for (j = y = 0; y < size; y++) { // horizontal
				c = i = 0; k = "0000";
				for (x = 0; x < size; x++) {
					k += w = get(x,y,p); // horizontal to string
					d += w; // rule 4: count darks
					if (c == w) { // same as prev
						i++; // rule 1
						if (x > 0 && k1.substr(x+3,2) == c*11) j += 3; // rule 2: block 2x2
					} else { // changed
						if (i > 5) j += i-2; // rule 1: >5 adjacent
						c ^= 1; i = 1;
					}
				}
				if (i > 5) j += i-2; //  rule 1: >5 adjacent
				for (i = -1; (i = k.indexOf("1011101",i+4)) > 0; ) // rule 3: like finder pattern
					if (k.substr(i-4,4) == "0000" || (k+"0000").substr(i+7,4) == "0000") j += 40;
				k1 = k; // rule 2: remember last line
			}
			for (x = 0; x < size; x++) { // vertical
				c = i = 0; k = "0000";
				for (y = 0; y < size; y++) {
					k += w = get(x,y,p); // vertical to string
					if (c != w) { // changed
						if (i > 5) j += i-2; // rule 1: >5 adjacent
						c ^= 1; i = 1;
					} else i++; // rule 1
				}
				if (i > 5) j += i-2; //  rule 1: >5 adjacent
				for (i = -1; (i = k.indexOf("1011101",i+4)) > 0; ) // rule 3: like finder pattern
					if (k.substr(i-4,4) == "0000" || (k+"0000").substr(i+7,4) == "0000") j += 40;
			}
			j += Math.floor(Math.abs(10-20*d/(size*size)))*10; // rule 4: darks
		}
		if (j < pen) { pen = j; msk = p; } // take mask of lower penalty
	}
	for (y = 0; y < size; y++) // remove reservation, apply mask
		for (x = 0; x < size; x++) 
			mat[y][x] = get(x,y,msk);

	/** format information, code level & mask */
	j = ver == -3 ? msk : ver < 1 ? (2*ver+lev+5)*4+msk : ((5-lev)&3)*8+msk;
	for (k = j *= 1024, i = 4; i >= 0; i--) // BCH error correction: 5 data, 10 error bits
		if (j >= 1024<<i) j ^= 1335<<i; // generator polynomial: x^10+x^8+x^5+x^4+x^2+x+1 = 10100110111b = 1335
	k ^= j^(ver < 1 ? 17477 : 21522); // XOR masking
	for (j = 0; j < 15; j++, k >>= 1) // layout format information
		if (ver < 1) 
			mat[j < 8 ? j+1 : 8][j < 8 ? 8 : 15-j] = k&1; // micro QR
		else 
			mat[8][j < 8 ? size-j-1 : j == 8 ? 7 : 14-j] = // QR horizontal
				mat[j < 6 ? j : j < 8 ? j+1 : size+j-15][8] = k&1; // vertical
	/** version information */
	for (k = ver*4096, i = 5; i >= 0; i--) // BCH error correction: 6 data, 12 error bits
		if (k >= 4096<<i) k ^= 7973<<i; // generator: x^12+x^11+x^10+x^9+x^8+x^5+x^2+1 = 1111100100101b = 7973
	if (ver > 6) // layout version information
		for (k ^= ver*4096, j = 0; j < 18; j++, k >>= 1) 
			mat[size+j%3-11][j/3|0] = mat[j/3|0][size+j%3-11] = k&1;

	return mat; // QR additionally needs a quiet zone of 4 cells around the symbol!
}

/**	Aztec bar code symbol creation according ISO/IEC 24778:2008
*	creates Actec and compact Aztec bar code symbol by call back function.
* @param setCell call back drawing function(x,y)
* @param text to encode
* @param sec optional: percentage of checkwords used for security 2%-90% (23%)
* @param lay optional: number of layers (size), default autodetect
* @return array size (0 if text too long for Aztec)
*/
function aztec(setCell,text,sec,lay) { // make Aztec bar code
	var enc, eb, ec, el = text.length, b, typ = 0;
	var mod; // encoding mode: upper/lower/mixed/punct/digit
	function push(val,bits) { // add data to bit stream
		val <<= b; eb += bits||(mod == 4 ? 4 : 5);
		enc[enc.length-1] |= val>>eb; // add data
		while (eb >= b) { // word full?
			var i = enc[enc.length-1]>>1;
			if (typ == 0 && (i == 0 || 2*i+2 == 1<<b)) { // bit stuffing: all 0 or 1
				enc[enc.length-1] = 2*i+(1&i^1); // insert complementary bit
				eb++;
			}
			eb -= b;
			enc.push((val>>eb)&((1<<b)-1));
		}
	}

	function encode(text) { // process input text
		function modeOf(ch) { // get character encoding mode of ch
			if (ch == 32) return mod<<5; // space
			var k = [0,14,65, 26,32,52, 32,48,69, 47,58,82, 57,64,59, 64,91,-63, 96,123,-63];
			for (var i = 0; i < k.length; i += 3) // check range
				if (ch > k[i] && ch < k[i+1]) break;
			if (i < k.length) return ch+k[i+2]; // ch in range
			i = [64,92,94,95,96,124,126,127,91,93,123,125].indexOf(ch); // "@\^_'|~⌂[]{}"
			if (i < 0) return -1; // binary
			return (i < 8 ? 20+64 : 27+96-8)+i; // mixed/punct
		}
		enc = [0]; mod = eb = 0; // clr bit stream
		for (var i = 0; i < text.length; i++) { // analyse text, optimize most cases
			var c = text.charCodeAt(i), c1 = 0, m;
			if (i < text.length-1) c1 = text.charCodeAt(i+1);
			if (c == 32) { // space
				if (mod == 3) { push(31); mod = 0; } // punct: latch to upper
				c = 1; // space in all other modes
			} else if (mod == 4 && c == 44) c = 12; // , in digit mod
			else if (mod == 4 && c == 46) c = 13; // . in digit mod
			else if (((c == 44 || c == 46 || c == 58) && c1 == 32) || (c == 13 && c1 == 10)) {
				if (mod != 3) push(0); // shift to punct
				push(c == 46 ? 3 : c == 44 ? 4 : c == 58 ? 5 : 2,5); // two char encoding
				i++;  continue;
			} else {
				c = c == 13 && modeOf(c1)>>5 == mod ? 97 : modeOf(c);
				if (c < 0) { // binary
					if (mod > 2) { push(mod == 3 ? 31 : 14); mod = 0; } // latch to upper
					push(31); // shift to binary
					for (var l = 0, j = 0; l+i < text.length; l++) // calc binary length
						if (modeOf(text.charCodeAt(l+i)) < 0) j = 0;
						else if (j++ > 5) break; // look for at least 5 consecutive non binary chars
					if (l > 31) { // length > 31
						push(0);
						push(l-31,11);
					} else push(l);
					while (l--) push(text.charCodeAt(i++)&255,8);
					i--; continue;
				}
				m = c>>5; // need mode
				if (m == 4 && mod == 2) { push(29); mod = 0; } // mixed to upper (to digit)
				if (m != 3 && mod == 3) { push(31); mod = 0; } // exit punct: to upper
				if (m != 4 && mod == 4) { // exit digit
					if ((m == 3 || m == 0) && modeOf(c1) > 129) {
						push((3-m)*5); push(c&31,5); continue;  // shift to punct/upper
					}
					push(14); mod = 0; // latch to upper
				}
				if (mod != m) { // mode change needed
					if (m == 3) { // to punct
						if (mod != 4 && modeOf(c1)>>5 == 3) { // 2x punct, latch to punct
							if (mod != 2) push(29); // latch to mixed
							push(30); // latch to punct
							mod = 3; // punct mod
						} else push(0); // shift to punct
					} else if (mod == 1 && m == 0) { // lower to upper
						if (modeOf(c1)>>5 == 1) push(28); // shift
						else { push(30); push(14,4); mod = 0; } // latch
					} else { // latch to ..
						push([29,28,29,30,30][m]);
						mod = m;
					}
				}
			}
			push(c&31); // stream character
		}
		if (eb > 0) push((1<<(b-eb))-1,b-eb); // padding
		enc.pop(); // remove 0-byte
	}
	/** compute word size b: 6/8/10/12 bits */
	var x,y, dx,dy, ctr, c, i, j, l;
	sec = 100/(100-Math.min(Math.max(sec||25,0),90)); // limit percentage of check words to 0-90%
	for (j = i = 4; ; i = b) { // compute code size
		j = Math.max(j,(Math.floor(el*sec)+3)*i); // total needed bits, at least 3 check words
		b = j <= 240 ? 6 : j <= 1920 ? 8 : j <= 10208 ? 10 : 12; // bit capacity -> word size
		if (lay) b = Math.max(b, lay < 3 ? 6 : lay < 9 ? 8 : lay < 23 ? 10 : 12); // parameter
		if (i >= b) break;
		encode(text);
		el = enc.length;
	}
	if (el > 1660) return 0; // message too long
	typ = j > 608 || el > 64 ? 14 : 11; // full or compact Aztec finder size
	mod = parseInt(text); // Aztec rune possible?
	if (mod >= 0 && mod < 256 && mod+"" == text && !lay) lay = 0; // Aztec rune 0-255
	else lay = Math.max(lay||0,Math.min(32,(Math.ceil((Math.sqrt(j+typ*typ)-typ)/4)))); // needed layers
	ec = Math.floor((8*lay*(typ+2*lay))/b)-el; // # of error words
	typ >>= 1; ctr = typ+2*lay; ctr += (ctr-1)/15|0; // center position

	/** compute Reed Solomon error detection and correction */
	function rs(ec,s,p) { // # of checkwords, polynomial bit size, generator polynomial
		var rc = new Array(ec+2), i, j, el = enc.length; // reed/solomon code
		var lg = new Array(s+1), ex = new Array(s); // log/exp table for multiplication
		for (j = 1, i = 0; i < s; i++) { // compute log/exp table of Galois field
			ex[i] = j; lg[j] = i;
			j += j; if (j > s)  j ^= p; // GF polynomial
		}
		for (rc[ec+1] = i = 0; i <= ec; i++) { // compute RS generator polynomial
			for (j = ec-i, rc[j] = 1; j++ < ec; )
				rc[j] = rc[j+1]^ex[(lg[rc[j]]+i)%s];
			enc.push(0);
		}
		for (i = 0; i < el; i++) // compute RS checkwords
			for (j = 0, p = enc[el]^enc[i]; j++ < ec; )
				enc[el+j-1] = enc[el+j]^(p ? ex[(lg[rc[j]]+lg[p])%s] : 0);
	}
	/** layout Aztec barcode */
	for (y = 1-typ; y < typ; y++) // layout central finder
		for (x = 1-typ; x < typ; x++)
			if ((Math.max(Math.abs(x),Math.abs(y))&1) == 0)
				setCell(ctr+x,ctr+y);
	setCell(ctr-typ,ctr-typ+1); setCell(ctr-typ,ctr-typ); // orientation marks
	setCell(ctr-typ+1,ctr-typ); setCell(ctr+typ,ctr+typ-1);
	setCell(ctr+typ,ctr-typ+1); setCell(ctr+typ,ctr-typ); 
	function move(dx,dy) { // move one cell
		do x += dx; 
		while (typ == 7 && (x&15) == 0); // skip reference grid
		do y += dy;
		while (typ == 7 && (y&15) == 0);
	}
	if (lay > 0) { // layout the message
		rs(ec,(1<<b)-1,[67,301,1033,4201][b/2-3]); // error correction, generator polynomial
		enc.pop(); // remove 0-byte
		x = -typ; y = x-1; // start of layer 1 at top left
		j = l = (3*typ+9)/2; // length of inner side
		dx = 1; dy = 0; // direction right
		while ((c = enc.pop()) != undefined) // data in reversed order inside to outside
			for (i = b/2; i-- > 0; c >>= 2) {
				if (c&1) setCell(ctr+x,ctr+y); // odd bit
				move(dy,-dx); // move across
				if (c&2) setCell(ctr+x,ctr+y); // even bit
				move(dx-dy,dx+dy); // move ahead
				if (j-- == 0) { // spiral turn
					move(dy,-dx); // move across
					j = dx; dx = -dy; dy = j; // rotate clockwise
					if (dx < 1) // move to next side
						for (j = 2; j--;) move(dx-dy,dx+dy);
					else l += 4; // full turn -> next layer
					j = l; // start new side
				}
			}
		if (typ == 7) // layout reference grid
			for (x = (15-ctr)&-16; x <= ctr; x += 16)
				for (y = (1-ctr)&-2; y <= ctr; y += 2) 
					if (Math.abs(x) > typ || Math.abs(y) > typ) {
						setCell(ctr+x,ctr+y); // down
						if (y&15) setCell(ctr+y,ctr+x); // across
					}
		mod = (lay-1)*(typ*992-4896)+el-1; // 2/5 + 6/11 mode bits
	}
	/** process modes message compact/full */
	for (i = typ-3; i-- > 0; mod >>= 4) enc[i] = mod&15; // mode to 4 bit words
	rs((typ+5)/2,15,19); // add 5/6 words error correction
	b = (typ*3-1)/2; // 7/10 bits per side
	j = lay ? 0 : 10; // XOR Aztec rune data
	for (eb = i = 0; i < b; i++) push(j^enc[i],4); // 8/16 words to 4 chunks
	for (i = 2-typ, j = 1; i < typ-1; i++, j += j) { // layout mode data
		if (typ == 7 && i == 0) i++; // skip reference grid
		if (enc[b]&j) setCell(ctr-i,ctr-typ); // top
		if (enc[b+1]&j) setCell(ctr+typ,ctr-i); // right
		if (enc[b+2]&j) setCell(ctr+i,ctr+typ); // bottom
		if (enc[b+3]&j) setCell(ctr-typ,ctr+i); // left
	}
	return 2*ctr+1; // matrix size Aztec bar code
}

/** Code 128 symbol creation according ISO/IEC 15417:2007
* @param setCell call back drawing function(x,0)
* @param text to encode
* @return width of symbol (modules)
*/
function code128(setCell, text) {
	var t = 3, enc = [], i, j, c;
	for (i = 0; i < text.length; i++) {
		c = text.charCodeAt(i);
		if (t != 2) { // alpha mode
			for (j = 0; j+i < text.length; j++) // count digits
				if (text.charCodeAt(i+j)-48>>>0 > 9) break; // digit ?
			if ((j > 1 && i == 0) || (j > 3 && (i+j < text.length || (j&1) == 0))) {
				enc.push(i == 0 ? 105 : 99); // Start / Code C
				t = 2; // to digit
			}
		}
		if (t == 2) // digit mode
			if (c-48>>>0 < 10 && i+1 < text.length && text.charCodeAt(i+1)-48>>>0 < 10)
				enc.push(+text.substr(i++,2)); // 2 digits
			else t = 3; // exit digit
		if (t != 2) { // alpha mode
			if (t > 2 || ((c&127) < 32 && t) || ((c&127) > 95 && !t)) { // change ?
				for (j = t > 2 ? i : i+1; j < text.length; j++) // A or B needed?
					if ((text.charCodeAt(j)-32)&64) break; // < 32 or > 95
				j = j == text.length || (text.charCodeAt(j)&96) ? 1 : 0;
				enc.push(i == 0 ? 103+j : j != t ? 101-j : 98); // start:code:shift
				t = j; // change mode
			}
			if (c > 127) enc.push(101-t); // FNC4: code chars > 127
			enc.push(((c&127)+64)%96);
		}
	}
	if (i == 0) enc.push(103); // empty message
	j = enc[0]; // check digit
	for (i = 1; i < enc.length; i++) j += i*enc[i];
	enc.push(j%103); enc.push(106); // stop

	c = [358,310,307,76,70,38,100,98,50,292,290,274,206,110,103,230,118,115,
		313,302,295,370,314,439,422,406,403,434,410,409,364,355,283,140,44,
		35,196,52,49,324,276,273,220,199,55,236,227,59,443,327,279,372,369,
		375,428,419,395,436,433,397,445,289,453,152,134,88,67,22,19,200,194,
		104,97,26,25,265,296,477,266,61,158,94,79,242,122,121,466,458,457,367,
		379,475,188,143,47,244,241,468,465,239,247,431,471,322,328,334,285];
	for (t = i = 0; i < enc.length; i++, t++) { // code to pattern
		setCell(t++,0);
		for (j = 256; j > 0; j >>= 1, t++)
			if (c[enc[i]]&j) setCell(t,0);
	}
	setCell(t++,0);	setCell(t,0);
	return t;
}

/** convert a black&white image matrix to minimized SVG path: [[1,0,1],
*   (needs fill-role:evenodd which only works with path)       [0,1,0]] -> 'M0 0H1V2H2V0H3V1H0Z'
* @param mat 0/1 image matrix array, will be destroyed
* @return DOM <path d='M0 0H1V2H2V0H3V1H0Z' style='fill-rule: evenodd' />
*/
function toPath(mat) { // matrix of 0/1 pixel image
	var  p = "", x, y = mat.unshift([]); // add padding zeros around image
	do	if (mat[y]) mat[y].unshift(0); 
		else mat[y] = []; 
	while (--y > 0);
	for (;;) {     // draw polygons
		for (y = 0; y+2 < mat.length; y++) // look for set pixel
			if ((x = mat[y+1].indexOf(1)-1) >= 0) break;
		if (y+2 == mat.length) break; // no pixel left
		p += "M"+x+" "+y; // move to start
		for (var x0 = x, y0 = y, d = 0;;) { // encircle pixel area
			do x += 1-2*d; // move left/right
			while ((mat[y][x+1-d]^mat[y+1][x+1-d])&1); // follow horizontal edge
			d ^= (mat[y][x+1]^mat[y+1][x])&1; // turn up/down
			do mat[d ? ++y : y--][x+1] ^= 2; // move and mark edge
			while ((mat[y+d][x]^mat[y+d][x+1])&1); // follow vertical edge
			if (x == x0 && y == y0) break; // returned to start
			d ^= (mat[y][x+1]^mat[y+1][x])&1; // turn left/right
			p +=  "H"+x+"V"+y; // lines to next points
		}
		p += "H"+x+"Z"; // close path
		for (d = 0, y = 1; y < mat.length-1; y++)  // clear pixel between marked edges
			for (x = 1; x < mat[y].length; x++) 
				mat[y][x] = (d ^= mat[y][x]>>1)^mat[y][x]&1; // invert pixels inside, clr marking
	}
	d = document.createElementNS("http://www.w3.org/2000/svg","path");
    d.setAttribute('d', p); // convert image to path
    d.setAttribute('style', 'fill-rule: evenodd');
	return d; // <path d='M0 0H1V2H2V0H3V1H0Z' style='fill-rule: evenodd' />
}

/** convert an image matrix to GIF base64 string <img src=".." />
* @param mat image matrix array of index colors
* @param scale optional: integer factor (1x) or [x-scale,y-scale]
* @param trans optional: transparent color index (undefined)
* @param rgb optional: table of rgb color map (black&white)
* @param max optional: maximum dictionary bits (2-12 - but large dictionaries are slow in js)
* @return string "data:image/gif;base64,imagedata"
*/
function toGif(mat,scale,trans,rgb,max) { 
	var eb = 0, ec = 0, ev = 0, i, c, dic = [], xl = 0; // encoding, pixel dictionary
	rgb = rgb||[[255,255,255],[0,0,0]]; // default colors black&white only
	if (!(scale instanceof Array)) scale = [scale||1,scale||1]; // default 1x
	for (i = mat.length; i--; xl = Math.max(xl,mat[i].length)); // get max width of matrix
	function put(val, bits) { // raster data stream
		ev |= (val<<eb)&255;
		val >>= 8-eb;
		for (eb += bits; eb > 7; eb -= 8) { // output data stream
			enc += String.fromCharCode(ev);
			if (ec++ == 254) { enc += "\xff"; ec = 0; } // new data block
			ev = val&255;
			val >>= 8;
		}
	}
	for (var colorBits = 0, colors = 2; colors < rgb.length; colors += colors, colorBits++);
	var sx, sy, x = scale[0]*xl, y = scale[1]*mat.length;
	var enc = "GIF89a"+String.fromCharCode(x&255,x>>8, y&255,y>>8, 17*colorBits+128,0,0); // global descriptor
	for (i = 0; i < colors; i++) { // global color map
		c = rgb[i]||[i,i,i]; // default color
		enc += String.fromCharCode(c[0],c[1],c[2]);
		dic[i] = String.fromCharCode(i); // init dictionary
	}
	if (trans != undefined) 
		enc += String.fromCharCode(33,249,4,1,0,0,trans,0); // extension block transparent color
	if (colorBits++ == 0) { colorBits++; colors = 4; dic.push(""); dic.push(""); } // black&white image
	enc += ",\0\0\0\0"+enc.substr(6,4)+String.fromCharCode(0,colorBits,255); // local descriptor, raster data block
	dic.push(""); dic.push(""); // add clear, reset code
	var bits = colorBits+1, code, seq = "", p;
	put(colors,bits); // clear code
	for (y = 0; y < mat.length; y++) // LZW compression
		for (sy = 0; sy < scale[1]; sy++)
			for (x = 0; x < xl; x++)
				for (sx = 0; sx < scale[0]; sx++) {
					c = mat[y][x]&(colors-1); // get pixel
					seq += p = String.fromCharCode(c);
					i = dic.indexOf(seq); // sequenze in dictionary?
					if (i < 0) { // no
						put(code,bits); // output code
						dic.push(seq); // add to dictionary
						seq = p; code = c; // new sequence
						if (dic.length-1 == 1<<bits) bits++; // increase bits
						if (bits == (max||5) && dic.length == 1<<bits) { // max 12 bits
							put(colors,bits); // clear code
							bits = colorBits+1; // reset
							dic.splice(colors+2,dic.length-colors-2); // reset dictionary
						}
					} else code = i; // append code
				}
	put(code,bits); // output remaining
	put(colors+1,bits+((24-eb-bits)&7)); // end of image
	enc = enc.substr(0,enc.length-ec-1)+String.fromCharCode(ec)+enc.substr(enc.length-ec); // length final raster data block
	return 'data:image/gif;base64,'+btoa(enc+"\0;"); // <img src=".." /> DOM gif image
}
/** fill array matrix by call back function setCell
* @param barcode_function(), parameter,..
* @return image matrix array filled by callback function
*/
function toMatrix() { // callback function(x,y) to array matrix
	var mat = [], func = arguments[0];
	arguments[0] = function(x,y) { mat[y] = mat[y] || []; mat[y][x] = 1; }; // setCell of array
	func.apply(func,arguments);
	return mat;
}
