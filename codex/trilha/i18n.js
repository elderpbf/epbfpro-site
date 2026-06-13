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
  // Student timeline page
  'page.loading':           'Carregando sua trilha...',
  'page.err_link':          'Link inválido ou expirado. Verifique o endereço com seu professor(a).',
  'page.err_generic':       'Erro ao carregar o conteúdo. Tente novamente em instantes.',
  'page.hero_eyebrow':      'Sua trilha de aprendizado',
  'page.tab_aulas':         'Aulas',
  'page.tab_outros':        'Outros materiais',
  'page.tab_apostila':      'Conteúdo do curso',
  'page.wa_group':          'Grupo no WhatsApp',
  'page.footer':            'Feito com PensoIA',
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
  // Student timeline page
  'page.loading':           'Loading your trail...',
  'page.err_link':          'Invalid or expired link. Check the address with your instructor.',
  'page.err_generic':       'Could not load the content. Try again in a moment.',
  'page.hero_eyebrow':      'Your learning trail',
  'page.tab_aulas':         'Classes',
  'page.tab_outros':        'Other materials',
  'page.tab_apostila':      'Course content',
  'page.wa_group':          'WhatsApp group',
  'page.footer':            'Made with PensoIA',
};

const DICTS = { 'pt-BR': pt, en };
let active = 'pt-BR';

export function t(key) { const d = DICTS[active] || {}; return key in d ? d[key] : key; }
export function setLang(l) { if (DICTS[l]) active = l; }
export function languages() { return Object.keys(DICTS); }
