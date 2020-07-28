import uno
import unohelper
from com.sun.star.awt import Size, Point
# 2D barcode symbol creation by python
# :author: alois zingl
# :version: V2.0 july 2020
# :copyright: MIT open-source license software
# :url: https://github.com/zingl/2D-Barcode
# :description: the indention of this library is a short and compact implementation to create the 2D barcodes 
#  of Data Matrix, (micro) QR or Aztec symbols so it could be easily adapted for individual requirements.
#  The smallest bar code symbol fitting the data is automatically selected.
# functions: 
#	DataMatrix(setCell,text,rect)   create Data Matrix barcode
#	QRCode(text,level,ver)          create QR and micro QR barcode
#	Aztec(setCell,text,sec,lay)     create Aztec, compact Aztec and Aztec runes
#	Code128(setCell,text)           create Code 128 barcode
#	Mat2Path(mat)                   convert array matrix to SVG path
#  there is no dependency between functions, just copy the ones you need
#  'Small is beautiful' - Leopold Kohr.

def DataMatrix(text, rect = True):
	"""Data Matrix symbol creation according ISO/IEC 16022:2006
	:param text: to encode
	:param rect: optional flag - true for rectangular barcode
	:returns: array DataMatrix symbol ([[]] if text too long) """

	enc = []; cw = 0; ce = 0; # byte stream
	def push(val): # encode bit stream c40/text/x12
		nonlocal cw, ce, enc
		cw, ce = 40*cw+val, ce+1
		if ce == 3: # full, add code
			cw += 1
			enc.append(cw>>8) #3 chars in 2 bytes
			enc.append(cw&255)
			ce = cw = 0
	cost = [ # compute char cost in 1/12 bytes for mode..
		lambda c: 6 if ((c-48)&255) < 10 else 12 if c < 128 else 24, # ascii
		lambda c: 8 if ((c-48)&255) < 10 or ((c-65)&255) < 26 or c == 32 else 16 if c < 128 else 16+cost[1](c&127), # c40
		lambda c: 8 if ((c-48)&255) < 10 or ((c-97)&255) < 26 or c == 32 else 16 if c < 128 else 16+cost[2](c&127), # text
		lambda c: 8 if ((c-48)&255) < 10 or ((c-65)&255) < 26 or c == 32 or c == 13 or c == 62 or c == 42 else 1e9, # x12
		lambda c: 9 if c >= 32 and c < 95 else 1e9, # edifact
		lambda c: 12 ] # base256
	latch = (0, 24, 24, 24, 21, 25) # latch+unlatch costs
	count = [0, 12, 12, 12, 12, 25] # actual costs (start by latch only)
	cm = 0; nm = 0 # current / next mode
	print(text)	
	text = text.encode('utf-8')
	bytes = [0]*(len(text)+1) # cost table in 1/12 bytes

	bytes[len(text)] = count.copy() # compute byte costs..
	for p in reversed(range(len(text))): # ..by dynamic programming
		for i in range(len(cost)): # accumulate costs from back
			count[i] += cost[i](text[p]) # get minimum in full bytes
		c = (min(count)+11)//12*12 # ascii mode: if non digit round up to full byte
		if cost[0](text[p]) > 6: count[0] = (count[0]+11)//12*12
		for i in range(len(cost)): # latch to shorter mode?
			count[i] = min(count[i],c+latch[i])
		bytes[p] = count.copy() # record costs

	while True: # encode text
		if p+(0,2,2,2,3,0)[cm] >= len(text): nm = 0 # finished, return to ascii
		else: # check if a mode is shorter
			c = bytes[p][cm]-latch[cm]
			for i in reversed(range(len(cost))):
			    if ((bytes[p+1][i]+cost[i](text[p])+11)//12)*12 == c:
			        nm = i # change to shorter mode
		if cm != nm and cm > 0: # return to ascii mode
			if cm < 4: enc.append(254) # unlatch c40/text/x12
			elif cm == 4: enc.append(31|cw&255) # unlatch edifact, add last byte
			else: # encode base256 in 255 state rand algo
				if ce > 249: enc.append((ce//250+250+(149*(len(enc)+1))%255)&255) # high
				enc.append((ce%250+(149*(len(enc)+1))%255+1)&255) # encode low length
				for c in text[p-ce:p]: # encode base256 data 
					enc.append((c+(149*(len(enc)+1))%255+1)&255)

		if p >= len(text): break # encoding finished
		if cm != nm: cw = 0; ce = 0 # reset packing
		if cm != nm and nm > 0: # latch to c40/text/x12/edifact/base256
			enc.append((230,239,238,240,231)[nm-1])

		if nm == 0: # encode ascii
			c = text[p]; p += 1; i = (c-48)&255
			if i < 10 and p < len(text) and ((text[p]-48)&255) < 10:
				enc.append(i*10+text[p]-48+130); p += 1 # two digits
			else:
				if c > 127: enc.append(235) # upper shift
				enc.append((c&127)+1) # encode data
			if cm == 4 or ce < 0: ce -= 1 # count post edifact chars
		elif nm < 4: # encode c40, text, x12	        	
			set = ((31,0,32,119,47,133,57,179,64,173,90,207,95,277,127,386,255,1), # c40
				(31,0,32,119,47,133,57,179,64,173,90,258,95,277,122,335,127,386,255,1), # text
				(13,55,32,119,42,167,57,179,62,243,90,207,255,3))[nm-1] # x12
			while True: # set contains character range dupels: upper value, shift*4+set-1
				c = text[p]; p += 1
				if c > 127: push(1); push(30); c &= 127 # upper shift
				i = 0; 
				while c > set[i]: i += 2 # select char set
				if (set[i+1]&3) < 3: push(set[i+1]&3) # select set
				push(c-(set[i+1]>>2))
				if ce == 0: break
		elif nm == 4: # encode edifact
			if ce > 0: enc.append(255&cw+(text[p]&63)); p += 1 # 3rd byte
			cw = 0
			for ce in range(3):
				cw = 64*(cw+(text[p]&63)); p += 1
			enc.append(cw>>16) # 4 chars in 3 bytes
			enc.append((cw>>8)&255)
		else:
			p += 1; ce += 1 # count base256 chars
		cm = nm # next mode

	el = len(enc)
	b = nc = nr = 1 # compute symbol size
	if ce == -1 or (cm and cm < 5): nm = 1 # c40/text/x12/edifact unlatch removable
	if rect and el-nm < 50:  # rectangular symbol possible
		k = (16,7, 28,11, 24,14, 32,18, 32,24, 44,28)  # symbol width, checkwords
		for j in range(0,len(k),2):
			w = k[j]  # width w/o finder pattern
			h = 6+(j&12)  #height
			l = w*h//8  # of bytes in symbol
			s = k[j+1]
			if l-s >= el-nm: break  # data + check fit in symbol?
		if w > 25: nc = 2  # column regions
	else:  # square symbol
		w = h = 6
		i = 2  # size increment
		for s in (5,7,10,12,14,18,20,24,28,36,42,48,56,68,84,
				112,144,192,224,272,336,408,496,620, 0): # RS checkwords
			if s == 0: return [[]]  # message too long for Datamatrix
			if w > 11*i: i = 4+i&12  # advance increment
			w = h = h+i
			l = w*h//8
			if l-s >= el-nm: break
		if w > 27: nr = nc = 2*(w//54)+2 # regions
		if l > 255: b = 2*(l>>9)+2 # blocks

	if l-s+1 == el and nm > 0:  # remove last unlatch to fit in smaller symbol
		el -= 1 				# replace edifact unlatch by char
		if ce == -1: enc[el-1] ^= 31^(enc[el]-1)&63
	fw, fh = w//nc, h//nr  # region size
	if el < l-s: enc.append(129); el += 1  # first padding
	for el in range(el,l-s+1): # add more padding
		enc.append((((149*(el+1))%253)+130)%254)

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
			k = (w,6-h, w,5-h, w,4-h, w,3-h, w-1,3-h, 3,2, 2,2, 1,2)
		elif r == h+1 and c == 1 and (w&7) == 0 and (h&7) == 6:  # corner D layout
			k = (w-2,-h, w-3,-h, w-4,-h, w-2,-1-h, w-3,-1-h, w-4,-1-h, w-2,-2, -1,-2)
		else:
			if r == 0 and c == w-2 and (w&3):
				continue  # omit corner B
			if r < 0 or c >= w or r >= h or c < 0:  # outside
				s = -s;	r += 2+s//2; c += 2-s//2  # turn around
				while r < 0 or c >= w or r >= h or c < 0:
					r -= s;	c += s
			if r == h-2 and c == 0 and (w&3):  # corner B layout
				k = (w-1,3-h, w-1,2-h, w-2,2-h, w-3,2-h, w-4,2-h, 0,1, 0,0, 0,-1)
			elif r == h-2 and c == 0 and (w&7) == 4:  # corner C layout
				k = (w-1,5-h, w-1,4-h, w-1,3-h, w-1,2-h, w-2,2-h, 0,1, 0,0, 0,-1)
			elif r == 1 and c == w-1 and (w&7) == 0 and (h&7) == 6:
				continue  # omit corner D
			else: k = (0,0, -1,0, -2,0, 0,-1, -1,-1, -2,-1, -1,-2, -2,-2)  # nominal byte layout
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

def QRCode(text, level = "", ver = 1):
	"""QR Code 2005 bar code symbol creation according ISO/IEC 18004:2006
		creates QR and micro QR bar code symbol as matrix array.
	:param text: to encode
	:param level: optional quality level LMQH
	:param ver: optional minimum version size (-3:M1, -2:M2, .. 1, .. 40), set to -3 for micro QR
	:return matrix: array of QR symbol ([] if text is too long)
		needs kanji.py for unicode kanji encoding string """

	try: from kanji import jis # conversion string from unicode to JIS for japanese Kanji mode
	except: jis = ""
	erc=((2, 5, 6, 8,  7,10,15,20,26,18,20,24,30,18,20,24,26,30,22,24,28,30,28,28,28,28,30,30,26,28,30,30,30,30,30,30,30,30,30,30,30,30,30,30), # error correction words L
		(99, 6, 8,10, 10,16,26,18,24,16,18,22,22,26,30,22,22,24,24,28,28,26,26,26,26,28,28,28,28,28,28,28,28,28,28,28,28,28,28,28,28,28,28,28), # M
		(99,99,99,14, 13,22,18,26,18,24,18,22,20,24,28,26,24,20,30,24,28,28,26,30,28,30,30,30,30,28,30,30,30,30,30,30,30,30,30,30,30,30,30,30), # Q
		(99,99,99,99, 17,28,22,16,22,28,26,26,24,28,24,28,22,24,24,30,28,28,26,28,30,24,30,30,30,30,30,30,30,30,30,30,30,30,30,30,30,30,30,30), # H
		( 1, 1, 1, 1, 1,1,1,1,1,2,2,2,2,4, 4, 4, 4, 4, 6, 6, 6, 6, 7, 8, 8, 9, 9,10,12,12,12,13,14,15,16,17,18,19,19,20,21,22,24,25), # error correction blocks L
		( 1, 1, 1, 1, 1,1,1,2,2,4,4,4,5,5, 5, 8, 9, 9,10,10,11,13,14,16,17,17,18,20,21,23,25,26,28,29,31,33,35,37,38,40,43,45,47,49), # M
		( 1, 1, 1, 1, 1,1,2,2,4,4,6,6,8,8, 8,10,12,16,12,17,16,18,21,20,23,23,25,27,29,34,34,35,38,40,43,45,48,51,53,56,59,62,65,68), # Q
		( 1, 1, 1, 1, 1,1,2,4,4,4,5,6,8,8,11,11,16,16,18,16,19,21,25,25,25,34,30,32,35,37,40,42,45,48,51,54,57,60,63,66,70,74,77,81)  # H
	) #	 M1,M2,M3,M4,V1,2, .. 
	chars = ( "0123456789", # char table for numeric
				"0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ $%*+-./:", # alpha
				"".join(chr(i) for i in range(128)), # binary, >127 -> use utf-8
				jis ) # kanji char index (in kanji.py)
	blen = lambda mod, chr: (20,33,48,78)[mod] if chr in chars[mod] else \
			1e9 if mod != 2 else 96 if ord(chr) < 2048 else 144 # encoding length in 1/6 bits
	cib = lambda mod: ver+(19-2*mod)//3 if ver < 1 else \
		((10,12,14),(9,11,13),(8,16,16),(8,10,12))[mod][(ver+7)//17] # get # of count indicator bits
	def push(val,bits): # add data to bit stream
		nonlocal eb, enc
		val <<= 8; eb += bits
		enc[len(enc)-1] |= val>>eb
		while eb > 7: eb -= 8; enc.append((val>>eb)&255)

	#compute symbol version size, ver < 1: micro QR
	level = str(level); lev = "LMQHlmqh0123".find(level)&3 # level "LMQH" to 0,1,2,3
	while True: # increase version till message fits
		if ver < 2 or ver == 10 or ver == 27: # recompute stream
			enc = [0]; eb = b = 0 # encoding data, length, bits
			cost = [(min(4,ver+3)+cib(i))*6 for i in range(4)] # cost table in 1/6 bits 
			bits = []; head = cost.copy() # calculate the bit table using dynamic programming:
			for i in reversed(text): # www.nayuki.io/page/optimal-text-segmentation-for-qr-codes
				bits.insert(0,cost.copy()) # record costs
				for j in range(4): cost[j] += blen(j,i) # accumulate costs from back
				b = min(cost)
				for j in range(4): #switch to shorter encoding
					cost[j] = min(cost[j],((b+5)//6)*6+head[j])
			i = 0
			n = mode = cost.index(b) # start encoding with mode of fewest bits
			for j in range(1,len(text)+1): # calc optimal encoding for each char
				if j < len(text):
					for k in [2,3,1,0]:
						b = bits[j][k]+blen(k,text[j])+5 # switch to shorter encoding
						if b < 1e7 and (mode == k or 6*(b//6) == bits[j-1][mode]-head[mode]):
							n = k
				if mode != n or j == len(text): # mode changes -> encode previous
					if ver < -1 and ver+3 < mode: push(0,50) # prevent illegal mode
					if ver > 0: push(1<<mode,4) # mode indicator, QR
					else: push(mode,ver+3) # mode indicator micro QR
					b = text[i:j].encode('utf-8') # to utf-8
					push(len(b) if mode == 2 else j-i,cib(mode)) # character count indicator
					if mode == 0: # encode numeric data
						for i in range(i,j-2,3):
							push(int(text[i:i+3]),10) # 3 digits in 10 bits
						i = (j-i)%3
						if i: push(int(text[j-i:j]), 4 if i == 1 else 7)
					elif mode == 1: # encode alphanumeric data
						for i in range(i,j-1,2): # 2 chars in 11 bits
							push(chars[1].index(text[i])*45+chars[1].index(text[i+1]),11)
						if (j-i)&1: push(chars[1].index(text[j-1]),6)
					elif mode == 2: # encode binary (utf-8)
						for i in b: push(i,8) # 1 char in 8 bits
					else:
						for i in range(i,j): # encode kanji
							push(chars[3].index(text[i]),13) # 1 char in 13 bits
					i = j; mode = n # next segment
		size = ver*(2 if ver < 1 else 4)+17 # symbol size
		align = 0 if ver < 2 else ver//7+2 # # of align patterns
		el = (size-1)*(size-1)-(5*align-1)*(5*align-1) # total bits - align - timing
		el -= 59 if ver < 1 else 191 if ver < 2 else 136 if ver < 7 else 172 # finder, version, format
		i = 8-(ver&1)*4 if ver < 1 else 8 # mode indicator bits, M1+M3: +4 bits
		j = erc[lev+4][ver+3]*erc[lev][ver+3] 
		if (el&-8)-j*8 >= len(enc)*8+eb-i: break # message fits in version
		ver += 1
		if ver >= len(erc[0])-3: return [] # text too long for QR

	if level == "" or ord(level[0])&-33 == 65: # if level undefined or 'A'
		while lev < 3:
			j = erc[lev+5][ver+3]*erc[lev+1][ver+3]
			if (el&-8)-j*8 >= len(enc)*8+eb-i: break # if data fits in same size
			lev += 1 # increase security level

	blk = erc[lev+4][ver+3] # of error correction blocks
	ec = erc[lev][ver+3] # of error correction bytes
	el = (el>>3)-ec*blk # remaining data bytes
	w = el//blk # # of words in group 1 (group 2: w+1)
	b = blk+w*blk-el # # of blocks in group 1 (group 2: blk-b)

	if (-3&ver) == -3 and el == len(enc):
		enc[w-1] >>= 4 # M1, M3: shift high bits to low nibble
	if el >= len(enc): push(0, 4 if ver > 0 else ver+6) # terminator
	if eb == 0 or el < len(enc): enc.pop() # bit padding
	enc += [0 if (-3&ver) == -3 and i+1 == el else ((i-len(enc))&1)*253^236
		for i in range(len(enc),el)] # byte padding: M1, M3: last 4 bit zero

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
	set(0,0,(383,321,349,349,349,321,383,256,511)) # finder upper left +format
	if ver > 0:
		set(0,size-8,(256,383,321,349,349,349,321,383)) # finder lower left
		set(size-8,0,(254,130,186,186,186,130,254,0,255)) # finder upper right
		c = 2*(ver+1)//(1-align)*2 # alignment pattern spacing
		for x in range(align): # alignment grid
			for y in range(align): 
				if x*y or (x != y and x+y != align-1): # no align at finder
					set(4 if x == 0 else size-9+c*(align-1-x), # set alignment pattern
						4 if y == 0 else size-9+c*(align-1-y),(31,17,21,17,31))
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
	get = [ lambda x,y: ((x+y|mat[y+1][x+1]>>1)^mat[y+1][x+1])&1^1, # pattern generation conditions
			lambda x,y: ((y|mat[y+1][x+1]>>1)^mat[y+1][x+1])&1^1,
			lambda x,y: (((x%3>0)|mat[y+1][x+1]>>1)^mat[y+1][x+1])&1^1,
			lambda x,y: ((((x+y)%3>0)|mat[y+1][x+1]>>1)^mat[y+1][x+1])&1^1,
			lambda x,y: ((x//3+y//2|mat[y+1][x+1]>>1)^mat[y+1][x+1])&1^1,
			lambda x,y: ((((x*y&1)+x*y%3>0)|mat[y+1][x+1]>>1)^mat[y+1][x+1])&1^1,
			lambda x,y: ((x*y+x*y%3|mat[y+1][x+1]>>1)^mat[y+1][x+1])&1^1,
			lambda x,y: ((x+y+x*y%3|mat[y+1][x+1]>>1)^mat[y+1][x+1])&1^1 ]
	if ver < 1: get = [get[1],get[4],get[6],get[7]] # mask pattern for micro QR
	pen = 100000
	for m in range(len(get)): # compute penalty
		x = y = p = d = 0
		if ver < 1: # penalty micro QR
			for i in range(size):
				x -= get[m](i,size-1)
				y -= get[m](size-1,i)
			p = 16*x+y if x > y else x+16*y
		else: # penalty QR
			for pi,pat in enumerate([ # look for pattern
				[[1,1,1,1,1]], [[0,0,0,0,0]], # N1 >4 adjacent
				[[1,1],[1,1]], [[0,0],[0,0]], # N2 block 2x2
				[[1,0,1,1,1,0,1,0,0,0,0]], [[0,0,0,0,1,0,1,1,1,0,1]], #N3 like finder
				[[1]]]): # N4 darks
				p += d; d = 0
				for y in range(size-len(pat)+1):
					add = [3,3,40,1, 3,0,40,0] # N1, N2, N3, N4; horizontal/vertical
					for x in range(size-len(pat[0])+1):
						i = j = 1
						for py in range(len(pat)):
							for px in range(len(pat[0])):
								if get[m](x+px,y+py) != pat[py][px]: i = 0 # horizontal
								if get[m](y+py,x+px) != pat[py][px]: j = 0 # vertical
						d += add[pi>>1]*i+add[pi>>1|4]*j # add penalty
						add[0] = 3-2*i; add[4] = 3-2*j # toggle N1: 3-1-1-...
			p += abs(10-20*d//(size*size))*10 # rule 4: darks
		if p < pen: pen = p; msk = m # take mask of lower penalty
	for y in range(size): # remove reservation, apply mask
		for x in range(size):
			mat[y+1][x+1] = get[msk](x,y)
	# format information, code level & mask
	j = msk if ver == -3 else (2*ver+lev+5)*4+msk if ver < 1 else ((5-lev)&3)*8+msk
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
	""" Aztec bar code symbol creation according ISO/IEC 24778:2008
	creates Actec and compact Aztec bar code symbol as matrix array.
	:param text: to encode
	:param sec: optional percentage of checkwords used for security 2%-90% (23%)
	:param lay: optional minimum number of layers (size), 0 = Aztec rune
	:return Aztec matrix """
	e = 20000; CharSiz = (5,5,5,5,4)
	LatLen = (( 0,5,5,10,5,10), (9,0,5,10,5,10), (5,5,0,5,10,10),
	         (5,10,10,0,10,15), (4,9,9,14,0,14), (0,0,0,0,0,0))
	ShftLen =  ((0,e,e,5,e), (5,0,e,5,e), (e,e,0,5,e), (e,e,e,0,e), (4,e,e,4,0))
	Latch = (([],  [28],    [29],   [29,30],[30],   [31]), # from upper to ULMPDB
	        ([30,14],[],    [29],   [29,30],[30],   [31]), #      lower
	        ([29],  [28],   [],     [30],   [28,30],[31]), #      mixed
	        ([31],  [31,28],[31,29],[],	    [31,30],[31,31]), #   punct
	        ([14],  [14,28],[14,29],[14,29,30],[],  [14,31])) #   digit
	CharMap = (	"  ABCDEFGHIJKLMNOPQRSTUVWXYZ", # upper
	            "  abcdefghijklmnopqrstuvwxyz", # lower
	            "".join(chr(x) for x in[0,32,1,2,3,4,5,6,7,8,9,10,11,12,13,
	                27,28,29,30,31,64,92,94,95,96,124,126,127]), # mixed
	            " \r\r\r\r\r!\"#$%&'()*+,-./:;<=>?[]{}", # punct
	            "  0123456789,.") # digit
	text = text.encode('utf-8')
	el = len(text); typ = 0
	def stream(seq, val, bits): # add data to bit stream
		nonlocal typ
		eb = seq[0]%b+bits
		val <<= b; seq[0] += bits
		seq[len(seq)-1] |= val>>eb # add data
		while eb >= b: # word full?
			i = seq[len(seq)-1]>>1
			if typ == 0 and (i == 0 or 2*i+2 == 1<<b): # // bit stuffing: all 0 or 1
				seq[len(seq)-1] = 2*i+(1&i^1) # insert complementary bit
				seq[0] += 1; eb += 1
			eb -= b
			seq.append((val>>eb)&((1<<b)-1))
	def binary(seq, pos): # encode numBytes of binary
		nonlocal numBytes
		seq[0] -= numBytes*8+(16 if numBytes > 31 else 5) # stream() adjusts len too -> remove
		stream(seq, 0 if numBytes > 31 else numBytes, 5) # len
		if numBytes > 31: stream(seq, numBytes-31, 11) # long len
		for i in range(pos-numBytes,pos): stream(seq, text[i], 8) # bytes

	from math import ceil, sqrt
	sec = 100/(100-min(max(sec,1),90)) # limit percentage of check words to 0-90%
	j = c = 4
	while True: # compute word size b: 6/8/10/12 bits
		j = max(j,(int(el*sec)+3)*c) # total needed bits, at least 3 check words
		b = 6 if j <= 240 else 8 if j <= 1920 else 10 if j <= 10208 else 12 # bit capacity -> word size
		if lay: b = max(b, 6 if lay < 3 else 8 if lay < 9 else 10 if lay < 23 else 12) # parameter
		if c >= b: break # fits in word size

		c = b; i = 0 # calculate shortest message sequence
		cur = [[0,0],[e,0],[e,0],[e,0],[e,0],[e,0]] # current sequence for [U,L,M,P,D,B]
		while i < len(text):
			for to in range(6): # check for shorter latch to
				for frm in range(6): # if latch from
					if cur[frm][0]+LatLen[frm][to] < cur[to][0] and (frm < 5 or to == BackTo):
						cur[to] = cur[frm].copy() # replace by shorter sequence
						if frm < 5: # latch from shorter mode
							for lat in Latch[frm][to]:
								stream(cur[to], lat, 4 if lat < 16 else 5)
						else: binary(cur[to], i) # return from binary -> encode
						if to == 5: BackTo = frm; numBytes = 0; cur[5][0] += 5 # begin binary shift
			nxt = [[e],[e],[e],[e],[e],cur[5]] # encode char
			twoChar = [b"\r\n",b". ",b", ",b": "] # special 2 char sequences
			twoChar = twoChar.index(text[i:i+2]) if text[i:i+2] in twoChar else -1
			for to in range(5): # to sequence
				idx = CharMap[to].find(chr(text[i]),1) if twoChar < 0 else twoChar+2 # index to map
				if idx < 0 or (twoChar >= 0 and to != 3): continue # char in set ?
				for frm in range(5): # encode char
					if cur[frm][0]+ShftLen[frm][to]+CharSiz[to] < nxt[frm][0]:
						nxt[frm] = cur[frm].copy()
						if to != frm: # add shift
							stream(nxt[frm], 0 if to == 3 else 28 if frm < 4 else 15, CharSiz[frm])
						stream(nxt[frm], idx, CharSiz[to]) # add char
			nxt[5][0] += 19 if numBytes == 31 else 8; numBytes += 1 # binary exeeds 31 bytes
			if twoChar >= 0: i += 1; nxt[5][0] += 19 if numBytes == 31 else 8; numBytes += 1 # 2 char seq: jump over 2nd
			i += 1; cur = nxt # take next sequence
		binary(cur[5], len(text)) # encode remaining bytes
		enc = min(cur, key = lambda x: x[0]) # get shortest sequence
		i = b-enc[0]%b
		if i < b: stream(enc,(1<<i)-1,i) # padding
		enc.pop() # remove 0-byte
		el = enc.pop(0)//b # get encoding length
	if el > 1660: return [[]] # message too long
	typ = 14 if j > 608 or el > 64 else 11 # full or compact Aztec finder size
	mod = int(text) if text.isdigit() else -1 # Aztec rune possible?
	if mod < 0 or mod > 255 or str(mod).encode() != text or lay:
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
		rs(ec,(1<<b)-1,(67,301,1033,4201)[b//2-3]) # error correction, generator polynomial
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
	enc = [0]*(typ-2)
	for i in range(typ-3,-1,-1): # mode to 4 bit words
		enc[i] = mod&15; mod >>= 4
	rs((typ+5)//2,15,19) # add 5/6 words error correction
	b = (typ*3-1)//2 # 7/10 bits per side
	j = 1; c = 0 if lay else 10 # XOR Aztec rune data
	for i in range(b): stream(enc,c^enc[i+1],4) # 8/16 words to 4 chunks
	for i in range(2-typ,typ-1): # layout mode data
		if typ == 7 and i == 0: continue # skip reference grid
		if enc[b+1]&j: mat[ctr-typ][ctr-i] = 1 # top
		if enc[b+2]&j: mat[ctr-i][ctr+typ] = 1 # right
		if enc[b+3]&j: mat[ctr+typ][ctr+i] = 1 # bottom
		if enc[b+4]&j: mat[ctr+i][ctr-typ] = 1 # left
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
	c = (358,310,307,76,70,38,100,98,50,292,290,274,206,110,103,230,118,115,
		313,302,295,370,314,439,422,406,403,434,410,409,364,355,283,140,44,
		35,196,52,49,324,276,273,220,199,55,236,227,59,443,327,279,372,369,
		375,428,419,395,436,433,397,445,289,453,152,134,88,67,22,19,200,194,
		104,97,26,25,265,296,477,266,61,158,94,79,242,122,121,466,458,457,367,
		379,475,188,143,47,244,241,468,465,239,247,431,471,322,328,334,285)
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
			if len(p)>100000: break
		pp.append(p) # add path
		for y in range(1,len(mat)-1): # clear pixel between marked edges
			d=0
			for x in range(1,len(mat[y])):
				d ^= mat[y][x]>>1
				mat[y][x] = d^mat[y][x]&1 # invert pixels inside, clr marking
		if len(pp)>1000: break
	return pp
def pprint(m):
	try:
		for i in m: print("".join(["█" if x else " " for x in i]))
	except: 
		for i in m: print("".join(["#" if x else " " for x in i])) # █

import sys
import codecs
UTF8Writer = codecs.getwriter('utf8')
#sys.stdout = UTF8Writer(sys.stdout)

if len(sys.argv) > 1:
	pprint(DataMatrix(sys.argv[1],False))
