'use strict';

var WORKER_URL = 'https://backstage-api.pensoia.workers.dev';

// Maximum URL length before we switch to POST. Cloudflare's hard limit is
// ~16KB; browsers and intermediaries can be tighter. 6KB leaves headroom.
var CALLWORKER_URL_BUDGET = 6000;

async function callWorker(params) {
  var action = params.action || '?';
  if (!params.auth_token) {
    params.auth_token = localStorage.getItem('bs_pw_hash') || '';
  }

  // Build request headers. If Google-authed, send Bearer token as primary.
  // Worker checks Bearer first, falls back to auth_token param if absent/invalid.
  var reqHeaders = {};
  var googleToken = (window.BS_GOOGLE && window.BS_GOOGLE.isAuthed())
    ? window.BS_GOOGLE.getAccessToken()
    : null;
  if (googleToken) {
    reqHeaders['Authorization'] = 'Bearer ' + googleToken;
  }

  var bodyJson = JSON.stringify(params);
  var payload  = encodeURIComponent(bodyJson);
  var getUrl   = WORKER_URL + '?payload=' + payload;
  var usePost  = getUrl.length > CALLWORKER_URL_BUDGET;

  if (typeof dbg !== 'undefined') dbg('info', '→ ' + action + (usePost ? ' [POST ' + bodyJson.length + 'B]' : ''));

  // ── fetch (network errors caught + logged so the debug pill always sees them) ──
  var resp;
  try {
    if (usePost) {
      reqHeaders['Content-Type'] = 'application/json';
      resp = await fetch(WORKER_URL, {
        method:   'POST',
        headers:  reqHeaders,
        body:     bodyJson,
        redirect: 'follow'
      });
    } else {
      resp = await fetch(getUrl, { headers: reqHeaders, redirect: 'follow' });
    }
  } catch (netErr) {
    var netMsg = (netErr && netErr.message) ? netErr.message : String(netErr);
    if (typeof bsLog !== 'undefined') bsLog('callWorker network error | action: ' + action + ' | ' + netMsg, 'error');
    if (typeof dbg !== 'undefined')   dbg('error', '← ' + action + ' NETWORK FAIL: ' + netMsg);
    var thrownNet = new Error('Network: ' + netMsg);
    thrownNet.data = { error: 'network_error', detail: netMsg };
    throw thrownNet;
  }

  if (!resp.ok) {
    if (typeof bsLog !== 'undefined') bsLog('callWorker HTTP ' + resp.status + ' | action: ' + action, 'error');
    if (typeof dbg !== 'undefined')   dbg('error', '← ' + action + ' FAIL: HTTP ' + resp.status);
    var httpErr = new Error('HTTP ' + resp.status);
    httpErr.data = { error: 'http_' + resp.status };
    throw httpErr;
  }

  var txt;
  try {
    txt = await resp.text();
  } catch (readErr) {
    var readMsg = (readErr && readErr.message) ? readErr.message : String(readErr);
    if (typeof bsLog !== 'undefined') bsLog('callWorker body read error | action: ' + action + ' | ' + readMsg, 'error');
    if (typeof dbg !== 'undefined')   dbg('error', '← ' + action + ' READ FAIL: ' + readMsg);
    var readThrown = new Error('Body read: ' + readMsg);
    readThrown.data = { error: 'body_read_error', detail: readMsg };
    throw readThrown;
  }

  if (typeof dbg !== 'undefined') dbg('poll', '← ' + resp.status + ' (' + txt.length + ' bytes)');

  if (txt.startsWith('<')) {
    if (typeof bsLog !== 'undefined') bsLog('callWorker error | action: ' + action + ' | server returned HTML', 'error');
    if (typeof dbg !== 'undefined')   dbg('error', '← ' + action + ': got HTML, check deployment permissions');
    var errHtml = new Error('server returned HTML');
    errHtml.data = { error: 'server_returned_html' };
    throw errHtml;
  }

  var data;
  try {
    data = JSON.parse(txt);
  } catch (parseErr) {
    var parseMsg = (parseErr && parseErr.message) ? parseErr.message : String(parseErr);
    if (typeof bsLog !== 'undefined') bsLog('callWorker JSON parse error | action: ' + action + ' | ' + parseMsg, 'error');
    if (typeof dbg !== 'undefined')   dbg('error', '← ' + action + ' PARSE FAIL: ' + parseMsg);
    var parseThrown = new Error('JSON parse: ' + parseMsg);
    parseThrown.data = { error: 'json_parse_error', detail: parseMsg };
    throw parseThrown;
  }

  if (data.error) {
    if (!params._silent) {
      if (typeof bsLog !== 'undefined') bsLog('callWorker error | action: ' + action + ' | ' + data.error + (data.hint ? ' | hint: ' + data.hint : ''), 'error');
      if (typeof dbg !== 'undefined')   dbg('error', '← ' + action + ': ' + data.error);
    }
    var errJson = new Error(data.error);
    errJson.data = data;
    throw errJson;
  }

  if (typeof dbg !== 'undefined') dbg('ok', '← ' + action + ': ok');

  return data;
}
