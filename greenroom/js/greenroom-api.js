// js/greenroom-api.js — the ONE backend seam.
//
// Greenroom has its OWN Worker (greenroom-api.pensoia.workers.dev), independent
// from Backstage. Every Worker call goes through here; UI modules never fetch the
// Worker directly. We borrow ONLY the operator's identity — the Backstage Google
// access token (same origin) — sent as Bearer, with the legacy pw-hash as the
// fallback param. This mirrors the Backstage callWorker contract WITHOUT importing
// Backstage (ARCHITECTURE §2). Two credentials never conflate: this is the
// OPERATOR identity, never the Instagram account token (that lives server-side in
// D1 and the Worker uses it for Graph calls).
//
// Fail loud (CLAUDE.md): network / HTTP / {error} all throw with the real detail
// on err.data; nothing is swallowed into a generic message.

const WORKER_URL = 'https://greenroom-api.pensoia.workers.dev';

function operatorToken() {
  try {
    if (window.BS_GOOGLE && BS_GOOGLE.isAuthed && BS_GOOGLE.isAuthed()) return BS_GOOGLE.getAccessToken();
  } catch (_) {}
  return null;
}

function pwHash() {
  try { return localStorage.getItem('bs_pw_hash') || ''; } catch (_) { return ''; }
}

export async function call(action, params) {
  const body = Object.assign({ action, auth_token: pwHash() }, params || {});
  const headers = { 'Content-Type': 'application/json' };
  const tok = operatorToken();
  if (tok) headers['Authorization'] = 'Bearer ' + tok;

  let resp;
  try {
    resp = await fetch(WORKER_URL + '/?action=' + encodeURIComponent(action), {
      method: 'POST', headers, body: JSON.stringify(body), redirect: 'follow',
    });
  } catch (netErr) {
    const e = new Error('Network: ' + (netErr && netErr.message ? netErr.message : String(netErr)));
    e.data = { error: 'network_error', detail: String(netErr) };
    throw e;
  }

  const txt = await resp.text();
  let data = {};
  try { data = txt ? JSON.parse(txt) : {}; }
  catch (_) {
    const e = new Error('Worker returned non-JSON');
    e.data = { error: 'json_parse_error', detail: txt.slice(0, 200) };
    throw e;
  }

  if (!resp.ok || data.error) {
    const e = new Error(data.error || ('HTTP ' + resp.status));
    e.status = resp.status;
    e.data = data.error ? data : { error: 'http_' + resp.status };
    throw e;
  }
  return data;
}

// Domain groups — each maps to a Worker HANDLERS action (api/src/index.js).
// Param shapes are pinned when each action is implemented against D1.
export const queue = {
  list:    (p) => call('list_queue', p),     // -> { items }
  approve: (p) => call('approve_item', p),   // { id }
  discard: (p) => call('discard_item', p),   // { id }
};

export const publish = {
  create:    (p) => call('create_post', p),    // { media_type, caption, media, schedule? }
  scheduled: (p) => call('list_scheduled', p), // -> { posts }
};

export const comments = {
  list:  (p) => call('list_comments', p),   // -> { comments }
  reply: (p) => call('reply_comment', p),   // { comment_id, text }
};

export const connection = {
  status: (p) => call('connection_status', p), // -> { account }
  begin:  (p) => call('begin_connect', p),     // -> { url } (Instagram OAuth start)
};

export const settings = {
  get:  (p) => call('get_settings', p),   // -> { settings }
  save: (p) => call('save_settings', p),  // { settings }
};
