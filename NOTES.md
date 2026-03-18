# PensoIA Site — Notes

## Brand Switcher

To switch the site identity between PensoIA and EPBF, change one line in `js/brand.js`:

```js
const ACTIVE_BRAND = 'pensoia'; // or 'epbf'
```

What changes:
- Tab title and meta tags (description, og:title, twitter:title)
- Logo alt text
- About section text ("A {brand} consolida...")
- Contact section text and email link
  - pensoia: contato@pensoia.com
  - epbf: contato@epbf.com.br

What never changes:
- Footer always shows both: `PensoIA / EPBF`
