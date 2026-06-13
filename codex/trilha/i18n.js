// codex/trilha/i18n.js
// Trail-scoped i18n. The public student face is its own bounded context, so it
// keeps its own dictionaries (not the admin app's). Same t() shape as
// codex/js/i18n.js. PT-BR active; EN kept in parity per the module contract.
const pt = {
  'cert.checking':          'Verificando certificado...',
  'cert.entry_title':       'Validar certificado',
  'cert.entry_desc':        'Digite o código impresso no seu certificado para confirmar a autenticidade.',
  'cert.entry_placeholder': 'Ex.: ABC123XYZ4',
  'cert.verify':            'Verificar',
  'cert.not_found':         'Certificado não encontrado. Verifique o código e tente novamente.',
  'cert.net_error':         'Não foi possível verificar o certificado. Verifique sua conexão e tente novamente.',
  'cert.try_again':         'Tentar outro código',
  'cert.valid':             'Certificado válido',
  'cert.revoked':           'Certificado revogado',
  'cert.f_holder':          'Participante',
  'cert.f_course':          'Curso',
  'cert.f_hours':           'Carga horária',
  'cert.f_issued':          'Data de emissão',
  'cert.f_issuer':          'Emissor',
  'cert.download_pdf':      'Baixar certificado em PDF',
  'cert.footer':            'Este documento foi emitido pela plataforma PensoIA.',
};
const en = {
  'cert.checking':          'Verifying certificate...',
  'cert.entry_title':       'Validate certificate',
  'cert.entry_desc':        'Enter the code printed on your certificate to confirm its authenticity.',
  'cert.entry_placeholder': 'e.g. ABC123XYZ4',
  'cert.verify':            'Verify',
  'cert.not_found':         'Certificate not found. Check the code and try again.',
  'cert.net_error':         'Could not verify the certificate. Check your connection and try again.',
  'cert.try_again':         'Try another code',
  'cert.valid':             'Valid certificate',
  'cert.revoked':           'Revoked certificate',
  'cert.f_holder':          'Participant',
  'cert.f_course':          'Course',
  'cert.f_hours':           'Workload',
  'cert.f_issued':          'Issue date',
  'cert.f_issuer':          'Issuer',
  'cert.download_pdf':      'Download certificate PDF',
  'cert.footer':            'This document was issued by the PensoIA platform.',
};

const DICTS = { 'pt-BR': pt, en };
let active = 'pt-BR';

export function t(key) { const d = DICTS[active] || {}; return key in d ? d[key] : key; }
export function setLang(l) { if (DICTS[l]) active = l; }
export function languages() { return Object.keys(DICTS); }
