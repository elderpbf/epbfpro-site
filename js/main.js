// Theme Manager - MVC Controller for dark/light mode
class ThemeManager {
    constructor() {
        this.currentTheme = localStorage.getItem('theme') || 'light';
        this.init();
    }

    init() {
        this.setTheme(this.currentTheme);
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
        document.documentElement.setAttribute('data-theme', theme);
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
        this.setLanguage(this.currentLang);
        const toggleBtn = document.getElementById('langToggle');
        if (toggleBtn) {
            toggleBtn.addEventListener('click', () => this.toggleLanguage());
        }
        document.documentElement.lang = this.currentLang;
    }

    toggleLanguage() {
        this.currentLang = this.currentLang === 'pt-BR' ? 'en' : 'pt-BR';
        this.setLanguage(this.currentLang);
        localStorage.setItem('language', this.currentLang);
    }

    setLanguage(lang) {
        const elements = document.querySelectorAll('[data-key]');
        elements.forEach(element => {
            const key = element.getAttribute('data-key');
            if (translations[lang] && translations[lang][key]) {
                element.textContent = translations[lang][key];
            }
        });

        const langText = document.getElementById('langText');
        if (langText) {
            langText.textContent = lang === 'pt-BR' ? 'EN' : 'PT';
        }

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

    // H. Back-to-top button
    const backToTop = document.getElementById('backToTop');
    if (backToTop) {
        window.addEventListener('scroll', () => {
            if (window.scrollY > 400) {
                backToTop.classList.add('visible');
            } else {
                backToTop.classList.remove('visible');
            }
        });
        backToTop.addEventListener('click', () => {
            window.scrollTo({ top: 0, behavior: 'smooth' });
        });
    }

    // D. Animated section title underlines + section fade-in
    const observerOptions = {
        threshold: 0.1,
        rootMargin: '0px 0px -50px 0px'
    };

    const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                entry.target.style.opacity = '1';
                entry.target.style.transform = 'translateY(0)';
                // Animate section title underline
                const title = entry.target.querySelector('.section-title');
                if (title) {
                    title.classList.add('animate-in');
                }
            }
        });
    }, observerOptions);

    const sections = document.querySelectorAll('.about, .services, .contact');
    sections.forEach(section => {
        section.style.opacity = '0';
        section.style.transform = 'translateY(20px)';
        section.style.transition = 'opacity 0.6s ease, transform 0.6s ease';
        observer.observe(section);
    });
});
