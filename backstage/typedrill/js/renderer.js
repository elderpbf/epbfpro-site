// Paints the target area with ok/bad/cur/pending char classes.

const WS_DISPLAY = {
  space:  ' ',
  bullet: '·',
  bar:    '|'
};

export function paint(targetEl, target, value, settings) {
  const wsGlyph = WS_DISPLAY[settings && settings.whitespaceDisplay] || WS_DISPLAY.bullet;
  const parts = [];
  for (let i = 0; i < target.length; i++) {
    const expected = target[i];
    let cls, displayChar;
    if (i < value.length) {
      const typed = value[i];
      if (typed === expected) {
        cls = 'ok-char';
        displayChar = expected;
      } else {
        cls = 'bad-char';
        displayChar = typed;
      }
    } else if (i === value.length) {
      cls = 'cur-char';
      displayChar = expected;
    } else {
      cls = 'pending';
      displayChar = expected;
    }
    const display = displayChar === ' ' ? wsGlyph : displayChar;
    parts.push('<span class="' + cls + '">' + escapeHtml(display) + '</span>');
  }
  if (value.length >= target.length) {
    parts.push('<span class="cur-char"> </span>');
  }
  targetEl.innerHTML = parts.join('');
}

function escapeHtml(s) {
  return s.replace(/[&<>"']/g, function (c) {
    return { '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c];
  });
}
