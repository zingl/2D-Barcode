import uno
import unohelper
from com.sun.star.awt import Size, Point
# 2D barcode symbol creation by javascript
# @author alois zingl
# @version V15.50 dec 2015
# @copyright MIT open-source license software
# @url https://github.com/zingl/2D-Barcode
# @description the indention of this library is a short and compact implementation to create the 2D barcodes 
#  of Data Matrix, (micro) QR or Aztec symbols so it could be easily adapted for individual requirements.
#  Data Matrix and Aztec barcodes immediately  set the cells by a callback function, QR returns an array matrix.
#  All could be converted to an array matrix, SVG path or GIF image.
#  The smallest bar code symbol fitting the data is automatically selected,
#  but no size optimization for mixed data types in one code is done.
# functions: 
#	datamatrix(setCell,text,rect)   create Data Matrix barcode
#	quickresponse(text,level,ver)   create QR and micro QR barcode
#	aztec(setCell,text,sec,lay)     create Aztec, compact Aztec and Aztec runes
#	code128(setCell,text)           create Code 128 barcode
#	toPath(mat)                     convert array matrix to SVG path
#	toGif(mat,scale,trans,rgb,max)  convert array matrix to GIF image
#	toMatrix()                      fill array matrix by call back function setCell
#  there is no dependency between functions, just copy the ones you need

# Data Matrix symbol creation according ISO/IEC 16022:2006
# @param setCell call back drawing function(x,y)
# @param text to encode
# @param rect optional: flag - true for rectangular barcode
# @return array [width,height] of symbol ([0,0] if text too long)
	
def DataMatrix(text, rect = True):
	"""Data Matrix symbol creation according ISO/IEC 16022:2006"""

	def toAscii(text): # ASCII mode encoding
		enc = []; i = 0
		while i < len(text):
			c, i = text[i], i+1
			c1 = text[i] if i < len(text) else 0
			if 48 <= c < 58 and 48 <= c1 < 58:
				enc.append((c-48)*10+c1-48+130)
				i += 1 # 2 digits
			elif c > 127:
				enc.append(235) # extended char
				enc.append((c-127)&255)
			else:
				enc.append(c+1) # char
		return enc

	def toText(text, sft): # C40, TEXT and X12 modes encoding
		cc = cw = i = 0; enc = []
		def push(val): # pack 3 chars in 2 codes
			nonlocal cw, cc
			cw, cc = 40*cw+val, cc+1
			if cc == 3: # full, add code
				cw += 1
				enc.append(cw>>8)
				enc.append(cw&255)
				cw = cc = 0
		
		enc.append(sft[0]) # start switch
		while i < len(text):
			ch, j = text[i], 1
			if cc == 0 and i == len(text)-1: break # last char in ASCII is shorter 
			if ch > 127 and enc[0] != 238: # extended char
				push(1); push(30)
				ch -= 128 # hi bit in C40 & TEXT
			while ch > sft[j]: j = j+3 # select char set
			s = sft[j+1] # shift
			if s == 8 or (s == 9 and cc == 0 and i == len(text)-1):
				return [] # char not in set or padding fails
			if s < 5 and cc == 2 and i == len(text)-1:
				break #last char in ASCII
			if s < 5: push(s) # shift
			push(ch-sft[j+2]) # char offset
			i += 1
		if cc == 2 and enc[0] != 238: push(0) # add pad
		enc.append(254) # return to ASCII
		if cc > 0 or i < len(text):
			enc = enc + toAscii(text[i-cc:]) # last chars
		return enc
		
	def toEdifact(text): # EDIFACT encoding
		l = (len(text)+1)&-4
		cw = 0; enc = []
		if l > 0: enc.append(240) # switch to Edifact
		for i in range(l):
			if i < l-1: # encode char
				ch = text[i]
				if ch < 32 or 94 < ch: return [] # not in set
			else: ch = 31 # return to ASCII
			cw = cw*64+(ch&63)
			if (i&3) == 3:
				enc.append(cw>>16) # 4 data in 3 words
				enc.append((cw>>8)&255)
				enc.append(cw&255)
				cw = 0
		return enc if l > len(text) else enc + toAscii(text[0 if l == 0 else l-1:]) # last chars

	def toBase(text): # Base256 encoding
		i = len(text); enc = []
		enc.append(231) # switch to Base 256
		if i > 250: enc.append((i//250+37)&255) # length high
		enc.append((i%250+(149*(len(enc)+1))%255+1)&255) # length low
		for c in text:
			enc.append((c+(149*(len(enc)+1))%255+1)&255)
		return enc
	
	text = text.encode('utf-8')
	print(text)
	enc = toAscii(text)
	el = len(enc)
	k = toText(text, [230, 31,0,0, 32,9,32-3, 47,1,33, 57,9,48-4,
			64,1,58-15, 90,9,65-14, 95,1,91-22, 127,2,96, 255,1,0]) # C40
	l = len(k)
	if 0 < l < el: enc, el = k, l # take shorter encoding
	k = toText(text, [239, 31,0,0, 32,9,32-3, 47,1,33, 57,9,48-4, 64,1,58-15,
			90,2,64, 95,1,91-22, 122,9,97-14, 127,2,123-27, 255,1,0]) # TEXT
	l = len(k)
	if 0 < l < el: enc, el = k, l # take shorter encoding
	k = toText(text, [238, 12,8,0, 13,9,13, 31,8,0, 32,9,32-3, 41,8,0,
			42,9,42-1, 47,8,0, 57,9,48-4, 64,8,0, 90,9,65-14, 255,8,0]) # X12
	l = len(k)
	if 0 < l < el: enc, el = k, l # take shorter encoding
	print(enc)
	k = toEdifact(text)
	l = len(k)
	if 0 < l < el: enc, el = k, l # take shorter encoding
	print(enc)
	k = toBase(text)
	l = len(k)
	if 0 < l < el: enc, el = k, l # take shorter encoding
	print(enc)
	
	b = nc = nr = 1 # compute symbol size
	if rect and el < 50:  # rectangular symbol possible
		k = [16,7, 28,11, 24,14, 32,18, 32,24, 44,28]  # symbol width, checkwords
		for j in range(0,len(k),2):
			w = k[j]  # width w/o finder pattern
			h = 6+(j&12)  #height
			l = w*h//8  # of bytes in symbol
			s = k[j+1]
			if l-s >= el: break  # data + check fit in symbol?
		if w > 25: nc = 2  # column regions
	else:  # square symbol
		w = h = 6
		i = 2  # size increment
		for s in [5,7,10,12,14,18,20,24,28,36,42,48,56,68,84,
				112,144,192,224,272,336,408,496,620, 0]: # RS checkwords
			if s == 0: return [[]]  # message too long for Datamatrix
			if w > 11*i: i = 4+i&12  # advance increment
			w = h = h+i
			l = w*h//8
			if l-s >= el: break
		if w > 27: nr = nc = 2*(w//54)+2 # regions
		if l > 255: b = 2*(l>>9)+2 # blocks
	fw, fh = w//nc, h//nr  # region size
	if el < l-s: enc.append(129); el += 1  # first padding
	while el < l-s:  # add more padding
		el += 1
		enc.append((((149*el)%253)+130)%254)
		
	enc += [0]*s; s = s//b  # compute Reed Solomon error detection and correction
	lg = [0]*256; ex = [0]*255  # log/exp table for multiplication
	j = 1; rs = [0]*70  # reed/solomon code of Galois field
	for i in range(255): # compute log/exp table
		ex[i] = j; lg[j] = i
		j += j  # GF polynomial a^8+a^5+a^3+a^2+1 = 100101101b = 301
		if j > 255: j ^= 301
	for i in range(1, s+1):  # compute RS generator polynomial
		rs[s-i] = 1
		for j in range(s-i, s):
			rs[j] = rs[j+1]^ex[(lg[rs[j]]+i)%255]
	for c in range(b):  # compute RS correction data for each block
		rc = [0]*(s+1)
		for i in range(c, el, b):
			x = rc[0]^enc[i]
			for j in range(s):
				rc[j] = rc[j+1]^(ex[(lg[rs[j]]+lg[x])%255] if x else 0)
		for i in range(s):  # add interleaved correction data
			enc[el+c+i*b] = rc[i]

	# layout perimeter finder pattern, 0/0 = upper left corner
	mat = [[0]*(w+2*nc+2)]+[[0]+[1 if x%(fw+2)==0 or (y+1)%(fh+2)==0 or 
		((x+1)%(fw+2)==0 and y&1) or (y%(fh+2)==0 and 1^x&1) else 0 
		for x in range(w+2*nc)]+[0] for y in range(h+2*nr)]+[[0]*(w+2*nc+2)]
	# layout data
	s, c, r = 2, -2, 6  # step,column,row of data position
	i = 0
	while i < l:
		r -= s; c += s  # diagonal steps
		if r == h-3 and c == -1:  # corner A layout
			k = [w,6-h, w,5-h, w,4-h, w,3-h, w-1,3-h, 3,2, 2,2, 1,2]
		elif r == h+1 and c == 1 and (w&7) == 0 and (h&7) == 6:  # corner D layout
			k = [w-2,-h, w-3,-h, w-4,-h, w-2,-1-h, w-3,-1-h, w-4,-1-h, w-2,-2, -1,-2]
		else:
			if r == 0 and c == w-2 and (w&3):
				continue  # omit corner B
			if r < 0 or c >= w or r >= h or c < 0:  # outside
				s = -s;	r += 2+s//2; c += 2-s//2  # turn around
				while r < 0 or c >= w or r >= h or c < 0:
					r -= s;	c += s
			if r == h-2 and c == 0 and (w&3):  # corner B layout
				k = [w-1,3-h, w-1,2-h, w-2,2-h, w-3,2-h, w-4,2-h, 0,1, 0,0, 0,-1]
			elif r == h-2 and c == 0 and (w&7) == 4:  # corner C layout
				k = [w-1,5-h, w-1,4-h, w-1,3-h, w-1,2-h, w-2,2-h, 0,1, 0,0, 0,-1]
			elif r == 1 and c == w-1 and (w&7) == 0 and (h&7) == 6:
				continue  # omit corner D
			else: k = [0,0, -1,0, -2,0, 0,-1, -1,-1, -2,-1, -1,-2, -2,-2]  # nominal byte layout
		el, j, i = enc[i], 0, i+1
		while el > 0:  # layout each bit
			if el&1:
				x, y = c+k[j], r+k[j+1]
				if x < 0: x += w; y += 4-((w+4)&7)  # wrap around
				if y < 0: y += h; x += 4-((h+4)&7)
				mat[y+y//fh*2+2][x+x//fw*2+2] = 1  # add region gap
			j += 2;	el >>= 1
	for i in range(w&-4,w): mat[i+2][i+2] = 1 # unfilled corner

	return mat

def QRCode(text, level='L', ver=-1):
	"""QR Code 2005 bar code symbol creation according ISO/IEC 18004:2006"""
	def alpha(c):  # char code of alphanumeric encoding
		return "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ $%*+-./:".find(c)
	enc = [0]; el = eb = 0  # encoding data, length, bits
	try: from kanji import jis # conversion string from unicode to JIS for japanese Kanji mode
	except: jis = ""
	erc = [  # error correction words L,M,Q,H, blocks L,M,Q,H
		[2,99,99,99, 1,1,1,1], # micro QR version M1 (99=N/A)
		[5,6,99,99, 1,1,1,1], # M2
		[6,8,99,99, 1,1,1,1], # M3
		[8,10,14,99, 1,1,1,1], # M4
		[7,10,13,17, 1,1,1,1], # QR version 1
		[10,16,22,28, 1,1,1,1], # 2
		[15,26,18,22, 1,1,2,2], # 3
		[20,18,26,16, 1,2,2,4], # 4
		[26,24,18,22, 1,2,4,4], # 5
		[18,16,24,28, 2,4,4,4], # 6
		[20,18,18,26, 2,4,6,5], # 7
		[24,22,22,26, 2,4,6,6], # 8
		[30,22,20,24, 2,5,8,8], # 9
		[18,26,24,28, 4,5,8,8], # 10
		[20,30,28,24, 4,5,8,11], # 11
		[24,22,26,28, 4,8,10,11], # 12
		[26,22,24,22, 4,9,12,16], # 13
		[30,24,20,24, 4,9,16,16], # 14
		[22,24,30,24, 6,10,12,18], # 15
		[24,28,24,30, 6,10,17,16], # 16
		[28,28,28,28, 6,11,16,19], # 17
		[30,26,28,28, 6,13,18,21], # 18
		[28,26,26,26, 7,14,21,25], # 19
		[28,26,30,28, 8,16,20,25], # 20
		[28,26,28,30, 8,17,23,25], # 21
		[28,28,30,24, 9,17,23,34], # 22
		[30,28,30,30, 9,18,25,30], # 23
		[30,28,30,30, 10,20,27,32], # 24
		[26,28,30,30, 12,21,29,35], # 25
		[28,28,28,30, 12,23,34,37], # 26
		[30,28,30,30, 12,25,34,40], # 27
		[30,28,30,30, 13,26,35,42], # 28
		[30,28,30,30, 14,28,38,45], # 29
		[30,28,30,30, 15,29,40,48], # 30
		[30,28,30,30, 16,31,43,51], # 31
		[30,28,30,30, 17,33,45,54], # 32
		[30,28,30,30, 18,35,48,57], # 33
		[30,28,30,30, 19,37,51,60], # 34
		[30,28,30,30, 19,38,53,63], # 35
		[30,28,30,30, 20,40,56,66], # 36
		[30,28,30,30, 21,43,59,70], # 37
		[30,28,30,30, 22,45,62,74], # 38
		[30,28,30,30, 24,47,65,77], # 39
		[30,28,30,30, 25,49,68,81]] # 40
	level = "LMQHlmqh0123".find(level)&3 # level "LMQH" to 0,1,2,3
	mode = 0 # data analysis 
	for i in text: # compute mode
		c = ord(i)
		if 48 <= c < 58: continue # numeric
		if mode == 0: mode = 1 # alphanumeric at least
		if alpha(i) >= 0: continue
		if mode == 1: mode = 2 # binary mode
		if 32 <= c < 127: continue
		if jis.find(chr(c), len(jis)>>1) < 0: mode = 2; break
		mode = 3 # Kanji mode
	if mode == 2: text = text.encode('utf-8') # unicode to UTF-8
	# compute symbol version size, ver < 1: micro QR
	w = int(len(text)*[10/3,11/2,8,13][mode]+0.7) # code len:
		# 3 digits in 10 bits, 2 chars in 11 bits, 1 byte, 13 bits/byte
	c = [[10,12,14],[9,11,13],[8,16,16],[8,10,12]][mode] # # of bits of count indicator
	ver = mode-4 if ver < mode-3 else ver-1
	while True: # increase version till message fits
		ver += 1
		if ver >= len(erc)-3: return [] # text too long for QR
		blk = erc[ver+3][level+4] # # of error correction blocks
		ec = erc[ver+3][level] # # of error correction bytes
		size = ver*(2 if ver < 1 else 4)+17 # symbol size
		align = 0 if ver < 2 else ver//7+2 # # of align patterns
		el = (size-1)*(size-1)-(5*align-1)*(5*align-1) # total bits - align - timing
		el -= 59 if ver < 1 else 191 if ver < 2 else 136 if ver < 7 else 172 # finder, version, format
		el = (el>>3)-ec*blk # remaining data bytes
		k = ver+(19-2*mode)//3 if ver < 1 else c[(ver+7)//17] # count indicator bits
		i = ver+(ver&1)*4+3 if ver < 1 else 4 # mode indicator bits, M1+M3: +4 bits
		if 8*el >= w+i+k: break # message fits in version
	w = el//blk # # of words in group 1 (group 2: w+1)
	b = blk+w*blk-el # # of blocks in group 1 (group 2: blk-b)

	# encode head indicator
	def push(val, bits): # add data to bit stream
		nonlocal enc, eb
		val <<= 8; eb += bits
		enc[len(enc)-1] |= val>>eb
		while eb > 7: 
			eb -= 8
			enc.append((val>>eb)&255)
	if ver > 0: push(1<<mode, 4) # mode indicator, QR
	else: push(mode, ver+3) # mode indicator micro QR
	push(len(text), k) # character count indicator

	# encode data
	if mode == 0: # encode numeric data
		for i in range(0, len(text)-2, 3):
			push(int(text[i:i+3]),10) # 3 digits in 10 bits
		if len(text)%3: push(int(text[len(text)//3*3:]), 4 if len(text)%3 == 1 else 7)
	elif mode == 1: # encode alphanumeric data
		for i in range(0, len(text)-1, 2): # 2 chars in 11 bits
			push(alpha(text[i])*45+alpha(text[i+1]), 11)
		if len(text)&1: push(alpha(text[-1]), 6)
	elif mode == 2: # encode binary data
		for i in text: push(i,8) # 1 char in 8 bits
	else:
		for i in text: # encode Kanji
			c = jis.find(i,len(jis)>>1)-len(jis)>>1 # unicode to..
			c = ord(jis[c])&0x3fff-320 # shift JIS X 0208
			push((c>>8)*192+(c&255), 13) # 1 char in 13 bits
	if (-3&ver) == -3 and el == len(enc):
		enc[w-1] >>= 4 # M1, M3: shift high bits to low nibble
	if el >= len(enc): push(0, 4 if ver > 0 else ver+6) # terminator
	if eb == 0 or el < len(enc): enc.pop() # bit padding
	i = 236
	while el > len(enc): # byte padding
		i ^= 236^17 # M1, M3: last 4 bit zero
		enc.append(0 if (-3&ver) == -3 and len(enc) == el-1 else i)
	
	# error correction coding
	lg = [0]*256; ex = [0]*255 # log/exp table for multiplication
	j = 1; rs = [1]+[0]*ec # reed/solomon code
	for i in range(255): # compute log/exp table of Galois field prime
		ex[i] = j; lg[j] = i; j += j
		if j > 255: j ^= 285 # GF polynomial a^8+a^4+a^3+a^2+1 = 100011101b = 285
	for i in range(ec): # compute RS generator polynomial
		for j in range(i+1, 0, -1):
			rs[j] ^= ex[(lg[rs[j-1]]+i)%255]
	enc += [0]*(ec*blk+1) # clr checkwords
	k = 0; eb = el
	for c in range(blk): # for each data block
		for i in range(w if c < b else w+1, 0, -1): # compute RS checkwords 
			x = enc[eb]^enc[k]; k += 1
			for j in range(ec):
				enc[eb+j] = enc[eb+j+1]^(ex[(lg[rs[j+1]]+lg[x])%255] if x else 0)
		eb += ec

	# layout symbol
	mat = [[0]*(size+2) for y in range(size+2)] # bit 2 reserved space
	def set(x,y,pat): # layout fixed pattern: finder & align
		nonlocal mat
		for i in range(len(pat)):
			p = pat[i]; j = 0
			while 1<<j <= pat[0]:
				mat[y+i+1][x+j+1] = (p&1)|2
				j += 1; p >>= 1
	c = 1 if ver < 1 else 7
	for i in range(9, size+1): mat[c][i] = mat[i][c] = i&1^2 # timing pattern
	set(0,0,[383,321,349,349,349,321,383,256,511]) # finder upper left +format
	if ver > 0:
		set(0,size-8,[256,383,321,349,349,349,321,383]) # finder lower left
		set(size-8,0,[254,130,186,186,186,130,254,0,255]) # finder upper right
		c = 2*(ver+1)//(1-align)*2 # alignment pattern spacing
		for x in range(align): # alignment grid
			for y in range(align): 
				if x*y or (x != y and x+y != align-1): # no align at finder
					set(4 if x == 0 else size-9+c*(align-1-x), # set alignment pattern
						4 if y == 0 else size-9+c*(align-1-y),[31,17,21,17,31])
		if ver > 6: # reserve version area
			for i in range(18):
				mat[size+i%3-10][i//3+1] = mat[i//3+1][size+i%3-10] = 2

	# layout codewords
	x = size; y = x-1 # start lower right
	for i in range(eb):
		c = k = 0; j = w+1 # interleave data
		if i >= el:
			c = k = el; j = ec # interleave checkwords
		elif i+blk-b >= el:
			c = k = -b # interleave group 2 last bytes
		elif i%blk >= b:
			c = -b # interleave group 2 
		else: j -= 1 # interleave group 1
		c = enc[c+(i-k)%blk*j+(i-k)//blk] # interleave data
		for j in range(3 if (-3&ver) == -3 and i == el-1 else 7, -1,-1): # M1,M3: 4 bit
			k = 1 if ver > 0 and x < 6 else 0 # skip vertical timing pattern
			while True:
				x -= 1
				if 1&(x+1)^k: # advance x,y
					if size-x-k & 2:
						if y > 0: y -= 1; x += 2 # down
					else:
						if y < size-1: y += 1; x += 2 # up
				if mat[y+1][x+1]&2 == 0: break # skip reserved area
			if c&(1<<j): mat[y+1][x+1] = 1 # layout bit

	# data masking
	pat = [ lambda x,y: (x+y)&1, # pattern generation conditions
			lambda x,y:  y&1,
			lambda x,y:  x%3,
			lambda x,y: (x+y)%3,
			lambda x,y: (x//3+y//2)&1,
			lambda x,y: ((x*y)&1)+x*y%3,
			lambda x,y: (x*y+y*y%3)&1,
			lambda x,y: (x+y+x*y%3)&1 ]
	if ver < 1: pat = [pat[1],pat[4],pat[6],pat[7]] # mask pattern for micro QR
	def get(x,y,p): # test pattern mask
		nonlocal mat
		d = mat[y+1][x+1]
		if (d&2) == 0: d ^= pat[p](x,y) == 0 # invert only data according mask
		return d&1
	pen = 100000
	for p in range(len(pat)): # compute penalty
		if ver < 1: # penalty micro QR
			x = y = 0
			for i in range(size):
				x -= get(i,size-1,p)
				y -= get(size-1,i,p)
			j = 16*x+y if x > y else x+16*y
		else: # penalty QR
			d = 0; j = 0 # # of darks, prev line
			for y in range(size): # horizontal
				c = i = 0; k = "0000"
				for x in range(size):
					w = get(x,y,p) # horizontal to string
					k += str(w); d += w # rule 4: count darks
					if c == w: # same as prev
						i += 1 # rule 1
						if x*y and int(k1[x+3:x+5]) == c*11: j += 3 # rule 2: block 2x2
					else: # changed
						if i > 5: j += i-2 # rule 1: >5 adjacent
						c ^= 1; i = 1
				if i > 5: j += i-2 # rule 1: >5 adjacent
				j += (k.count("00001011101",0,len(k)-1)+
					(k+"0000").count("10111010000",1))*40 # rule 3: like finder pattern
				k1 = k # rule 2: remember last line
			for x in range(size): # vertical
				c = i = 0; k = "0000"
				for y in range(size):
					w = get(x,y,p) # vertical to string
					k += str(w)
					if c != w: # changed
						if i > 5: j += i-2 # rule 1: >5 adjacent
						c ^= 1; i = 1
					else: i += 1 # rule 1
				if i > 5: j += i-2 #  rule 1: >5 adjacent
				j += (k.count("00001011101",0,len(k)-1)+
					(k+"0000").count("10111010000",1))*40 # rule 3: like finder pattern
			j += abs(10-20*d//(size*size))*10 # rule 4: darks
		if j < pen: pen = j; msk = p
	for y in range(size): # remove reservation, apply mask
		for x in range(size):
			mat[y+1][x+1] = get(x,y,msk)
		
	# format information, code level & mask
	j = msk if ver == -3 else (2*ver+level+5)*4+msk if ver < 1 else ((5-level)&3)*8+msk
	j *= 1024; k = j # BCH error correction: 5 data, 10 error bits
	for i in range(4,-1,-1): # generator polynomial: x^10+x^8+x^5+x^4+x^2+x+1 = 10100110111b = 1335
		if j >= 1024<<i: j ^= 1335<<i
	k ^= j^(17477 if ver < 1 else 21522) # XOR masking
	for j in range(15): # layout format information
		if ver < 1:
			mat[j+2 if j < 8 else 9][9 if j < 8 else 16-j] = k&1 # micro QR
		else:
			mat[9][size-j if j < 8 else 8 if j == 8 else 15-j] = k&1 # QR horizontal
			mat[j+1 if j < 6 else j+2 if j < 8 else size+j-14][9] = k&1 # vertical
		k >>= 1
	# version information
	if ver > 6: # layout version information
		k = ver*4096 # BCH error correction: 6 data, 12 error bits
		for i in range(5,-1,-1): # generator: x^12+x^11+x^10+x^9+x^8+x^5+x^2+1 = 1111100100101b = 7973
			if k >= 4096<<i: k ^= 7973<<i
		k ^= ver*4096
		for j in range(18):
			mat[size+j%3-10][j//3+1] = mat[j//3+1][size+j%3-10] = k&1
			k >>= 1
	return mat
	
def Aztec(text, sec = 23,lay = 1): # make Aztec bar code
	""" Aztec bar code symbol creation according ISO/IEC 24778:2008 """
	text = text.encode('utf-8')
	el = len(text); typ = 0; enc = []; eb = 0
	mod = 0 # encoding mode: upper/lower/mixed/punct/digit
	def push(val, bits = 0): # add data to bit stream
		nonlocal mod, eb, enc, typ
		if bits == 0: bits = 4 if mod == 4 else 5
		val <<= b; eb += bits
		enc[len(enc)-1] |= val>>eb # add data
		while eb >= b: # word full?
			i = enc[len(enc)-1]>>1
			if typ == 0 and (i == 0 or 2*i+2 == 1<<b): # // bit stuffing: all 0 or 1
				enc[len(enc)-1] = 2*i+(1&i^1) # insert complementary bit
				eb += 1
			eb -= b
			enc.append((val>>eb)&((1<<b)-1))
	def encode(text): # process input text
		nonlocal mod, eb, enc
		def modeOf(ch): # get character encoding mode of ch
			if ch == 32: return mod<<5 # space
			k = [0,14,65, 26,32,52, 32,48,69, 47,58,82, 57,64,59, 64,91,-63, 96,123,-63]
			for i in range(0,len(k),3): # check range
				if k[i] < ch < k[i+1]: return ch+k[i+2] # ch in range
			i = "@\^_'|~\127[]{}".find(chr(ch)) # 
			if i < 0: return -1 # binary
			return (20+64 if i < 8 else 27+96-8)+i # mixed/punct
		enc = [0]; mod = eb = i = 0 # clr bit stream
		while i < len(text): # analyse text, optimize most cases
			c = text[i]; c1 = text[i+1] if i < len(text)-1 else 0
			if c == 32: # space
				if mod == 3: push(31); mod = 0 # punct: latch to upper
				c = 1 # space in all other modes
			elif mod == 4 and c == 44: c = 12 # , in digit mod
			elif mod == 4 and c == 46: c = 13 # . in digit mod
			elif ((c == 44 or c == 46 or c == 58) and c1 == 32) or (c == 13 and c1 == 10):
				if mod != 3: push(0) # shift to punct
				push(3 if c == 46 else 4 if c == 44 else 5 if c == 58 else 2,5)
				i += 2;  continue # two char encoding
			else:
				c = 97 if c == 13 and modeOf(c1)>>5 == mod else modeOf(c)
				if c < 0: # binary
					if mod > 2: push(31 if mod == 3 else 14); mod = 0 # latch to upper
					push(31) # shift to binary
					for l in range(len(text)-i): # calc binary length
						if modeOf(text[l+i]) < 0: j = 0
						else:
							j += 1
							if j > 5: break # look for at least 5 consecutive non binary chars
					l -= j-1
					if l > 31: # length > 31
						push(0); push(l-31,11)
					else: push(l)
					while l:
						push(text[i]&255,8)
						l -= 1; i += 1
					continue
				m = c>>5 # need mode
				if m == 4 and mod == 2: push(29); mod = 0 # mixed to upper (to digit)
				if m != 3 and mod == 3: push(31); mod = 0 # exit punct: to upper
				if m != 4 and mod == 4: # exit digit
					if (m == 3 or m == 0) and modeOf(c1) > 129:
						push((3-m)*5); push(c&31,5); 
						i += 1; continue # shift to punct/upper
					push(14); mod = 0 # latch to upper
				if mod != m: # mode change needed
					if m == 3: # to punct
						if mod != 4 and modeOf(c1)>>5 == 3: # 2x punct, latch to punct
							if mod != 2: push(29) # latch to mixed
							push(30) # latch to punct
							mod = 3 # punct mod
						else: push(0) # shift to punct
					elif mod == 1 and m == 0: # lower to upper
						if modeOf(c1)>>5 == 1: push(28) # shift
						else: push(30); push(14,4); mod = 0 # latch
					else: # latch to ..
						push([29,28,29,30,30][m])
						mod = m
			push(c&31) # stream character
			i += 1
		if eb > 0: push((1<<(b-eb))-1,b-eb) # padding
		enc.pop() # remove 0-byte

	from math import ceil, sqrt
	# compute word size b: 6/8/10/12 bits
	sec = 100/(100-min(max(sec,1),90)) # limit percentage of check words to 0-90%
	j = i = 4 # compute code size
	while True:
		j = max(j,(int(el*sec)+3)*i) # total needed bits, at least 3 check words
		b = 6 if j <= 240 else 8 if j <= 1920 else 10 if j <= 10208 else 12 # bit capacity -> word size
		if lay: b = max(b, 6 if lay < 3 else 8 if lay < 9 else 10 if lay < 23 else 12) # parameter
		if i >= b: break
		encode(text)
		el = len(enc); i = b
	if el > 1660: return [[]] # message too long
	typ = 14 if j > 608 or el > 64 else 11 # full or compact Aztec finder size
	mod = int(text) if text.isdigit() else -1 # Aztec rune possible?
	if mod < 0 or mod > 255 or str(mod) != text or lay: 
		lay = max(lay, min(32,ceil((sqrt(j+typ*typ)-typ)/4))) # needed layers
	ec = ((8*lay*(typ+2*lay))//b)-el # # of error words
	typ >>= 1; ctr = typ+2*lay; ctr += (ctr+14)//15 # center position
	# compute Reed Solomon error detection and correction
	def rs(ec, s, p): # # of checkwords, polynomial bit size, generator polynomial
		nonlocal enc, el
		rc = [0]*(ec+2) # reed/solomon code
		lg = [0]*(s+1); ex = [0]*s # log/exp table for multiplication
		j = 1; el = len(enc)
		for i in range(s): # compute log/exp table of Galois field
			ex[i] = j; lg[j] = i; j += j
			if j > s: j ^= p # polynomial
		for i in range(ec+1): # compute RS generator polynomial
			rc[ec-i] = 1
			for j in range(ec-i+1,ec+1):
				rc[j] = rc[j+1]^ex[(lg[rc[j]]+i)%s]
			enc.append(0)
		for i in range(el): # compute RS checkwords
			x = enc[el]^enc[i]
			for j in range(ec):
				enc[el+j] = enc[el+j+1]^(ex[(lg[rc[j+1]]+lg[x])%s] if x else 0)

	# layout Aztec barcode
	mat = [[0]*(2*ctr+1) for y in range(2*ctr+1)]
	for y in range(1-typ, typ): # layout central finder
		for x in range(1-typ, typ):
			mat[ctr+y][ctr+x] = 1^max(abs(x),abs(y))&1
	mat[ctr-typ+1][ctr-typ] = mat[ctr-typ][ctr-typ] = 1 # orientation marks
	mat[ctr-typ][ctr-typ+1] = mat[ctr+typ-1][ctr+typ] = 1
	mat[ctr-typ+1][ctr+typ] = mat[ctr-typ][ctr+typ] = 1
	def move(dx, dy): # move one cell
		nonlocal x,y,typ
		x += dx
		if typ == 7 and (x&15) == 0: x += dx # skip reference grid
		y += dy
		if typ == 7 and (y&15) == 0: y += dy

	if lay > 0: # layout the message
		rs(ec,(1<<b)-1,[67,301,1033,4201][b//2-3]) # error correction, generator polynomial
		enc.pop() # remove 0-byte
		x = -typ; y = x-1 # start of layer 1 at top left
		j = l = (3*typ+9)//2 # length of inner side
		dx = 1; dy = 0 # direction right
		while len(enc):
			c = enc.pop() # data in reversed order inside to outside
			for i in range(b//2):
				if c&1: mat[ctr+y][ctr+x] = 1 # odd bit
				move(dy,-dx) # move across
				if c&2: mat[ctr+y][ctr+x] = 1 # even bit
				move(dx-dy,dx+dy) # move ahead
				j -= 1; c >>= 2
				if j < 0: # spiral turn
					move(dy,-dx) # move across
					j = dx; dx = -dy; dy = j # rotate clockwise
					if dx < 1: # move to next side
						move(dx-dy,dx+dy)
						move(dx-dy,dx+dy)
					else: l += 4 # full turn -> next layer
					j = l # start new side
		if typ == 7: # layout reference grid
			for x in range((16-ctr)&-16,ctr,16):
				for y in range((2-ctr)&-2,ctr,2):
					if abs(x) > typ or abs(y) > typ:
						mat[ctr+y][ctr+x] = 1 # down
						if y&15: mat[ctr+x][ctr+y] = 1 # across
		mod = (lay-1)*(typ*992-4896)+el-1 # 2/5 + 6/11 mode bits
	
	enc = [0]*(typ-3)
	for i in range(typ-4,-1,-1): # mode to 4 bit words
		enc[i] = mod&15; mod >>= 4
	rs((typ+5)//2,15,19) # add 5/6 words error correction
	b = (typ*3-1)//2 # 7/10 bits per side
	eb = 0; j = 0 if lay else 10 # XOR Aztec rune data
	for i in range(b): push(j^enc[i],4) # 8/16 words to 4 chunks
	j = 1
	for i in range(2-typ,typ-1): # layout mode data
		if typ == 7 and i == 0: continue # skip reference grid
		if enc[b]&j: mat[ctr-typ][ctr-i] = 1 # top
		if enc[b+1]&j: mat[ctr-i][ctr+typ] = 1 # right
		if enc[b+2]&j: mat[ctr+typ][ctr+i] = 1 # bottom
		if enc[b+3]&j: mat[ctr+i][ctr-typ] = 1 # left
		j += j

	return mat
	
def Code128(text):
	""" Code 128 symbol creation according ISO/IEC 15417:2007 """
	m = 3; enc = []; i = 0
	text = text.encode('utf-8'); l = len(text)
	while i < l:
		if m != 2: # alpha mode
			j = 0
			while j < l-i: # count digits
				if ((text[i+j]-48)&255) > 9: break # digit
				j += 1
			if (j > 1 and i == 0) or (j > 3 and (i+j < l or (j&1) == 0)):
				enc.append(105 if i == 0 else 99)
				m = 2 # to digit
		if m == 2: # digit mode
			if ((text[i]-48)&255) < 10 and i+1 < l and ((text[i+1]-48)&255) < 10:
				enc.append(int(text[i:i+2])) # two digits
				i += 1
			else: m = 3 # exit digit
		if m != 2: # alpha mode
			c = text[i]
			if m > 2 or ((c&127) < 32 and m) or ((c&127) > 95 and m == 0): # change?
				for j in range(i if m > 2 or i+2 == l else i+1, l):
					if (text[j]-32)&64: break # < 32 or > 95
				j = 1 if text[j]&96 else 0 # new mode
				enc.append(103+j if i == 0 else 101-j if j != m else 98)
				m = j # change set: start, code, (shift)
			if c > 127: enc.append(101-m) # FNC4: char>127
			enc.append(((c&127)+64)%96)
		i += 1
	if i == 0: enc.append(105) # empty message
	j = enc[0] # check digit
	for i in range(1,len(enc)): j += i*enc[i]
	enc.append(j%103); enc.append(106) # stop
	
	mat = [0]*(len(enc)*11+3)
	c = [358,310,307,76,70,38,100,98,50,292,290,274,206,110,103,230,118,115,
		313,302,295,370,314,439,422,406,403,434,410,409,364,355,283,140,44,
		35,196,52,49,324,276,273,220,199,55,236,227,59,443,327,279,372,369,
		375,428,419,395,436,433,397,445,289,453,152,134,88,67,22,19,200,194,
		104,97,26,25,265,296,477,266,61,158,94,79,242,122,121,466,458,457,367,
		379,475,188,143,47,244,241,468,465,239,247,431,471,322,328,334,285]
	t = 0
	for i in enc: # code to pattern
		mat[t] = 1; j = 256
		for t in range(t+1,t+11):
			if (c[i]&j): mat[t] = 1
			j >>= 1
		t += 1
	mat[t] = 1; mat[t+1] = 1
	return [mat]

def Mat2Path(mat): # matrix of 0/1 pixel image, needs padding zeros around the matrix
	"""convert a black&white image matrix to minimized SVG path: 
	[[1,0,1], [0,1,0]] -> '[(0,0),(1,0),(1,2),(2,2),(2,0),(3,0),(3,1),(0,1)]' """
	pp = [] # polypolygon
	while True: # draw polygons
		for y in range(len(mat)-2): # look for set pixel
			#x = next((i for i,x in enumerate(mat[y+1]) if x), 0)-1
			x = (mat[y+1]+[1]).index(1)-1
			if x+1 < len(mat[y+1]): break
		if x+1 == len(mat[0]): return pp # no pixel left
		p = []; d = 0
		while True: # encircle pixel area
			p.append((x,y)) # add point
			while True: 
				x += 1-2*d # move left/right
				if not (mat[y][x+1-d]^mat[y+1][x+1-d])&1: break # follow horizontal edge
			d ^= (mat[y][x+1]^mat[y+1][x])&1 # turn up/down
			p.append((x,y)) # add point
			while True: 
				y += d
				mat[y][x+1] ^= 2 # move and mark edge
				y -= 1-d
				if not (mat[y+d][x]^mat[y+d][x+1])&1: break # follow vertical edge
			d ^= (mat[y][x+1]^mat[y+1][x])&1 # turn left/right
			if x == p[0][0] and y == p[0][1]: break # returned to start?
			if len(p)>10000: break
		pp.append(p) # add path
		for y in range(1,len(mat)-1): # clear pixel between marked edges
			d=0
			for x in range(1,len(mat[y])):
				d ^= mat[y][x]>>1
				mat[y][x] = d^mat[y][x]&1 # invert pixels inside, clr marking
		if len(pp)>1000: break
	return pp
	
def pprint(m):
	for i in m: print("".join(["#" if x else " " for x in i]))
	
import sys
pprint(DataMatrix(sys.argv[1],False))
pprint(QRCode(sys.argv[1]))
pprint(Aztec(sys.argv[1]))
pprint(Code128(sys.argv[1]))
print(Mat2Path(DataMatrix(sys.argv[1],False)))
