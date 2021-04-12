	/** 2D barcode symbol creation by javascript
* @author alois zingl
* @version V2.0 july 2020
* @copyright MIT open-source license software
* @url https://zingl.github.io/
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
*	toGif(mat,scale,trans,pad,rgb)  convert array matrix to GIF image
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
function datamatrix(setCell, text, rect) {
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
		if (p+[0,2,2,2,3,0][cm] >= text.length) nm = 0; // finished, return to ascii
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
			else k = [0,0, -1,0, -2,0, 0,-1, -1,-1, -2,-1, -1,-2, -2,-2]; // nominal L-shape layout
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
* @param ver optional: minimum version size (-3:M1, -2:M2, .. 1, .. 40), set to -3 for micro QR
* @return matrix array of QR symbol ([] if text is too long)
*   needs kanji.js for unicode kanji encoding string
*/
function quickresponse(text, level, ver) { // create QR and micro QR bar code symbol
	var mode, size, align, blk, ec;
	var i, j, k, c, b, d, w, x, y, n;
	var erc=[[2, 5, 6, 8,  7,10,15,20,26,18,20,24,30,18,20,24,26,30,22,24,28,30,28,28,28,28,30,30,26,28,30,30,30,30,30,30,30,30,30,30,30,30,30,30], // error correction words L
	        [99, 6, 8,10, 10,16,26,18,24,16,18,22,22,26,30,22,22,24,24,28,28,26,26,26,26,28,28,28,28,28,28,28,28,28,28,28,28,28,28,28,28,28,28,28], // M
	        [99,99,99,14, 13,22,18,26,18,24,18,22,20,24,28,26,24,20,30,24,28,28,26,30,28,30,30,30,30,28,30,30,30,30,30,30,30,30,30,30,30,30,30,30], // Q
	        [99,99,99,99, 17,28,22,16,22,28,26,26,24,28,24,28,22,24,24,30,28,28,26,28,30,24,30,30,30,30,30,30,30,30,30,30,30,30,30,30,30,30,30,30], // H
	        [ 1, 1, 1, 1, 1,1,1,1,1,2,2,2,2,4, 4, 4, 4, 4, 6, 6, 6, 6, 7, 8, 8, 9, 9,10,12,12,12,13,14,15,16,17,18,19,19,20,21,22,24,25], // error correction blocks L
	        [ 1, 1, 1, 1, 1,1,1,2,2,4,4,4,5,5, 5, 8, 9, 9,10,10,11,13,14,16,17,17,18,20,21,23,25,26,28,29,31,33,35,37,38,40,43,45,47,49], // M
	        [ 1, 1, 1, 1, 1,1,2,2,4,4,6,6,8,8, 8,10,12,16,12,17,16,18,21,20,23,23,25,27,29,34,34,35,38,40,43,45,48,51,53,56,59,62,65,68], // Q
	        [ 1, 1, 1, 1, 1,1,2,4,4,4,5,6,8,8,11,11,16,16,18,16,19,21,25,25,25,34,30,32,35,37,40,42,45,48,51,54,57,60,63,66,70,74,77,81]  // H
	];  //   M1,M2,M3,M4,V1, 2, .. 
	var lev = 3-"HQMLhqml3210".indexOf(level||0)&3; // level "LMQH" to 0,1,2,3
	var chars = [ "0123456789", // char table for numeric
				"0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ $%*+-./:", // alpha
				String.fromCharCode.apply(null,Array(128).fill(0).map((_,i) => i)), // binary, >127 -> use utf-8
				typeof kanji === undefined || kanji.length != 7973 ? "" : kanji ]; // kanji char index (in kanji.js)
	function len(mod,chr) { // get encoding length in 1/6 bits
		if (chars[mod].indexOf(chr) >= 0) return [20,33,48,78][mod];
		return mod != 2 ? 1e9 : chr.charCodeAt(0) < 2048 ? 96 : 144; // two/three byte utf-8
	}
	function cib(mod) { // get # of bits of count indicator
		return ver < 1 ? ver+((19-2*mod)/3|0) : // micro QR
			[[10,12,14],[9,11,13],[8,16,16],[8,10,12]][mod][(ver+7)/17|0]; // QR
	}
	function push(val,bits) { // add data to bit stream
		val <<= 8; eb += bits;
		enc[enc.length-1] |= val>>eb;
		while (eb > 7) enc[enc.length] = (val>>(eb -= 8))&255;
	}
	/** compute symbol version size, ver < 1: micro QR */
	ver = ver === undefined ? 1 : ver-1;
	do { // increase version till message fits
		if (++ver >= erc[0].length-3) return []; // text too long for QR
		if (ver < 2 || ver == 10 || ver == 27) { // recompute stream
			var enc = [0], el, eb = 0; // encoding data, length, bits
			var head = []; // calculate the bit table using dynamic programming:
			for (j = 0; j < 4; j++) // www.nayuki.io/page/optimal-text-segmentation-for-qr-codes
				head.push((Math.min(4,ver+3)+cib(j))*6); // segment head sizes
			var bits = [[]], cost = head.slice(); // cost table in 1/6 bits
			for (i = text.length; i-- > 0; ) { // data analysis
				bits.unshift(cost.slice()); // record costs
				for (j = 0; j < cost.length; j++) // accumulate costs from back
					cost[j] += len(j,text.charAt(i));
				b = Math.min.apply(null,cost);
				for (j = 0; j < cost.length; j++) // switch to shorter encoding
					cost[j] = Math.min(cost[j],((b+5)/6|0)*6+head[j]);
			}
			n = mode = cost.indexOf(b); // start encoding with mode of fewest bits
			for (i = j = 0; j++ < text.length; ) { // calc optimal encoding for each char
				for (k of [2,3,1,0]) { // check binary, kanji, alpha, numeric mode
					b = bits[j][k]+len(k,text.charAt(j))+5; // switch to shorter encoding
					if (b < 1e7 && (mode == k || 6*(b/6|0) == bits[j-1][mode]-head[mode])) n = k;
				}
				if (mode != n || j == text.length) { // mode changes -> encode previous
					if (ver < -1 && ver+3 < mode) push(0,50); // prevent illegal mode
					if (ver > 0) push(1<<mode,4); // mode indicator, QR
					else push(mode,ver+3); // mode indicator micro QR
					b = unescape(encodeURIComponent(text.substring(i,j))); // to utf-8
					push(mode == 2 ? b.length : j-i,cib(mode)); // character count indicator
					if (mode == 0) { // encode numeric data
						for (; i < j-2; i += 3)
							push(text.substr(i,3),10); // 3 digits in 10 bits
						if (i < j) push(text.substring(i,j),j-i == 1 ? 4 : 7);
					} else if (mode == 1) { // encode alphanumeric data
						for (; i < j-1; i += 2)  // 2 chars in 11 bits
							push(chars[1].indexOf(text.charAt(i))*45+chars[1].indexOf(text.charAt(i+1)),11);
						if (i < j) push(chars[1].indexOf(text.charAt(i)),6);
					} else if (mode == 2) // encode binary (utf-8)
						for (i = 0; i < b.length; i++)
							push(b.charCodeAt(i),8); // 1 char in 8 bits
					else for (; i < j; i++) // encode kanji
							push(chars[3].indexOf(text.charAt(i)),13); // 1 char in 13 bits
					i = j; mode = n; // next segment
				}
			}
		}
		size = ver*(ver < 1 ? 2 : 4)+17; // symbol size
		align = ver < 2 ? 0 : (ver/7|0)+2; // # of align patterns
		el = (size-1)*(size-1)-(5*align-1)*(5*align-1); // total bits - align - timing
		el -= ver < 1 ? 59 : ver < 2 ? 191 : ver < 7 ? 136 : 172; // finder, version, format
		i = ver < 1 ? 8-(ver&1)*4 : 8; // M1+M3: last byte only one nibble
		c = erc[lev+4][ver+3]*erc[lev][ver+3]; // # of error correction blocks/bytes
	} while ((el&-8)-c*8 < enc.length*8+eb-i); // message fits in version

	for (;(!level || (level.charCodeAt(0)&-33) == 65) && lev < 3; lev++) { // if level undefined or 'A'
		j = erc[lev+5][ver+3]*erc[lev+1][ver+3]; // increase security level
		if ((el&-8)-j*8 < enc.length*8+eb-i) break; // if data fits in same size
	}
	blk = erc[lev+4][ver+3]; // # of error correction blocks
	ec = erc[lev][ver+3]; // # of error correction bytes
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
		c = (ver+1)/(1-align)*4&-2; // alignment pattern spacing
		for (x = 0; x < align; x++) // alignment grid
			for (y = 0; y < align; y++) 
				if ((x > 0 && y > 0) || (x != y && x+y != align-1)) // no align at finder
					set(x == 0 ? 4 : size-9+c*(align-1-x), // set alignment pattern
						y == 0 ? 4 : size-9+c*(align-1-y), [31,17,21,17,31]);
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
	var get = [ function(x,y) { return ((x+y|mat[y][x]>>1)^mat[y][x])&1^1; }, // pattern generation conditions
	            function(x,y) { return ((y|mat[y][x]>>1)^mat[y][x])&1^1; },
	            function(x,y) { return ((x%3>0|mat[y][x]>>1)^mat[y][x])&1^1; },
	            function(x,y) { return (((x+y)%3>0|mat[y][x]>>1)^mat[y][x])&1^1; },
	            function(x,y) { return ((x/3+(y>>1)|mat[y][x]>>1)^mat[y][x])&1^1; },
	            function(x,y) { return ((((x*y)&1)+x*y%3>0|mat[y][x]>>1)^mat[y][x])&1^1; },
	            function(x,y) { return ((x*y+x*y%3|mat[y][x]>>1)^mat[y][x])&1^1; },
	            function(x,y) { return ((x+y+x*y%3|mat[y][x]>>1)^mat[y][x])&1^1; } ];
	if (ver < 1) get = [get[1],get[4],get[6],get[7]]; // mask pattern for micro QR
	var msk, pen = 30000, p;
	for (var m = 0; m < get.length; m++) { // compute penalty of masks
		x = y = p = d = 0;
		if (ver < 1) { // penalty micro QR
			for (i = 1; i < size; i++) {
				x -= get[m](i,size-1);
				y -= get[m](size-1,i);
			}
			p = x > y ? 16*x+y : x+16*y;
		} else { // penalty QR
			[	[[1,1,1,1,1]], [[0,0,0,0,0]], // N1 >4 adjacent
				[[1,1],[1,1]], [[0,0],[0,0]], // N2 block 2x2
				[[1,0,1,1,1,0,1,0,0,0,0]], [[0,0,0,0,1,0,1,1,1,0,1]], // N3 like finder
				[[1]] // N4 darks
			].forEach(function(pat,pi) { // look for pattern
				for (p += d, d = y = 0; y+pat.length <= size; y++) {
					var add = [3,3,40,1, 3,0,40,0]; // N1, N2, N3, N4; horizontal/vertical
					for (x = 0; x+pat[0].length <= size; x++) {
						i = j = 1;
						for (var py = 0; py < pat.length; py++)
							for (var px = 0; px < pat[py].length; px++) {
								if (get[m](x+px,y+py) != pat[py][px]) i = 0; // horizontal
								if (get[m](y+py,x+px) != pat[py][px]) j = 0; // vertical
							}
						d += add[pi>>1]*i+add[pi>>1|4]*j; // add penalty
						add[0] = 3-2*i; add[4] = 3-2*j; // toggle N1: 3-1-1-...
					}
				}
			});
			p += Math.floor(Math.abs(10-20*d/(size*size)))*10; // N4: darks
		}
		if (p < pen) { pen = p; msk = m; } // take mask of lower penalty
	}
	for (y = 0; y < size; y++) // remove reservation, apply mask
		for (x = 0; x < size; x++) 
			mat[y][x] = get[msk](x,y);

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
* @param lay optional: minimum number of layers (size), default autodetect
* @return array size (0 if text too long for Aztec)
*/
function aztec(setCell, text, sec, lay) { // make Aztec bar code
	var e = 20000, BackTo, numBytes, CharSiz = [5,5,5,5,4];
	var LatLen = [[ 0,5,5,10,5,10], [9,0,5,10,5,10], [5,5,0,5,10,10],
	             [5,10,10,0,10,15], [4,9,9,14,0,14], [0,0,0,0,0,0]];
	var ShftLen =  [[0,e,e,5,e], [5,0,e,5,e], [e,e,0,5,e], [e,e,e,0,e], [4,e,e,4,0]];
	var Latch = [[[],  [28],    [29],   [29,30],[30],   [31]], // from upper to ULMPDB
	            [[30,14],[],    [29],   [29,30],[30],   [31]], //      lower
	            [[29],  [28],   [],     [30],   [28,30],[31]], //      mixed
	            [[31],  [31,28],[31,29],[],	    [31,30],[31,31]], //   punct
	            [[14],  [14,28],[14,29],[14,29,30],[],  [14,31]]]; //  digit
	var CharMap = [	"  ABCDEFGHIJKLMNOPQRSTUVWXYZ", // upper
	                "  abcdefghijklmnopqrstuvwxyz", // lower
	                String.fromCharCode(0,32,1,2,3,4,5,6,7,8,9,10,11,12,13,
	                    7,28,29,30,31,64,92,94,95,96,124,126,127), // mixed
	                " \r\r\r\r\r!\"#$%&'()*+,-./:;<=>?[]{}", // punct
	                "  0123456789,."]; // digit
	var enc, el = text.length, b, typ = 0, x,y, ctr, c, i, j, l;

	function stream(seq, val, bits) { // add data to bit stream 
		var eb = seq[0]%b+bits; // first element is length in bits
		val <<= b; seq[0] += bits; // b - word size in bits
		seq[seq.length-1] |= val>>eb; // add data
		while (eb >= b) { // word full?
			bits = seq[seq.length-1]>>1;
			if (typ == 0 && (bits == 0 || 2*bits+2 == 1<<b)) { // bit stuffing: all 0 or 1
				seq[seq.length-1] = 2*bits+(1&bits^1); // insert complementary bit
				seq[0]++; eb++;
			}
			eb -= b;
			seq.push((val>>eb)&((1<<b)-1));
		}
	}
	function binary(seq, pos) { // encode numBytes of binary
		seq[0] -= numBytes*8+(numBytes > 31 ? 16 : 5); // stream() adjusts len too -> remove
		stream(seq, numBytes > 31 ? 0 : numBytes, 5); // len
		if (numBytes > 31) stream(seq, numBytes-31, 11); // long len
		for (var i = pos-numBytes; i < pos; i++)
			stream(seq, text.charCodeAt(i), 8); // bytes
	}
	/** encode text */
	sec = 100/(100-Math.min(Math.max(sec||25,0),90)); // limit percentage of check words to 0-90%
	for (j = c = 4; ; c = b) { // compute word size b: 6/8/10/12 bits
		j = Math.max(j,(Math.floor(el*sec)+3)*c); // total needed bits, at least 3 check words
		b = j <= 240 ? 6 : j <= 1920 ? 8 : j <= 10208 ? 10 : 12; // bit capacity -> word size
		if (lay) b = Math.max(b, lay < 3 ? 6 : lay < 9 ? 8 : lay < 23 ? 10 : 12); // parameter
		if (c >= b) break; // fits in word size

		var Cur = [[0,0],[e],[e],[e],[e],[e]]; // current sequence for [U,L,M,P,D,B]
		for (i = 0; i < text.length; i++) { // calculate shortest message sequence
			for (var to = 0; to < 6; to++) // check for shorter latch to
				for (var frm = 0; frm < 6; frm++) // if latch from
					if (Cur[frm][0]+LatLen[frm][to] < Cur[to][0] && (frm < 5 || to == BackTo)) {
						Cur[to] = Cur[frm].slice(); // replace by shorter sequence
						if (frm < 5) // latch from shorter mode
							Latch[frm][to].forEach(lat => stream(Cur[to], lat, lat < 16 ? 4 : 5));
						else 
							binary(Cur[to], i); // return from binary -> encode
						if (to == 5) { BackTo = frm; numBytes = 0; Cur[5][0] += 5; } // begin binary shift
					}
			var Nxt = [[e],[e],[e],[e],[e],Cur[5]]; // encode char
			var twoChar = ["\r\n",". ",", ",": "].indexOf(text.substr(i,2)); // special 2 char sequences
			for (to = 0; to < 5; to++) { // to sequence
				var idx = twoChar < 0 ? CharMap[to].indexOf(text.substr(i,1),1) : twoChar+2; // index to map
				if (idx < 0 || (twoChar >= 0 && to != 3)) continue; // char in set ?
				for (frm = 0; frm < 5; frm++) // encode char
					if (Cur[frm][0]+ShftLen[frm][to]+CharSiz[to] < Nxt[frm][0]) {
						Nxt[frm] = Cur[frm].slice();
						if (frm != to) // add shift
							stream(Nxt[frm], to == 3 ? 0 : frm < 4 ? 28 : 15, CharSiz[frm]);
						stream(Nxt[frm], idx, CharSiz[to]); // add char
					}
			}
			Nxt[5][0] += numBytes++ == 31 ? 19 : 8; // binary exeeds 31 bytes
			if (twoChar >= 0) { i++; Nxt[5][0] += numBytes++ == 31 ? 19 : 8; } // 2 char seq: jump over 2nd
			Cur = Nxt; // take next sequence
		}
		binary(Cur[5], text.length); // encode remaining bytes
		enc = Cur.reduce(function(a,b) { return a[0] < b[0] ? a : b; }); // get shortest sequence
		i = b-enc[0]%b; if (i < b) stream(enc,(1<<i)-1,i); // padding
		enc.pop(); // remove 0-byte
		el = enc.shift()/b|0; // get encoding length
	}
	if (el > 1660) return 0; // message too long
	typ = j > 608 || el > 64 || (lay && lay > 4) ? 14 : 11; // full or compact Aztec finder size
	var mod = parseInt(text); // Aztec rune possible?
	if (mod >= 0 && mod < 256 && mod+"" == text && !lay) lay = 0; // Aztec rune 0-255
	else lay = Math.max(lay||0,Math.min(32,(Math.ceil((Math.sqrt(j+typ*typ)-typ)/4)))); // needed layers
	var ec = Math.floor((8*lay*(typ+2*lay))/b)-el; // # of error words
	typ >>= 1; ctr = typ+2*lay; ctr += (ctr-1)/15|0; // center position

	/** compute Reed Solomon error detection and correction */
	function rs(ec,s,p) { // # of checkwords, polynomial bit size, generator polynomial
		var rc = new Array(ec+2), i, j, el = enc.length; // reed/solomon code
		var lg = new Array(s+1), ex = new Array(s); // log/exp table for multiplication
		for (j = 1, i = 0; i < s; i++) { // compute log/exp table of Galois field
			ex[i] = j; lg[j] = i;
			j += j; if (j > s)  j ^= p; // GF polynomial
		}
		for (rc[ec+1] = i = 0; i <= ec; i++) // compute RS generator polynomial
			for (j = ec-i, rc[j] = 1; j++ < ec; )
				rc[j] = rc[j+1]^ex[(lg[rc[j]]+i)%s];
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
		do x += dx; while (typ == 7 && (x&15) == 0); // skip reference grid
		do y += dy; while (typ == 7 && (y&15) == 0);
	}
	if (lay > 0) { // layout the message
		rs(ec,(1<<b)-1,[67,301,1033,4201][b/2-3]); // error correction, generator polynomial
		x = -typ; y = x-1; // start of layer 1 at top left
		j = l = (3*typ+9)/2; // length of inner side
		var dx = 1, dy = 0; // direction right
		while ((c = enc.pop()) !== undefined) // data in reversed order inside to outside
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
	b = (typ*3-1)/2; // 7/10 bits per side
	for (i = typ-2; i-- > 0; mod >>= 4) enc[i] = mod&15; // mode to 4 bit words
	rs((typ+5)/2,15,19); // add 5/6 words error correction
	enc.push(0); j = lay ? 0 : 10; // XOR Aztec rune data
	for (i = 1; i <= b; i++) stream(enc,j^enc[i],4); // 8/16 words to 4 sides
	for (i = 2-typ, j = 1; i < typ-1; i++, j += j) { // layout mode data
		if (typ == 7 && i == 0) i++; // skip reference grid
		if (enc[b+1]&j) setCell(ctr-i,ctr-typ); // top
		if (enc[b+2]&j) setCell(ctr+typ,ctr-i); // right
		if (enc[b+3]&j) setCell(ctr+i,ctr+typ); // bottom
		if (enc[b+4]&j) setCell(ctr-typ,ctr+i); // left
	}
	return 2*ctr+1; // matrix size Aztec barcode
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
* @param pad optional: padding arround image in cells (1+5%)
* @param rgb optional: table of rgb color map (black&white)
* @param max optional: maximum dictionary bits (2-12 - but large dictionaries are slow in js)
* @return string "data:image/gif;base64,imagedata"
*/
function toGif(mat, scale, trans, pad, rgb, max) { 
	var eb = 0, ec = 0, ev = 0, i, c, dic = [], xl = 0; // encoding, pixel dictionary
	rgb = rgb||[[255,255,255],[0,0,0]]; // default colors black&white only
	if (!(scale instanceof Array)) scale = [scale||1,scale||1]; // default 1x
	for (i = mat.length; i--; xl = Math.max(xl,mat[i].length)); // get max width of matrix
	if (pad === undefined) pad = 1+xl/20|0; // padding around barcode
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
	var sx, sy, x = scale[0]*(xl+2*pad), y = scale[1]*(mat.length+2*pad);
	var enc = "GIF89a"+String.fromCharCode(x&255,x>>8, y&255,y>>8, 17*colorBits+128,0,0); // global descriptor
	for (i = 0; i < colors; i++) { // global color map
		c = rgb[i]||[i,i,i]; // default color
		enc += String.fromCharCode(c[0],c[1],c[2]);
		dic[i] = String.fromCharCode(i); // init dictionary
	}
	if (trans !== undefined) 
		enc += String.fromCharCode(33,249,4,1,0,0,trans,0); // extension block transparent color
	if (colorBits++ == 0) { colorBits++; colors = 4; dic.push(""); dic.push(""); } // black&white image
	enc += ",\0\0\0\0"+enc.substr(6,4)+String.fromCharCode(0,colorBits,255); // local descriptor, raster data block
	dic.push(""); dic.push(""); // add clear, reset code
	var bits = colorBits+1, code, seq = "", p;
	put(colors,bits); // clear code
	for (y = -pad; y < pad+mat.length; y++) // LZW compression
		for (sy = 0; sy < scale[1]; sy++)
			for (x = -pad; x < pad+xl; x++)
				for (sx = 0; sx < scale[0]; sx++) {
					c = x < 0 || y < 0 || x >= xl || y >= mat.length ? 0 : mat[y][x]&(colors-1); // get pixel
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
