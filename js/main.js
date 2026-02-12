// Theme Manager with circular wipe transition
class ThemeManager {
    constructor() {
        this.currentTheme = localStorage.getItem('theme') || 'light';
        this.overlay = document.getElementById('themeTransition');
        this.toggleBtn = document.getElementById('themeToggle');
        this.init();
    }

    init() {
        this.setTheme(this.currentTheme, false);
        if (this.toggleBtn) {
            // Update aria-pressed attribute
            this.toggleBtn.setAttribute('aria-pressed', this.currentTheme === 'dark');
            this.toggleBtn.addEventListener('click', (e) => this.toggleTheme(e));
        }
    }

    toggleTheme(e) {
        const nextTheme = this.currentTheme === 'light' ? 'dark' : 'light';

        if (this.overlay && e) {
            const rect = e.currentTarget.getBoundingClientRect();
            const x = rect.left + rect.width / 2;
            const y = rect.top + rect.height / 2;

            this.overlay.style.setProperty('--tx', x + 'px');
            this.overlay.style.setProperty('--ty', y + 'px');

            document.documentElement.setAttribute('data-theme', nextTheme);
            const newBg = getComputedStyle(document.documentElement).getPropertyValue('--background').trim();
            this.overlay.style.backgroundColor = newBg;

            document.documentElement.setAttribute('data-theme', this.currentTheme);
            this.overlay.offsetHeight;
            this.overlay.classList.add('active');

            setTimeout(() => {
                this.currentTheme = nextTheme;
                this.setTheme(this.currentTheme, false);
                localStorage.setItem('theme', this.currentTheme);
                this.toggleBtn.setAttribute('aria-pressed', this.currentTheme === 'dark');

                setTimeout(() => {
                    this.overlay.classList.remove('active');
                }, 100);
            }, 500);
        } else {
            this.currentTheme = nextTheme;
            this.setTheme(this.currentTheme, false);
            localStorage.setItem('theme', this.currentTheme);
            if (this.toggleBtn) {
                this.toggleBtn.setAttribute('aria-pressed', this.currentTheme === 'dark');
            }
        }
    }

    setTheme(theme) {
        document.documentElement.setAttribute('data-theme', theme);
        const themeIcon = document.getElementById('themeIcon');
        if (themeIcon) {
            if (theme === 'dark') {
                themeIcon.src = 'images/icons/sun.png';
                themeIcon.alt = '';
            } else {
                themeIcon.src = 'images/icons/moon.png';
                themeIcon.alt = '';
            }
        }
    }
}

// Language Manager
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
        if (window.typewriterInstance) {
            window.typewriterInstance.updateLanguage(this.currentLang);
        }
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

// Typewriter Effect
class TypewriterEffect {
    constructor() {
        this.element = document.getElementById('typewriter');
        if (!this.element) return;

        this.phrases = {
            'pt-BR': [
                'para magistrados',
                'para escritórios de advocacia',
                'para o setor público',
                'para profissionais do Direito'
            ],
            'en': [
                'for magistrates',
                'for law firms',
                'for the public sector',
                'for legal professionals'
            ]
        };

        this.currentLang = localStorage.getItem('language') || 'pt-BR';
        this.phraseIndex = 0;
        this.charIndex = 0;
        this.isDeleting = false;

        this.typeSpeed = 60;
        this.deleteSpeed = 35;
        this.pauseTime = 2000;

        this.tick();
    }

    updateLanguage(lang) {
        this.currentLang = lang;
        this.phraseIndex = 0;
        this.charIndex = 0;
        this.isDeleting = true;
        this.element.textContent = '';
    }

    tick() {
        const phrases = this.phrases[this.currentLang] || this.phrases['pt-BR'];
        const currentPhrase = phrases[this.phraseIndex];

        if (this.isDeleting) {
            this.charIndex--;
            this.element.textContent = currentPhrase.substring(0, this.charIndex);

            if (this.charIndex === 0) {
                this.isDeleting = false;
                this.phraseIndex = (this.phraseIndex + 1) % phrases.length;
                setTimeout(() => this.tick(), 300);
                return;
            }

            setTimeout(() => this.tick(), this.deleteSpeed);
        } else {
            this.charIndex++;
            this.element.textContent = currentPhrase.substring(0, this.charIndex);

            if (this.charIndex === currentPhrase.length) {
                this.isDeleting = true;
                setTimeout(() => this.tick(), this.pauseTime);
                return;
            }

            setTimeout(() => this.tick(), this.typeSpeed);
        }
    }
}

// Parallax effect on hero image
class ParallaxEffect {
    constructor() {
        this.heroImage = document.getElementById('heroImage');
        if (!this.heroImage) return;

        this.handleScroll = this.handleScroll.bind(this);
        window.addEventListener('scroll', this.handleScroll, { passive: true });
    }

    handleScroll() {
        const scrollY = window.scrollY;
        const heroHeight = this.heroImage.closest('.hero').offsetHeight;

        if (scrollY < heroHeight) {
            const offset = scrollY * 0.15;
            this.heroImage.style.transform = `translateY(${offset}px)`;
        }
    }
}

// Counter animation for social proof
class CounterAnimation {
    constructor() {
        this.observed = false;
        const proofSection = document.querySelector('.social-proof');
        if (!proofSection) return;

        const observer = new IntersectionObserver((entries) => {
            entries.forEach(entry => {
                if (entry.isIntersecting && !this.observed) {
                    this.observed = true;
                    this.animateCounters();
                }
            });
        }, { threshold: 0.5 });

        observer.observe(proofSection);
    }

    animateCounters() {
        const counters = document.querySelectorAll('.proof-number');
        counters.forEach(counter => {
            const target = parseInt(counter.getAttribute('data-target'));
            const duration = 2000;
            const start = performance.now();

            const animate = (now) => {
                const elapsed = now - start;
                const progress = Math.min(elapsed / duration, 1);
                const eased = 1 - Math.pow(1 - progress, 3);
                counter.textContent = Math.floor(eased * target);

                if (progress < 1) {
                    requestAnimationFrame(animate);
                } else {
                    counter.textContent = target;
                }
            };

            requestAnimationFrame(animate);
        });
    }
}


// FAQ Accordion
class FAQAccordion {
    constructor() {
        this.faqItems = document.querySelectorAll('.faq-item');
        if (!this.faqItems.length) return;

        this.init();
    }

    init() {
        this.faqItems.forEach(item => {
            const question = item.querySelector('.faq-question');
            question.addEventListener('click', () => this.toggle(item));
        });
    }

    toggle(item) {
        const question = item.querySelector('.faq-question');
        const isExpanded = question.getAttribute('aria-expanded') === 'true';

        // Close all others
        this.faqItems.forEach(otherItem => {
            if (otherItem !== item) {
                const otherQuestion = otherItem.querySelector('.faq-question');
                otherQuestion.setAttribute('aria-expanded', 'false');
            }
        });

        // Toggle current
        question.setAttribute('aria-expanded', !isExpanded);
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

// Initialize everything when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    new ThemeManager();
    new LanguageManager();
    window.typewriterInstance = new TypewriterEffect();
    new ParallaxEffect();
    new CounterAnimation();
    new FAQAccordion();

    // Set current year
    const yearElement = document.getElementById('currentYear');
    if (yearElement) {
        yearElement.textContent = new Date().getFullYear();
    }

    // Back-to-top button
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

    // Section fade-in + title underline animation
    const observerOptions = {
        threshold: 0.1,
        rootMargin: '0px 0px -50px 0px'
    };

    const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                entry.target.style.opacity = '1';
                entry.target.style.transform = 'translateY(0)';

                const title = entry.target.querySelector('.section-title');
                if (title) {
                    title.classList.add('animate-in');
                }

                // Stagger methodology steps
                const steps = entry.target.querySelectorAll('.method-step');
                steps.forEach((step, i) => {
                    step.style.opacity = '0';
                    step.style.transform = 'translateY(20px)';
                    step.style.transition = `opacity 0.5s ease ${i * 0.2}s, transform 0.5s ease ${i * 0.2}s`;
                    requestAnimationFrame(() => {
                        step.style.opacity = '1';
                        step.style.transform = 'translateY(0)';
                    });
                });

                // FAQ items stagger
                const faqItems = entry.target.querySelectorAll('.faq-item');
                faqItems.forEach((item, i) => {
                    item.style.opacity = '0';
                    item.style.transform = 'translateY(20px)';
                    item.style.transition = `opacity 0.5s ease ${i * 0.1}s, transform 0.5s ease ${i * 0.1}s`;
                    requestAnimationFrame(() => {
                        item.style.opacity = '1';
                        item.style.transform = 'translateY(0)';
                    });
                });
            }
        });
    }, observerOptions);

    const sections = document.querySelectorAll('.about, .services, .contact, .methodology, .faq');
    sections.forEach(section => {
        section.style.opacity = '0';
        section.style.transform = 'translateY(20px)';
        section.style.transition = 'opacity 0.6s ease, transform 0.6s ease';
        observer.observe(section);
    });
});
