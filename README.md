# PensoIA Website

Professional website for PensoIA - AI and Prompt Engineering consultancy for legal professionals.

## Features

- ✅ Fully responsive design
- ✅ Green-turquoise color scheme
- ✅ PT-BR default with EN toggle
- ✅ Language preference saved in browser
- ✅ Smooth animations
- ✅ Clean, professional layout
- ✅ SEO-friendly structure

## Project Structure

```
pensoia-site/
├── index.html          # Main page
├── css/
│   └── style.css      # All styles (green-turquoise theme)
├── js/
│   ├── translations.js # PT-BR and EN translations
│   └── main.js        # Language toggle + animations
└── images/
    ├── logo.png       # PensoIA logo
    └── profile.jpg    # Professional photo
```

## How to Upload to Hostinger

1. **Login to Hostinger**
   - Go to your Hostinger panel
   - Navigate to File Manager

2. **Upload Files**
   - Upload all files maintaining the folder structure:
     - `index.html` → root directory (public_html)
     - `css/` folder → root directory
     - `js/` folder → root directory
     - `images/` folder → root directory

3. **Alternative: FTP Upload**
   - Use FileZilla or any FTP client
   - Connect to your Hostinger FTP
   - Upload all files/folders

## How to Customize

### Change Contact Email
Edit `index.html` line 90:
```html
<a href="mailto:YOUR-EMAIL@pensoia.com.br">
```

And update translations in `js/translations.js` (lines 24 and 50).

### Change Colors
Edit `css/style.css` (lines 9-18) to modify the color palette:
```css
--primary: #14b8a6;        /* Main turquoise */
--primary-dark: #0d9488;   /* Darker turquoise */
--primary-light: #5eead4;  /* Light turquoise */
--secondary: #047857;      /* Dark green */
--accent: #99f6e4;         /* Light accent */
```

### Update Content
Edit `js/translations.js` to change any text on the site in both PT-BR and EN.

## Testing Locally

1. Open `index.html` in any browser
2. Click the language toggle (🌐 EN/PT) to test translations
3. Test on mobile by resizing browser window

## Browser Support

- Chrome/Edge (latest)
- Firefox (latest)
- Safari (latest)
- Mobile browsers (iOS Safari, Chrome Mobile)

## License

© 2024 PensoIA. All rights reserved.

---
**Live Site:** https://pensoia.com
**Last Updated:** 2026-02-05
