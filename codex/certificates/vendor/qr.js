// certificates/vendor/qr.js
// Minimal QR code generator, self-contained ES module.
//
// Vendored from qrcode-generator (MIT License) by Kazuhiko Arase.
// Original: https://github.com/kazuhikoarase/qrcode-generator
// License: MIT
//
// Exports:
//   generateQrDataUrl(text, opts?) -> string  (PNG data URL, ~150–250px square)
//   generateQrSvg(text, opts?)     -> string  (SVG string)
//
// opts: { size?: number (cell px, default 4), margin?: number (cells, default 2) }
//
// Only supports ASCII + UTF-8 byte mode. No Kanji. EC level M.
// Suitable for short codes like "https://example.com/validar/ABCD1234".

/* eslint-disable */

// ── QR core ──────────────────────────────────────────────────────────────────
// Ported to ES module form. Original structure preserved; see source for details.

const QRMode = { MODE_8BIT_BYTE: 4 };
const QRErrorCorrectionLevel = { M: 0 };

// Polynomial for GF(256)
function QRPolynomial(num, shift) {
  if (num.length == undefined) throw new Error(num.length + '/' + shift);
  let offset = 0;
  while (offset < num.length && num[offset] == 0) offset++;
  this.num = new Array(num.length - offset + shift);
  for (let i = 0; i < num.length - offset; i++) this.num[i] = num[i + offset];
}
QRPolynomial.prototype = {
  get(index) { return this.num[index]; },
  getLength() { return this.num.length; },
  multiply(e) {
    const num = new Array(this.getLength() + e.getLength() - 1);
    for (let i = 0; i < num.length; i++) num[i] = 0;
    for (let i = 0; i < this.getLength(); i++)
      for (let j = 0; j < e.getLength(); j++)
        num[i + j] ^= QRMath.gexp(QRMath.glog(this.get(i)) + QRMath.glog(e.get(j)));
    return new QRPolynomial(num, 0);
  },
  mod(e) {
    if (this.getLength() - e.getLength() < 0) return this;
    const ratio = QRMath.glog(this.get(0)) - QRMath.glog(e.get(0));
    const num = new Array(this.getLength());
    for (let i = 0; i < this.getLength(); i++) num[i] = this.get(i);
    for (let i = 0; i < e.getLength(); i++) num[i] ^= QRMath.gexp(QRMath.glog(e.get(i)) + ratio);
    return new QRPolynomial(num, 0).mod(e);
  },
};

const QRMath = (function () {
  const EXP_TABLE = new Array(256);
  const LOG_TABLE = new Array(256);
  for (let i = 0; i < 8; i++) EXP_TABLE[i] = 1 << i;
  for (let i = 8; i < 256; i++) EXP_TABLE[i] = EXP_TABLE[i - 4] ^ EXP_TABLE[i - 5] ^ EXP_TABLE[i - 6] ^ EXP_TABLE[i - 8];
  for (let i = 0; i < 255; i++) LOG_TABLE[EXP_TABLE[i]] = i;
  return {
    glog(n) { if (n < 1) throw new Error('glog(' + n + ')'); return LOG_TABLE[n]; },
    gexp(n) { while (n < 0) n += 255; while (n >= 256) n -= 255; return EXP_TABLE[n]; },
  };
})();

// RS block data (type version, errorCorrectionLevel, blockDataList)
// Only what we need for versions 1-10 with EC level M
const QRRSBlock = (function () {
  const RS_BLOCK_TABLE = [
    // Version 1 M
    [1, 26, 16],
    // Version 2 M
    [1, 44, 28],
    // Version 3 M
    [1, 70, 44],
    // Version 4 M
    [2, 50, 32],
    // Version 5 M
    [2, 67, 43],
    // Version 6 M
    [4, 43, 27],
    // Version 7 M
    [4, 49, 31],
    // Version 8 M
    [2, 60, 38, 2, 61, 39],
    // Version 9 M
    [3, 58, 36, 2, 59, 37],
    // Version 10 M
    [4, 69, 43, 1, 70, 44],
  ];
  function getRSBlocks(typeNumber, errorCorrectionLevel) {
    const rsBlock = RS_BLOCK_TABLE[(typeNumber - 1)];
    if (!rsBlock) throw new Error('bad rs block @ typeNumber:' + typeNumber);
    const length = rsBlock.length / 3;
    const list = [];
    for (let i = 0; i < length; i++) {
      const count = rsBlock[i * 3 + 0];
      const totalCount = rsBlock[i * 3 + 1];
      const dataCount = rsBlock[i * 3 + 2];
      for (let j = 0; j < count; j++) list.push({ totalCount, dataCount });
    }
    return list;
  }
  return { getRSBlocks };
})();

function QRBitBuffer() {
  this.buffer = [];
  this.length = 0;
}
QRBitBuffer.prototype = {
  get(index) { const bufIndex = Math.floor(index / 8); return ((this.buffer[bufIndex] >>> (7 - index % 8)) & 1) == 1; },
  put(num, length) { for (let i = 0; i < length; i++) this.putBit(((num >>> (length - i - 1)) & 1) == 1); },
  getLengthInBits() { return this.length; },
  putBit(bit) {
    const bufIndex = Math.floor(this.length / 8);
    if (this.buffer.length <= bufIndex) this.buffer.push(0);
    if (bit) this.buffer[bufIndex] |= 0x80 >>> (this.length % 8);
    this.length++;
  },
};

function createErrorCorrectPolynomial(errorCorrectLength) {
  let a = new QRPolynomial([1], 0);
  for (let i = 0; i < errorCorrectLength; i++) a = a.multiply(new QRPolynomial([1, QRMath.gexp(i)], 0));
  return a;
}

// ── QR model ─────────────────────────────────────────────────────────────────
function QRCodeModel(typeNumber, errorCorrectionLevel) {
  this.typeNumber = typeNumber;
  this.errorCorrectionLevel = errorCorrectionLevel;
  this.modules = null;
  this.moduleCount = 0;
  this.dataCache = null;
  this.dataList = [];
}

QRCodeModel.prototype = {
  addData(data) {
    const newData = new QR8bitByte(data);
    this.dataList.push(newData);
    this.dataCache = null;
  },
  isDark(row, col) {
    if (row < 0 || this.moduleCount <= row || col < 0 || this.moduleCount <= col) throw new Error(row + ',' + col);
    return this.modules[row][col];
  },
  getModuleCount() { return this.moduleCount; },
  make() { this._makeImpl(false, this._getBestMaskPattern()); },
  _makeImpl(test, maskPattern) {
    this.moduleCount = this.typeNumber * 4 + 17;
    this.modules = [];
    for (let row = 0; row < this.moduleCount; row++) {
      this.modules[row] = [];
      for (let col = 0; col < this.moduleCount; col++) this.modules[row][col] = null;
    }
    this._setupPositionProbePattern(0, 0);
    this._setupPositionProbePattern(this.moduleCount - 7, 0);
    this._setupPositionProbePattern(0, this.moduleCount - 7);
    this._setupPositionAdjustPattern();
    this._setupTimingPattern();
    this._setupTypeInfo(test, maskPattern);
    if (this.typeNumber >= 7) this._setupTypeNumber(test);
    if (this.dataCache == null) this.dataCache = QRCodeModel._createData(this.typeNumber, this.errorCorrectionLevel, this.dataList);
    this._mapData(this.dataCache, maskPattern);
  },
  _setupPositionProbePattern(row, col) {
    for (let r = -1; r <= 7; r++) {
      if (row + r <= -1 || this.moduleCount <= row + r) continue;
      for (let c = -1; c <= 7; c++) {
        if (col + c <= -1 || this.moduleCount <= col + c) continue;
        if ((0 <= r && r <= 6 && (c == 0 || c == 6)) || (0 <= c && c <= 6 && (r == 0 || r == 6)) || (2 <= r && r <= 4 && 2 <= c && c <= 4)) {
          this.modules[row + r][col + c] = true;
        } else this.modules[row + r][col + c] = false;
      }
    }
  },
  _getBestMaskPattern() {
    let minLostPoint = 0, pattern = 0;
    for (let i = 0; i < 8; i++) {
      this._makeImpl(true, i);
      const lostPoint = QRUtil.getLostPoint(this);
      if (i == 0 || minLostPoint > lostPoint) { minLostPoint = lostPoint; pattern = i; }
    }
    return pattern;
  },
  _setupTimingPattern() {
    for (let r = 8; r < this.moduleCount - 8; r++) if (this.modules[r][6] == null) this.modules[r][6] = r % 2 == 0;
    for (let c = 8; c < this.moduleCount - 8; c++) if (this.modules[6][c] == null) this.modules[6][c] = c % 2 == 0;
  },
  _setupPositionAdjustPattern() {
    const pos = QRUtil.getPatternPosition(this.typeNumber);
    for (let i = 0; i < pos.length; i++) {
      for (let j = 0; j < pos.length; j++) {
        const row = pos[i], col = pos[j];
        if (this.modules[row][col] != null) continue;
        for (let r = -2; r <= 2; r++) {
          for (let c = -2; c <= 2; c++) {
            this.modules[row + r][col + c] = r == -2 || r == 2 || c == -2 || c == 2 || (r == 0 && c == 0);
          }
        }
      }
    }
  },
  _setupTypeNumber(test) {
    const bits = QRUtil.getBCHTypeNumber(this.typeNumber);
    for (let i = 0; i < 18; i++) {
      this.modules[Math.floor(i / 3)][i % 3 + this.moduleCount - 8 - 3] = !test && ((bits >> i) & 1) == 1;
    }
    for (let i = 0; i < 18; i++) {
      this.modules[i % 3 + this.moduleCount - 8 - 3][Math.floor(i / 3)] = !test && ((bits >> i) & 1) == 1;
    }
  },
  _setupTypeInfo(test, maskPattern) {
    const data = (this.errorCorrectionLevel << 3) | maskPattern;
    const bits = QRUtil.getBCHTypeInfo(data);
    for (let i = 0; i < 15; i++) {
      const mod = !test && ((bits >> i) & 1) == 1;
      if (i < 6) this.modules[i][8] = mod;
      else if (i < 8) this.modules[i + 1][8] = mod;
      else this.modules[this.moduleCount - 15 + i][8] = mod;
    }
    for (let i = 0; i < 15; i++) {
      const mod = !test && ((bits >> i) & 1) == 1;
      if (i < 8) this.modules[8][this.moduleCount - i - 1] = mod;
      else if (i < 9) this.modules[8][15 - i - 1 + 1] = mod;
      else this.modules[8][15 - i - 1] = mod;
    }
    this.modules[this.moduleCount - 8][8] = !test;
  },
  _mapData(data, maskPattern) {
    let inc = -1, row = this.moduleCount - 1, bitIndex = 7, byteIndex = 0;
    for (let col = this.moduleCount - 1; col > 0; col -= 2) {
      if (col == 6) col--;
      while (true) {
        for (let c = 0; c < 2; c++) {
          if (this.modules[row][col - c] == null) {
            let dark = false;
            if (byteIndex < data.length) dark = ((data[byteIndex] >>> bitIndex) & 1) == 1;
            const mask = QRUtil.getMask(maskPattern, row, col - c);
            if (mask) dark = !dark;
            this.modules[row][col - c] = dark;
            bitIndex--;
            if (bitIndex == -1) { byteIndex++; bitIndex = 7; }
          }
        }
        row += inc;
        if (row < 0 || this.moduleCount <= row) { row -= inc; inc = -inc; break; }
      }
    }
  },
};

QRCodeModel._createData = function (typeNumber, errorCorrectionLevel, dataList) {
  const rsBlocks = QRRSBlock.getRSBlocks(typeNumber, errorCorrectionLevel);
  const buffer = new QRBitBuffer();
  for (let i = 0; i < dataList.length; i++) {
    const data = dataList[i];
    buffer.put(data.getMode(), 4);
    buffer.put(data.getLength(), QRUtil.getLengthInBits(data.getMode(), typeNumber));
    data.write(buffer);
  }
  let totalDataCount = 0;
  for (let i = 0; i < rsBlocks.length; i++) totalDataCount += rsBlocks[i].dataCount;
  if (buffer.getLengthInBits() > totalDataCount * 8) throw new Error('code length overflow');
  if (buffer.getLengthInBits() + 4 <= totalDataCount * 8) buffer.put(0, 4);
  while (buffer.getLengthInBits() % 8 != 0) buffer.putBit(false);
  while (true) {
    if (buffer.getLengthInBits() >= totalDataCount * 8) break;
    buffer.put(0xEC, 8);
    if (buffer.getLengthInBits() >= totalDataCount * 8) break;
    buffer.put(0x11, 8);
  }
  return QRCodeModel._createBytes(buffer, rsBlocks);
};

QRCodeModel._createBytes = function (buffer, rsBlocks) {
  let offset = 0, maxDcCount = 0, maxEcCount = 0;
  const dcdata = new Array(rsBlocks.length);
  const ecdata = new Array(rsBlocks.length);
  for (let r = 0; r < rsBlocks.length; r++) {
    const dcCount = rsBlocks[r].dataCount;
    const ecCount = rsBlocks[r].totalCount - dcCount;
    maxDcCount = Math.max(maxDcCount, dcCount);
    maxEcCount = Math.max(maxEcCount, ecCount);
    dcdata[r] = new Array(dcCount);
    for (let i = 0; i < dcdata[r].length; i++) dcdata[r][i] = 0xff & buffer.buffer[i + offset];
    offset += dcCount;
    const rsPoly = createErrorCorrectPolynomial(ecCount);
    const rawPoly = new QRPolynomial(dcdata[r], rsPoly.getLength() - 1);
    const modPoly = rawPoly.mod(rsPoly);
    ecdata[r] = new Array(rsPoly.getLength() - 1);
    for (let i = 0; i < ecdata[r].length; i++) {
      const modIndex = i + modPoly.getLength() - ecdata[r].length;
      ecdata[r][i] = modIndex >= 0 ? modPoly.get(modIndex) : 0;
    }
  }
  const totalCodeCount = rsBlocks.reduce((s, b) => s + b.totalCount, 0);
  const data = new Array(totalCodeCount);
  let index = 0;
  for (let i = 0; i < maxDcCount; i++) for (let r = 0; r < rsBlocks.length; r++) if (i < dcdata[r].length) data[index++] = dcdata[r][i];
  for (let i = 0; i < maxEcCount; i++) for (let r = 0; r < rsBlocks.length; r++) if (i < ecdata[r].length) data[index++] = ecdata[r][i];
  return data;
};

const QRUtil = {
  PATTERN_POSITION_TABLE: [
    [], [6, 18], [6, 22], [6, 26], [6, 30], [6, 34],
    [6, 22, 38], [6, 24, 42], [6, 26, 46], [6, 28, 50],
  ],
  G15: (1 << 10) | (1 << 8) | (1 << 5) | (1 << 4) | (1 << 2) | (1 << 1) | (1 << 0),
  G18: (1 << 12) | (1 << 11) | (1 << 10) | (1 << 9) | (1 << 8) | (1 << 5) | (1 << 2) | (1 << 0),
  G15_MASK: (1 << 14) | (1 << 12) | (1 << 10) | (1 << 4) | (1 << 1),
  getBCHTypeInfo(data) {
    let d = data << 10;
    while (QRUtil.getBCHDigit(d) - QRUtil.getBCHDigit(QRUtil.G15) >= 0) d ^= QRUtil.G15 << (QRUtil.getBCHDigit(d) - QRUtil.getBCHDigit(QRUtil.G15));
    return ((data << 10) | d) ^ QRUtil.G15_MASK;
  },
  getBCHTypeNumber(data) {
    let d = data << 12;
    while (QRUtil.getBCHDigit(d) - QRUtil.getBCHDigit(QRUtil.G18) >= 0) d ^= QRUtil.G18 << (QRUtil.getBCHDigit(d) - QRUtil.getBCHDigit(QRUtil.G18));
    return (data << 12) | d;
  },
  getBCHDigit(data) { let digit = 0; while (data != 0) { digit++; data >>>= 1; } return digit; },
  getPatternPosition(typeNumber) { return QRUtil.PATTERN_POSITION_TABLE[typeNumber - 1]; },
  getMask(maskPattern, i, j) {
    switch (maskPattern) {
      case 0: return (i + j) % 2 == 0;
      case 1: return i % 2 == 0;
      case 2: return j % 3 == 0;
      case 3: return (i + j) % 3 == 0;
      case 4: return (Math.floor(i / 2) + Math.floor(j / 3)) % 2 == 0;
      case 5: return (i * j) % 2 + (i * j) % 3 == 0;
      case 6: return ((i * j) % 2 + (i * j) % 3) % 2 == 0;
      case 7: return ((i * j) % 3 + (i + j) % 2) % 2 == 0;
    }
    throw new Error('bad maskPattern:' + maskPattern);
  },
  getErrorCorrectPolynomial(errorCorrectLength) { return createErrorCorrectPolynomial(errorCorrectLength); },
  getLengthInBits(mode, type) {
    if (1 <= type && type < 10) {
      if (mode == QRMode.MODE_8BIT_BYTE) return 8;
    } else if (type < 27) {
      if (mode == QRMode.MODE_8BIT_BYTE) return 16;
    } else if (type < 41) {
      if (mode == QRMode.MODE_8BIT_BYTE) return 16;
    }
    throw new Error('mode:' + mode + '; type:' + type);
  },
  getLostPoint(qrCode) {
    const moduleCount = qrCode.getModuleCount();
    let lostPoint = 0;
    for (let row = 0; row < moduleCount; row++) {
      for (let col = 0; col < moduleCount; col++) {
        let sameCount = 0;
        const dark = qrCode.isDark(row, col);
        for (let r = -1; r <= 1; r++) {
          if (row + r < 0 || moduleCount <= row + r) continue;
          for (let c = -1; c <= 1; c++) {
            if (col + c < 0 || moduleCount <= col + c) continue;
            if (r == 0 && c == 0) continue;
            if (dark == qrCode.isDark(row + r, col + c)) sameCount++;
          }
        }
        if (sameCount > 5) lostPoint += 3 + sameCount - 5;
      }
    }
    for (let row = 0; row < moduleCount - 1; row++) {
      for (let col = 0; col < moduleCount - 1; col++) {
        let count = 0;
        if (qrCode.isDark(row, col)) count++;
        if (qrCode.isDark(row + 1, col)) count++;
        if (qrCode.isDark(row, col + 1)) count++;
        if (qrCode.isDark(row + 1, col + 1)) count++;
        if (count == 0 || count == 4) lostPoint += 3;
      }
    }
    for (let row = 0; row < moduleCount; row++) {
      for (let col = 0; col < moduleCount - 6; col++) {
        if (qrCode.isDark(row, col) && !qrCode.isDark(row, col + 1) && qrCode.isDark(row, col + 2) && qrCode.isDark(row, col + 3) && qrCode.isDark(row, col + 4) && !qrCode.isDark(row, col + 5) && qrCode.isDark(row, col + 6)) lostPoint += 40;
      }
    }
    for (let col = 0; col < moduleCount; col++) {
      for (let row = 0; row < moduleCount - 6; row++) {
        if (qrCode.isDark(row, col) && !qrCode.isDark(row + 1, col) && qrCode.isDark(row + 2, col) && qrCode.isDark(row + 3, col) && qrCode.isDark(row + 4, col) && !qrCode.isDark(row + 5, col) && qrCode.isDark(row + 6, col)) lostPoint += 40;
      }
    }
    let darkCount = 0;
    for (let col = 0; col < moduleCount; col++) for (let row = 0; row < moduleCount; row++) if (qrCode.isDark(row, col)) darkCount++;
    const ratio = Math.abs(100 * darkCount / moduleCount / moduleCount - 50) / 5;
    lostPoint += ratio * 10;
    return lostPoint;
  },
};

function QR8bitByte(data) {
  this.mode = QRMode.MODE_8BIT_BYTE;
  this.data = data;
  // Encode as UTF-8 bytes
  const utf8 = unescape(encodeURIComponent(data));
  this.parsedData = [];
  for (let i = 0; i < utf8.length; i++) this.parsedData.push(utf8.charCodeAt(i));
}
QR8bitByte.prototype = {
  getMode() { return QRMode.MODE_8BIT_BYTE; },
  getLength() { return this.parsedData.length; },
  write(buffer) { for (let i = 0; i < this.parsedData.length; i++) buffer.put(this.parsedData[i], 8); },
};

// Determine minimum version for the data length at EC level M
// Capacities are user-data byte capacities per QR spec (byte mode, EC level M).
// These are the actual character capacities after subtracting mode+length overhead.
function _getTypeNumber(text) {
  const utf8Len = unescape(encodeURIComponent(text)).length;
  // User-data capacity (byte mode, EC level M): versions 1-10
  // Source: QR Code spec, Table 7 (ISO/IEC 18004:2015)
  const capacities = [14, 26, 42, 62, 84, 106, 122, 152, 180, 213];
  for (let i = 0; i < capacities.length; i++) {
    if (utf8Len <= capacities[i]) return i + 1;
  }
  throw new Error('QR: text too long for supported versions (max ~213 bytes UTF-8)');
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Generate a QR code as an SVG string.
 * @param {string} text - Content to encode
 * @param {{ cellSize?: number, margin?: number }} [opts]
 * @returns {string} SVG markup
 */
export function generateQrSvg(text, opts) {
  opts = opts || {};
  const cellSize = opts.cellSize || 4;
  const margin = opts.margin != null ? opts.margin : 2;

  const typeNumber = _getTypeNumber(text);
  const qr = new QRCodeModel(typeNumber, QRErrorCorrectionLevel.M);
  qr.addData(text);
  qr.make();

  const count = qr.getModuleCount();
  const total = count + margin * 2;
  const dim = total * cellSize;

  let rects = '';
  for (let row = 0; row < count; row++) {
    for (let col = 0; col < count; col++) {
      if (qr.isDark(row, col)) {
        const x = (col + margin) * cellSize;
        const y = (row + margin) * cellSize;
        rects += '<rect x="' + x + '" y="' + y + '" width="' + cellSize + '" height="' + cellSize + '"/>';
      }
    }
  }

  return '<svg xmlns="http://www.w3.org/2000/svg" width="' + dim + '" height="' + dim +
    '" viewBox="0 0 ' + dim + ' ' + dim + '">' +
    '<rect width="' + dim + '" height="' + dim + '" fill="white"/>' +
    '<g fill="black">' + rects + '</g>' +
    '</svg>';
}

/**
 * Generate a QR code as a PNG data URL using an offscreen canvas.
 * Falls back to an SVG data URL in environments without canvas (e.g. Node.js tests).
 * @param {string} text
 * @param {{ cellSize?: number, margin?: number }} [opts]
 * @returns {string} data URL
 */
export function generateQrDataUrl(text, opts) {
  opts = opts || {};
  const cellSize = opts.cellSize || 4;
  const margin = opts.margin != null ? opts.margin : 2;

  const typeNumber = _getTypeNumber(text);
  const qr = new QRCodeModel(typeNumber, QRErrorCorrectionLevel.M);
  qr.addData(text);
  qr.make();

  const count = qr.getModuleCount();
  const total = count + margin * 2;
  const dim = total * cellSize;

  // Canvas path (browser)
  if (typeof document !== 'undefined' && document.createElement) {
    const canvas = document.createElement('canvas');
    canvas.width = dim;
    canvas.height = dim;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, dim, dim);
    ctx.fillStyle = '#000000';
    for (let row = 0; row < count; row++) {
      for (let col = 0; col < count; col++) {
        if (qr.isDark(row, col)) {
          ctx.fillRect((col + margin) * cellSize, (row + margin) * cellSize, cellSize, cellSize);
        }
      }
    }
    return canvas.toDataURL('image/png');
  }

  // Fallback: SVG data URL (usable in Node tests or environments without canvas)
  const svg = generateQrSvg(text, opts);
  return 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(svg)));
}
