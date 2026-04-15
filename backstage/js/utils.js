'use strict';

var LETTERS = ['A', 'B', 'C', 'D', 'E', 'F'];

function escHtml(s) {
  return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function stripOptPrefix(s) {
  return typeof s === 'string' ? s.replace(/^[A-Da-d][.)]\s*/, '') : s;
}

function parseCSV(text) {
  var trimmed = String(text || '').trim();
  if (trimmed.startsWith('<!') || trimmed.startsWith('<html') || trimmed.startsWith('<HTML')) {
    console.error('CSV returned HTML.');
    if (typeof dbg !== 'undefined') {
      dbg('warn', 'CSV returned HTML — sheet not published to web?');
    } else if (typeof console !== 'undefined' && console.warn) {
      console.warn('CSV returned HTML — sheet not published to web?');
    }
    return [];
  }
  return trimmed.split('\n').slice(1).map(parseCSVLine);
}

function parseCSVLine(line) {
  var result = [], current = '', inQuotes = false;
  for (var i = 0; i < line.length; i++) {
    if (line[i] === '"') {
      if (inQuotes && line[i+1] === '"') { current += '"'; i++; }
      else inQuotes = !inQuotes;
    } else if (line[i] === ',' && !inQuotes) {
      result.push(current); current = '';
    } else { current += line[i]; }
  }
  result.push(current);
  return result;
}

function showToast(msg) {
  var el = document.createElement('div');
  el.className = 'bs-toast';
  el.textContent = msg.length > 80 ? msg.slice(0, 80) + '...' : msg;
  document.body.appendChild(el);
  setTimeout(function() { el.classList.add('show'); }, 10);
  setTimeout(function() { el.classList.remove('show'); setTimeout(function() { el.remove(); }, 300); }, 3000);
}

function showToastError(msg) {
  console.error(msg);
  var el = document.createElement('div');
  el.className = 'bs-toast-error';
  el.textContent = msg.length > 80 ? msg.slice(0, 80) + '...' : msg;
  document.body.appendChild(el);
  setTimeout(function() { el.classList.add('show'); }, 10);
  setTimeout(function() { el.classList.remove('show'); setTimeout(function() { el.remove(); }, 300); }, 3500);
}

if (typeof window !== 'undefined') window.alert = function(msg) { showToastError(String(msg)); };

async function hashPw(pw) {
  var buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(pw));
  return Array.from(new Uint8Array(buf)).map(function(b) { return b.toString(16).padStart(2, '0'); }).join('');
}

if (typeof module !== 'undefined') module.exports = { escHtml, parseCSV, parseCSVLine, LETTERS, stripOptPrefix, hashPw };
