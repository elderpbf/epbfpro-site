// Theme Manager - MVC Controller for dark/light mode
class ThemeManager {
    constructor() {
        this.currentTheme = localStorage.getItem('theme') || 'light';
        this.init();
    }

    init() {
        // Set initial theme
        this.setTheme(this.currentTheme);

        // Add event listener to toggle button
        const toggleBtn = document.getElementById('themeToggle');
        if (toggleBtn) {
            toggleBtn.addEventListener('click', () => this.toggleTheme());
        }
    }

    toggleTheme() {
        this.currentTheme = this.currentTheme === 'light' ? 'dark' : 'light';
        this.setTheme(this.currentTheme);
        localStorage.setItem('theme', this.currentTheme);
    }

    setTheme(theme) {
        // Update data-theme attribute on document
        document.documentElement.setAttribute('data-theme', theme);

        // Update theme icon
        const themeIcon = document.getElementById('themeIcon');
        if (themeIcon) {
            if (theme === 'dark') {
                themeIcon.src = 'images/icons/sun.png';
                themeIcon.alt = 'Light mode';
            } else {
                themeIcon.src = 'images/icons/moon.png';
                themeIcon.alt = 'Dark mode';
            }
        }
    }
}

// Language Manager - MVC Controller for translations
class LanguageManager {
    constructor() {
        this.currentLang = localStorage.getItem('language') || 'pt-BR';
        this.init();
    }

    init() {
        // Set initial language
        this.setLanguage(this.currentLang);

        // Add event listener to toggle button
        const toggleBtn = document.getElementById('langToggle');
        if (toggleBtn) {
            toggleBtn.addEventListener('click', () => this.toggleLanguage());
        }

        // Update HTML lang attribute
        document.documentElement.lang = this.currentLang;
    }

    toggleLanguage() {
        this.currentLang = this.currentLang === 'pt-BR' ? 'en' : 'pt-BR';
        this.setLanguage(this.currentLang);
        localStorage.setItem('language', this.currentLang);
    }

    setLanguage(lang) {
        // Update all elements with data-key attribute
        const elements = document.querySelectorAll('[data-key]');
        elements.forEach(element => {
            const key = element.getAttribute('data-key');
            if (translations[lang] && translations[lang][key]) {
                element.textContent = translations[lang][key];
            }
        });

        // Update toggle button text
        const langText = document.getElementById('langText');
        if (langText) {
            langText.textContent = lang === 'pt-BR' ? 'EN' : 'PT';
        }

        // Update HTML lang attribute
        document.documentElement.lang = lang;
    }
}

// Smooth scroll for anchor links
document.querySelectorAll('a[href^="#"]').forEach(anchor => {
    anchor.addEventListener('click', function (e) {
        e.preventDefault();
        const target = document.querySelector(this.getAttribute('href'));
        if (target) {
            target.scrollIntoView({
                behavior: 'smooth',
                block: 'start'
            });
        }
    });
});

// Initialize managers when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    new ThemeManager();
    new LanguageManager();

    // Set current year in footer
    const yearElement = document.getElementById('currentYear');
    if (yearElement) {
        yearElement.textContent = new Date().getFullYear();
    }
});

// Add scroll animation for sections
const observerOptions = {
    threshold: 0.1,
    rootMargin: '0px 0px -50px 0px'
};

const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
        if (entry.isIntersecting) {
            entry.target.style.opacity = '1';
            entry.target.style.transform = 'translateY(0)';
        }
    });
}, observerOptions);

// Observe all sections
document.addEventListener('DOMContentLoaded', () => {
    const sections = document.querySelectorAll('.about, .services, .contact');
    sections.forEach(section => {
        section.style.opacity = '0';
        section.style.transform = 'translateY(20px)';
        section.style.transition = 'opacity 0.6s ease, transform 0.6s ease';
        observer.observe(section);
    });
});
