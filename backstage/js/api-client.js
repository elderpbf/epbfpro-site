'use strict';

var WORKER_URL = 'https://backstage-api.pensoia.workers.dev';

async function callWorker(params) {
  var action = params.action || '?';
  var payload = encodeURIComponent(JSON.stringify(params));
  
  if (typeof dbg !== 'undefined') dbg('info', '→ ' + action);

  var resp = await fetch(WORKER_URL + '?payload=' + payload, { redirect: 'follow' });
  
  if (!resp.ok) {
    if (typeof bsLog !== 'undefined') bsLog('callWorker HTTP ' + resp.status + ' | action: ' + action, 'error');
    if (typeof dbg !== 'undefined') dbg('error', '← ' + action + ' FAIL: HTTP ' + resp.status);
    throw new Error('HTTP ' + resp.status);
  }

  var txt = await resp.text();
  if (typeof dbg !== 'undefined') dbg('poll', '← ' + resp.status + ' (' + txt.length + ' bytes)');

  if (txt.startsWith('<')) {
    if (typeof bsLog !== 'undefined') bsLog('callWorker error | action: ' + action + ' | server returned HTML', 'error');
    if (typeof dbg !== 'undefined') dbg('error', '← ' + action + ': got HTML — check deployment permissions');
    var errHtml = new Error('server returned HTML');
    errHtml.data = { error: 'server returned HTML' };
    throw errHtml;
  }

  var data = JSON.parse(txt);

  if (data.error) {
    if (typeof bsLog !== 'undefined') bsLog('callWorker error | action: ' + action + ' | ' + data.error, 'error');
    if (typeof dbg !== 'undefined') dbg('error', '← ' + action + ': ' + data.error);
    var errJson = new Error(data.error);
    errJson.data = data;
    throw errJson;
  }
  
  if (typeof dbg !== 'undefined') dbg('ok', '← ' + action + ': ok');
  
  return data;
}
