// ─── BRAND CONFIGURATION ──────────────────────────────────────────────────────
// Change ACTIVE_BRAND to switch the entire site between identities.
// 'pensoia' → PensoIA  (contato@pensoia.com)
// 'epbf'    → EPBF     (contato@epbf.com.br)

const ACTIVE_BRAND = 'pensoia';

// ──────────────────────────────────────────────────────────────────────────────

const BRANDS = {
    pensoia: {
        name: 'PensoIA',
        email: 'contato@pensoia.com',
        pageTitle: 'PensoIA - Inteligência Artificial para o Direito | Engenharia de Prompts',
        metaTitle: 'PensoIA - Inteligência Artificial para o Direito',
        metaDesc: 'Élder Prudente Barbosa Filho - Sou instrutor em IA Generativa e Engenharia de Prompts para profissionais do Direito e demais áreas do conhecimento | PensoIA',
    },
    epbf: {
        name: 'EPBF',
        email: 'contato@epbf.com.br',
        pageTitle: 'EPBF - Inteligência Artificial para o Direito | Engenharia de Prompts',
        metaTitle: 'EPBF - Inteligência Artificial para o Direito',
        metaDesc: 'Élder Prudente Barbosa Filho - Sou instrutor em IA Generativa e Engenharia de Prompts para profissionais do Direito e demais áreas do conhecimento | EPBF',
    }
};

const BRAND = BRANDS[ACTIVE_BRAND];

// Replace {brand} tokens in translations before LanguageManager reads them
(function patchTranslations() {
    if (typeof translations === 'undefined') return;
    Object.keys(translations).forEach(lang => {
        Object.keys(translations[lang]).forEach(key => {
            if (typeof translations[lang][key] === 'string') {
                translations[lang][key] = translations[lang][key].replace(/\{brand\}/g, BRAND.name);
            }
        });
    });
})();

// Apply brand to DOM
document.addEventListener('DOMContentLoaded', () => {
    // Tab title
    document.title = BRAND.pageTitle;

    // Meta tags
    const setMeta = (selector, attr, value) => {
        const el = document.querySelector(selector);
        if (el) el.setAttribute(attr, value);
    };
    setMeta('meta[name="description"]', 'content', BRAND.metaDesc);
    setMeta('meta[property="og:title"]', 'content', BRAND.metaTitle);
    setMeta('meta[name="twitter:title"]', 'content', BRAND.metaTitle);

    // Logo alt
    const logo = document.querySelector('.logo-img');
    if (logo) logo.alt = BRAND.name + ' Logo';

    // Email link
    const emailLink = document.querySelector('[data-brand-email]');
    if (emailLink) {
        emailLink.href = 'mailto:' + BRAND.email;
        const emailText = emailLink.querySelector('[data-brand-email-text]');
        if (emailText) emailText.textContent = BRAND.email;
    }
});
