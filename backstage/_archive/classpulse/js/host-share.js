'use strict';

// CPHost.Share -- everything tied to making the session shareable: the
// ClassTrail turma link, the QR modal trigger, and the hosted/not-hosted
// chrome state. buildTrilhaUrl is the canonical URL builder consumed by
// the QR modal.

(function () {
  var CPHost = window.CPHost = window.CPHost || {};

  function buildTrilhaUrl() {
    var t = CPHost.State._trailTurma;
    if (!t) return null;
    return 'https://pensoia.com/trilha/' +
      encodeURIComponent(t.client_slug) + '/' +
      encodeURIComponent(t.turma_slug) +
      (t.token ? '?k=' + encodeURIComponent(t.token) : '');
  }

  // The "is-hosted" class lives on State.root so CSS rules can scope to a
  // sidebar mount instead of the whole page. Fallback to document.body for
  // host.html's standalone case where State.root may not yet be set.
  function _hostedRoot() {
    return CPHost.State.root || document.body;
  }

  // QR button visibility: shown only when session is being hosted AND a turma
  // is linked. QR image is generated on-demand by QRShareModal when clicked.
  function refreshShareSurface() {
    var hasTrilha = !!buildTrilhaUrl();
    var isHosted = _hostedRoot().classList.contains('is-hosted');
    CPHost.$('qr-btn').hidden = !(isHosted && hasTrilha);
  }

  function applyHostedUI(isHosted) {
    var S = CPHost.State;
    _hostedRoot().classList.toggle('is-hosted', isHosted);
    CPHost.$('host-live-indicator').hidden = !isHosted;
    CPHost.$('not-hosted-note').hidden = isHosted;
    CPHost.$('qr-btn').hidden = !(isHosted && !!S._trailTurma);
    CPHost.$('display-link').hidden = !isHosted;
    CPHost.$('start-host-btn').hidden = isHosted;
    CPHost.$('stop-host-btn').hidden = !isHosted;
    CPHost.$('viewToggles').hidden = !isHosted;
    CPHost.$('resetLayoutBtn').hidden = !isHosted;
    CPHost.$('launch-q-card').style.display = isHosted ? '' : 'none';
    if (!isHosted) {
      CPHost.$('active-q-panel').style.display = 'none';
      CPHost.$('qa-section').style.display = 'none';
      S.activeQId = null;
      S.activeQType = null;
      S.activeStudentQuestionId = null;
    }
  }

  function renderTrailLink() {
    var S = CPHost.State;
    var esc = (typeof escHtml === 'function') ? escHtml : function (s) { return s; };
    var btn     = CPHost.$('trail-btn');
    var content = CPHost.$('trail-modal-content');
    if (!btn || !content) return;

    btn.hidden = false;
    btn.classList.toggle('is-linked', !!S._trailTurma);

    if (S._trailTurma) {
      var t = S._trailTurma;
      var turmaName  = t.display_name || t.name || t.turma_slug;
      var clientName = t.client_display_name || t.client_slug;
      var trilhaUrl  = '/trilha/' + encodeURIComponent(t.client_slug) + '/' + encodeURIComponent(t.turma_slug) + (t.token ? '?k=' + encodeURIComponent(t.token) : '');
      var adminUrl   = '/backstage/classtrail/';
      content.innerHTML =
        '<div class="host-pres-status">Vinculada a esta sessão</div>' +
        '<div class="host-pres-title">' + esc(turmaName) + '</div>' +
        '<div class="host-pres-engine">' + esc(clientName) + '</div>' +
        '<a class="host-pres-link" href="' + esc(trilhaUrl) + '" target="_blank" rel="noopener" style="margin-bottom:1.6rem">Abrir trilha ↗</a><br>' +
        '<a class="host-pres-link" href="' + esc(adminUrl) + '" target="_blank" rel="noopener">Abrir ClassTrail (admin) ↗</a>' +
        '<button class="host-btn host-btn-danger host-btn-full" id="trail-unlink-btn" style="margin-top:0.6rem">Desvincular turma</button>';
      var unlinkBtn = CPHost.$('trail-unlink-btn');
      if (unlinkBtn) unlinkBtn.addEventListener('click', doUnlinkTrail);
    } else if (S._trailAllTurmas.length > 0) {
      var opts = '<option value="">Selecione uma turma…</option>';
      S._trailAllTurmas.forEach(function (t2) {
        var turmaName2  = t2.display_name || t2.name || t2.turma_slug;
        var clientName2 = t2.client_display_name || t2.client_slug;
        var label       = clientName2 + ' · ' + turmaName2;
        var inUse       = t2.classpulse_session_id && t2.classpulse_session_id !== S.sessionCode;
        var suffix      = inUse ? ' (vinculada a ' + t2.classpulse_session_id + ')' : '';
        var disabled    = inUse ? ' disabled' : '';
        var value       = t2.client_slug + '|' + t2.turma_slug;
        opts += '<option value="' + esc(value) + '"' + disabled + '>' + esc(label + suffix) + '</option>';
      });
      content.innerHTML =
        '<div class="host-pres-status">Nenhuma turma vinculada</div>' +
        '<select id="trail-picker">' + opts + '</select>' +
        '<button class="host-btn host-btn-primary host-btn-full" id="trail-link-btn">Vincular turma</button>';
      var linkBtn = CPHost.$('trail-link-btn');
      if (linkBtn) linkBtn.addEventListener('click', async function () {
        var v = CPHost.$('trail-picker').value;
        if (!v) return;
        var parts = v.split('|');
        await doLinkTrail(parts[0], parts[1]);
      });
    } else {
      content.innerHTML = '<div class="host-pres-empty">Nenhuma turma cadastrada em ClassTrail.</div>';
    }
  }

  async function doLinkTrail(clientSlug, turmaSlug) {
    var S = CPHost.State;
    try {
      await callWorker({
        action: 'ct_update_turma_meta',
        auth_token: S.AUTH_TOKEN,
        client_slug: clientSlug,
        slug: turmaSlug,
        classpulse_session_id: S.sessionCode,
      });
      var res = await callWorker({ action: 'ct_lookup_turma_by_session', auth_token: S.AUTH_TOKEN, session_id: S.sessionCode });
      S._trailTurma = res.turma || null;
      try {
        var listRes = await callWorker({ action: 'ct_list_all_turmas', auth_token: S.AUTH_TOKEN });
        S._trailAllTurmas = listRes.turmas || [];
      } catch (_) {}
      renderTrailLink();
      refreshShareSurface();
      CPHost.$('trail-modal').classList.remove('open');
      if (typeof showToast === 'function') showToast('Turma vinculada.');
    } catch (e) {
      if (typeof showToastError === 'function') showToastError(e.message);
    }
  }

  async function doUnlinkTrail() {
    var S = CPHost.State;
    if (!S._trailTurma) return;
    try {
      await callWorker({
        action: 'ct_update_turma_meta',
        auth_token: S.AUTH_TOKEN,
        client_slug: S._trailTurma.client_slug,
        slug: S._trailTurma.turma_slug,
        classpulse_session_id: null,
      });
      S._trailTurma = null;
      try {
        var listRes = await callWorker({ action: 'ct_list_all_turmas', auth_token: S.AUTH_TOKEN });
        S._trailAllTurmas = listRes.turmas || [];
      } catch (_) {}
      renderTrailLink();
      refreshShareSurface();
      CPHost.$('trail-modal').classList.remove('open');
      if (typeof showToast === 'function') showToast('Turma desvinculada.');
    } catch (e) {
      if (typeof showToastError === 'function') showToastError(e.message);
    }
  }

  function init() {
    var trailBtn = CPHost.$('trail-btn');
    if (trailBtn) {
      trailBtn.addEventListener('click', function () {
        CPHost.$('trail-modal').classList.add('open');
      });
    }
    var closeBtn = CPHost.$('trail-modal-close-btn');
    if (closeBtn) {
      closeBtn.addEventListener('click', function () {
        CPHost.$('trail-modal').classList.remove('open');
      });
    }
    var modal = CPHost.$('trail-modal');
    if (modal) {
      modal.addEventListener('click', function (e) {
        if (e.target === this) this.classList.remove('open');
      });
    }
    var qrBtn = CPHost.$('qr-btn');
    if (qrBtn) {
      qrBtn.addEventListener('click', function () {
        if (typeof QRShareModal !== 'undefined') QRShareModal.open({ joinUrl: buildTrilhaUrl() });
      });
    }
  }

  CPHost.Share = {
    buildTrilhaUrl: buildTrilhaUrl,
    refreshShareSurface: refreshShareSurface,
    applyHostedUI: applyHostedUI,
    renderTrailLink: renderTrailLink,
    doLinkTrail: doLinkTrail,
    doUnlinkTrail: doUnlinkTrail,
    init: init,
  };
})();
