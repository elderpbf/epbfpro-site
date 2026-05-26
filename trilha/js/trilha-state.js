'use strict';

// Trilha.State -- shared state across the trilha public-page modules.
// Owns URL params, the fetched turma view, render flags, the mobile media
// query, and the icon library used by action buttons.
//
// Modules read/write Trilha.State.* directly; init() parses URL and seeds the
// admin flag from localStorage. Page.init() calls this first.

(function () {
  var Trilha = window.Trilha = window.Trilha || {};

  var ICONS = {
    copy:
      '<svg viewBox="0 0 24 24"><rect x="9" y="9" width="13" height="13" rx="2"/>' +
      '<path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>',
    external:
      '<svg viewBox="0 0 24 24"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>' +
      '<polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>',
    download:
      '<svg viewBox="0 0 24 24"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>' +
      '<polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>',
    check:
      '<svg viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"/></svg>',
    send:
      '<svg viewBox="0 0 24 24"><line x1="22" y1="2" x2="11" y2="13"/>' +
      '<polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>'
  };

  var WA_ICON =
    '<svg viewBox="0 0 24 24" fill="currentColor" xmlns="http://www.w3.org/2000/svg">' +
    '<path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>';

  var State = {
    clientSlug: null,
    turmaSlug: null,
    token: null,
    isAdmin: false,

    data: null,
    outrosTypeFilter: null,
    rendered: { aulas: false, apostila: false, outros: false },

    mqMobile: null,

    ICONS: ICONS,
    WA_ICON: WA_ICON,

    init: function () {
      var params = new URLSearchParams(window.location.search);
      this.clientSlug = params.get('c');
      this.turmaSlug = params.get('t');
      this.token = params.get('k');

      if (!this.clientSlug || !this.turmaSlug) {
        var parts = window.location.pathname.replace(/^\/trilha\/?/, '').replace(/\/$/, '').split('/');
        if (parts.length >= 2 && parts[0]) {
          this.clientSlug = parts[0];
          this.turmaSlug = parts[1] || null;
        }
      }

      // ?admin=1 persists; ?admin=0 clears.
      if (params.has('admin')) {
        try {
          if (params.get('admin') === '1') localStorage.setItem('ct_is_admin', '1');
          else                              localStorage.removeItem('ct_is_admin');
        } catch (_) {}
      }
      try { this.isAdmin = localStorage.getItem('ct_is_admin') === '1'; } catch (_) { this.isAdmin = false; }

      this.mqMobile = window.matchMedia('(max-width: 700px)');
    },

    isFocusMode: function () {
      return !!(this.mqMobile && this.mqMobile.matches);
    },
  };

  Trilha.State = State;
})();
