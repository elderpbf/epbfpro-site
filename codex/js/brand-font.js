// codex/js/brand-font.js
// A fonte da marca (Comfortaa) em subset, para viajar DENTRO do SVG do logo.
//
// Por que isto existe: no artwork da PensoIA o "P" e vetor, mas o wordmark "ensoIA"
// e um elemento <text> em Comfortaa. Sem a fonte o navegador cai numa sans generica e
// a marca sai errada em qualquer aparelho que nao a tenha instalada (celulares). Em
// contexto isolado -- SVG carregado como imagem, arquivo aberto offline -- nao ha
// webfont da pagina para socorrer, entao a fonte tem que estar no proprio SVG.
//
// Subset de 6 glifos (e n s o I A), ~760 B por peso, gerado dos masters canonicos
// PensoIA/Brand/Logo/source/Comfortaa/static/Comfortaa-{Regular,Bold}.ttf. Receita de
// como regerar: manifest/architecture/interativos.md, passo 3 da receita.
//
// NAO use esta familia para texto corrido: so existem aqueles 6 glifos. (Nas paginas do
// Codex isso e inofensivo -- o theme.css carrega a Comfortaa completa do Google Fonts, e
// o navegador compoe as duas faces da mesma familia.)
//
// ATENCAO ao editar: este CSS entra no <style> de um SVG. Carregado como imagem o SVG e
// lido como XML, onde "<" e "&" soltos sao erro de parse e derrubam o arquivo INTEIRO.
// Nada de sinal de menor-que nem E-comercial aqui dentro.

const W400 = 'd09GMgABAAAAAAL4AAsAAAAABMwAAAKsAAMa4QAAAAAAAAAAAAAAAAAAAAAAAAAABmAAVBEICoUEhCIBNgIkAxwLEAAEIAUGByAbmQMgLgpsNxctFFID53Sw+Tk+ZtCaObt7IXwgJJcUQT6xKrAkuvtaIGFamw5UXMzV/wDAFpvTNjpbT1p67ju66dFptjCyKPFE9gZeVHphIM8JBlTggxNZHDCn22SiRI8ZUss62gCOrpBLEAHUQKsB5Pkc0ohQkg2XEhxKqynNwHOkYIyNmBZEIpJPY6kbUw2dwQBQQARzMBCaQ/I+JaSg4JCCHHRgCGMmYYEa/MwtIvIUl9CRBgCBBAFqgAztW4BYgAfAYYCCgICm17fg1H42aq02XGE4suu7qzDa9Nw+kBu2LHsV3dc2qqpUFQrDHhGt7CuMu+CWd1oMgkA4O1PE81jekSuJKnpdEOR++YJlnld05ndz2+L6bfP7XzTuEbayXcrXjznUfOWeXlSEJhXL7KTSqAShqkpBiTfuWt3ctNi9oXJaESrPoIDrt8yvbVnu8U/E8uHLDJ5/geUvX2KsIkY8HuzZ2e55Plxts1D61envOJnfyfOLeOCQemPuwair0D0zo78AJVzJfGbmQklp6vxEVkH+cHrCTKE2VLubfHok86srDouOqYgIbExICG+oi4h3z7Yu3Tm5+VqxosMdQboKLZcYWFTsFRZS6BGQ4hvlmNTaE52SNRSbPFLKaSue6tN1AhK9bnYEOFjtFi9kZS0Ul0BJmeLi+SwHmmQvtKWijNi6iLCG+PiwRnFjB4Q3apf+BKy5uDGvqP2EV3++M1foEJybEsrc0wILlO2ahqKosIi0GpfItOYAgbiv/tw/l2LrF5Xi72q18rI7V1EZWOgRFJnZ7AUAWAQBwGy/de//epMm/p+Usb8BELyPbQDg99ruJ6hN03tMBUAMCgAgwLdO6DMCQDoBgmgldAReWCWWaKedSKCbqB1K2tohDoREILzgWPBiMMiZKBQAAA==';
const W700 = 'd09GMgABAAAAAAL4AAsAAAAABMwAAAKtAAMa4QAAAAAAAAAAAAAAAAAAAAAAAAAABmAAVBEICoUEhB0BNgIkAxwLEAAEIAUGByAblAMojsK2nTNOSMr5AmMEKR6+vzfPvVtKoQa0C9QwFEwny3y2ZDzRAEb0HeVV1QsN3FmITM5AcPALegn/78yjr3GaJRYlntCnahvwXpzoQEY8oOOm2Uk6C9h26DYPsSeQPWPBEo++GtSTVDoFDYpnA3ioEu/gGtFQath0f0qNgHVw1VZr+Y9Bo4HizeU8KguAHWUkSDCnLJpUXIC+thTDVzEqNGkr/1GkMVr5LsfLmrKkLBTPuGhcGCG0wBAd/IIYAxh1XooEeQexUBHa6QjFYnceuUevbi2PMqhZvkuL3IELefmLNmVlCTJ45A6kOrKTR22HerWthGRZNMJxPIphoNqmxUcC7w0sq0XSNFQMw6M4q6VHFZtXmx+jG8gdCI0Y+TnoNjEd/5wpz0rT03QmJUpoZKO1GrhkrdXWw4rtDI+6q7fyTubdvMPiVfJFR/COG1rkNai2X49YyfmhZ4nQf3lCe80bU/MLOut23jIQrSv8XqX/u6ppr+VOq4xpqwxYhp/jzcQzTNwiNuPb8FxLG46M7k9JDe/viUxKbAr37U6SLZMvTJ5HIYvECAdXn2QXm0wvL5eMLBcfo2Ac+N74hlDG1y03ASv4B3/zsYmKNHW0DTPptggK8i+t8QmNqPcNbEn7hm/tjwtniJuYOEmcwafgsZbSFxnZn5Ia2d8XmZIsaGpKRF1yjnuSk32al5d9Ojl3AQ7p4JD2A2Bci+y0hS/R/KDyFxlr7Oh7WSDYmSAol+Um+br5hRYYu4VW2NAvpb9/Hf00Nd/S/raB1L4zN1aY6ZBv7egcU2gHgE8Ite3rTR/g9CHy/6qhrPwW/qz36gDwP7b9AfTKnzyqLIDQlCD46hj5BT3tPAoBoZUtYOEshDOUZwME5g54zo0UjMAd8pDMZBFYU42urHIGAA==';

/** CSS das duas faces, pronto para ir dentro de um <style> (de SVG ou de pagina). */
export const BRAND_FONT_CSS =
  "@font-face{font-family:'Comfortaa';font-style:normal;font-weight:400;" +
  "src:url(data:font/woff2;base64," + W400 + ") format('woff2')}" +
  "@font-face{font-family:'Comfortaa';font-style:normal;font-weight:700;" +
  "src:url(data:font/woff2;base64," + W700 + ") format('woff2')}";
