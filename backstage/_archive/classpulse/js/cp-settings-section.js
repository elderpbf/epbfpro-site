'use strict';

// ClassPulse "Questões" settings — drawer section.
// Bundle L Item 4: replaces the standalone Configurações sub-tab. Registered as
// a custom section in SettingsDrawer via Topbar.init({sections}) on the
// Perguntas pages only. Module shape:
//   CPSettings.html() -> inner HTML for the drawer section.
//   CPSettings.init() -> bind save + collapsibles. Called once after the
//                        drawer DOM is in place.
//   CPSettings.onOpen() -> reload current values from localStorage. Called
//                          each time the drawer opens.

window.CPSettings = (function() {

  function html() {
    return ''
      + '<div class="cp-settings-section">'
      +   '<div class="cp-settings-title" aria-expanded="false">'
      +     '<span>Geral</span>'
      +     '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9l6 6 6-6"/></svg>'
      +   '</div>'
      +   '<div class="cp-settings-body">'
      +     '<div class="bs-field">'
      +       '<label>Intervalo de polling (ms)</label>'
      +       '<input type="number" id="cfg-poll-interval" placeholder="3000">'
      +     '</div>'
      +   '</div>'
      + '</div>'

      + '<div class="cp-settings-section">'
      +   '<div class="cp-settings-title" aria-expanded="false">'
      +     '<span>Múltipla Escolha (mc)</span>'
      +     '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9l6 6 6-6"/></svg>'
      +   '</div>'
      +   '<div class="cp-settings-body">'
      +     '<div class="bs-field">'
      +       '<label>Quantidade de opções padrão</label>'
      +       '<select id="cfg-mc-optionCount">'
      +         '<option value="2">2</option><option value="3">3</option>'
      +         '<option value="4">4</option><option value="5">5</option>'
      +         '<option value="6">6</option>'
      +       '</select>'
      +     '</div>'
      +   '</div>'
      + '</div>'

      + '<div class="cp-settings-section">'
      +   '<div class="cp-settings-title" aria-expanded="false">'
      +     '<span>Verdadeiro / Falso (tf)</span>'
      +     '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9l6 6 6-6"/></svg>'
      +   '</div>'
      +   '<div class="cp-settings-body">'
      +     '<div style="display:flex; gap:1rem;">'
      +       '<div class="bs-field" style="flex:1;">'
      +         '<label>Rótulo "Verdadeiro"</label>'
      +         '<input type="text" id="cfg-tf-labelTrue" placeholder="Verdadeiro">'
      +       '</div>'
      +       '<div class="bs-field" style="flex:1;">'
      +         '<label>Rótulo "Falso"</label>'
      +         '<input type="text" id="cfg-tf-labelFalse" placeholder="Falso">'
      +       '</div>'
      +     '</div>'
      +   '</div>'
      + '</div>'

      + '<div class="cp-settings-section">'
      +   '<div class="cp-settings-title" aria-expanded="false">'
      +     '<span>Enquete (poll)</span>'
      +     '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9l6 6 6-6"/></svg>'
      +   '</div>'
      +   '<div class="cp-settings-body">'
      +     '<div class="bs-field">'
      +       '<label>Máximo de opções</label>'
      +       '<select id="cfg-poll-maxOptions">'
      +         '<option value="2">2</option><option value="3">3</option>'
      +         '<option value="4">4</option><option value="5">5</option>'
      +         '<option value="6">6</option><option value="7">7</option>'
      +         '<option value="8">8</option>'
      +       '</select>'
      +     '</div>'
      +   '</div>'
      + '</div>'

      + '<div class="cp-settings-section">'
      +   '<div class="cp-settings-title" aria-expanded="false">'
      +     '<span>Texto Aberto (open)</span>'
      +     '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9l6 6 6-6"/></svg>'
      +   '</div>'
      +   '<div class="cp-settings-body">'
      +     '<div class="bs-field">'
      +       '<label>Limite de caracteres</label>'
      +       '<input type="number" id="cfg-open-maxChars" placeholder="500">'
      +     '</div>'
      +   '</div>'
      + '</div>'

      + '<div class="cp-settings-section">'
      +   '<div class="cp-settings-title" aria-expanded="false">'
      +     '<span>Nuvem de Palavras (wordcloud)</span>'
      +     '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9l6 6 6-6"/></svg>'
      +   '</div>'
      +   '<div class="cp-settings-body">'
      +     '<div class="bs-field">'
      +       '<label>Máximo de palavras por resposta</label>'
      +       '<select id="cfg-wordcloud-maxWords">'
      +         '<option value="1">1</option><option value="2">2</option>'
      +         '<option value="3">3</option>'
      +       '</select>'
      +     '</div>'
      +   '</div>'
      + '</div>'

      + '<div class="cp-settings-section">'
      +   '<div class="cp-settings-title" aria-expanded="false">'
      +     '<span>Avaliação (rating)</span>'
      +     '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9l6 6 6-6"/></svg>'
      +   '</div>'
      +   '<div class="cp-settings-body">'
      +     '<div style="display:flex; gap:1rem;">'
      +       '<div class="bs-field" style="flex:1;">'
      +         '<label>Valor Mínimo</label>'
      +         '<input type="number" id="cfg-rating-min" placeholder="1">'
      +       '</div>'
      +       '<div class="bs-field" style="flex:1;">'
      +         '<label>Valor Máximo</label>'
      +         '<input type="number" id="cfg-rating-max" placeholder="5">'
      +       '</div>'
      +     '</div>'
      +   '</div>'
      + '</div>'

      + '<div class="cp-settings-section">'
      +   '<div class="cp-settings-title" aria-expanded="false">'
      +     '<span>Numérico (numeric)</span>'
      +     '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9l6 6 6-6"/></svg>'
      +   '</div>'
      +   '<div class="cp-settings-body">'
      +     '<div style="display:flex; gap:1rem;">'
      +       '<div class="bs-field" style="flex:1;">'
      +         '<label>Mínimo permitido</label>'
      +         '<input type="number" id="cfg-numeric-min" placeholder="0">'
      +       '</div>'
      +       '<div class="bs-field" style="flex:1;">'
      +         '<label>Máximo permitido</label>'
      +         '<input type="number" id="cfg-numeric-max" placeholder="100">'
      +       '</div>'
      +     '</div>'
      +   '</div>'
      + '</div>'

      + '<div style="margin-top:1.5rem;">'
      +   '<button class="cp-btn-primary" id="save-settings-btn" style="width:100%">Salvar Configurações</button>'
      + '</div>';
  }

  function _load() {
    if (!window.QR || !window.QR.getTypeConfig) return;

    var pollInt = localStorage.getItem('cp_cfg_general_pollInterval');
    var poll = document.getElementById('cfg-poll-interval');
    if (poll) poll.value = pollInt || 3000;

    var mcCfg = QR.getTypeConfig('mc');
    var mc = document.getElementById('cfg-mc-optionCount');
    if (mc) mc.value = mcCfg.optionCount || 4;

    var tfCfg = QR.getTypeConfig('tf');
    var tfT = document.getElementById('cfg-tf-labelTrue');
    var tfF = document.getElementById('cfg-tf-labelFalse');
    if (tfT) tfT.value = tfCfg.labelTrue || 'Verdadeiro';
    if (tfF) tfF.value = tfCfg.labelFalse || 'Falso';

    var pollCfg = QR.getTypeConfig('poll');
    var pmo = document.getElementById('cfg-poll-maxOptions');
    if (pmo) pmo.value = pollCfg.maxOptions || 6;

    var openCfg = QR.getTypeConfig('open');
    var omc = document.getElementById('cfg-open-maxChars');
    if (omc) omc.value = openCfg.maxChars || 500;

    var wcCfg = QR.getTypeConfig('wordcloud');
    var wmw = document.getElementById('cfg-wordcloud-maxWords');
    if (wmw) wmw.value = wcCfg.maxWords || 3;

    var rCfg = QR.getTypeConfig('rating');
    var rmin = document.getElementById('cfg-rating-min');
    var rmax = document.getElementById('cfg-rating-max');
    if (rmin) rmin.value = rCfg.min !== undefined ? rCfg.min : 1;
    if (rmax) rmax.value = rCfg.max !== undefined ? rCfg.max : 5;

    var nCfg = QR.getTypeConfig('numeric');
    var nmin = document.getElementById('cfg-numeric-min');
    var nmax = document.getElementById('cfg-numeric-max');
    if (nmin) nmin.value = nCfg.min !== undefined ? nCfg.min : 0;
    if (nmax) nmax.value = nCfg.max !== undefined ? nCfg.max : 100;
  }

  function _save() {
    function setIf(id, key, fallback) {
      var el = document.getElementById(id);
      if (!el) return;
      localStorage.setItem(key, el.value || fallback);
    }
    setIf('cfg-poll-interval', 'cp_cfg_general_pollInterval', 3000);
    setIf('cfg-mc-optionCount', 'cp_cfg_mc_optionCount', '');
    setIf('cfg-tf-labelTrue', 'cp_cfg_tf_labelTrue', '');
    setIf('cfg-tf-labelFalse', 'cp_cfg_tf_labelFalse', '');
    setIf('cfg-poll-maxOptions', 'cp_cfg_poll_maxOptions', '');
    setIf('cfg-open-maxChars', 'cp_cfg_open_maxChars', '');
    setIf('cfg-wordcloud-maxWords', 'cp_cfg_wordcloud_maxWords', '');
    setIf('cfg-rating-min', 'cp_cfg_rating_min', '');
    setIf('cfg-rating-max', 'cp_cfg_rating_max', '');
    setIf('cfg-numeric-min', 'cp_cfg_numeric_min', '');
    setIf('cfg-numeric-max', 'cp_cfg_numeric_max', '');

    var btn = document.getElementById('save-settings-btn');
    if (!btn) return;
    var oldText = btn.textContent;
    btn.textContent = 'Salvo ✓';
    btn.disabled = true;
    setTimeout(function() {
      btn.textContent = oldText;
      btn.disabled = false;
    }, 2000);
  }

  function init() {
    var btn = document.getElementById('save-settings-btn');
    if (btn) btn.addEventListener('click', _save);

    document.querySelectorAll('.cp-settings-title').forEach(function(title) {
      title.addEventListener('click', function() {
        var isExpanded = this.getAttribute('aria-expanded') === 'true';
        this.setAttribute('aria-expanded', !isExpanded);
        var body = this.nextElementSibling;
        if (body) body.classList.toggle('open', !isExpanded);
      });
    });
  }

  return { html: html, init: init, onOpen: _load };

})();
