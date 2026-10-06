// Bundles src/ into two single-file builds:
//   dist/index.html     — a complete page for any static host (Vercel, Netlify, GitHub Pages)
//   dist/artifact.html  — the same app as a claude.ai Artifact fragment (no <html>/<head>/<body>;
//                         the Artifact host wraps it in its own skeleton)
import { build } from 'esbuild';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';

const root = new URL('..', import.meta.url).pathname;
const tpl = readFileSync(root + 'index.html', 'utf8');
const css = readFileSync(root + 'src/styles.css', 'utf8');
const out = await build({ entryPoints: [root + 'src/main.js'], bundle: true, format: 'iife', target: 'es2019', write: false, legalComments: 'none' });
const js = out.outputFiles[0].text.replace(/<\/script/gi, '<\\/script');

const between = (s, a, b) => { const i = s.indexOf(a), j = s.indexOf(b); if (i < 0 || j < 0) throw new Error('marker missing: ' + a); return s.slice(i + a.length, j); };
const full = tpl
  .replace(/<!-- build:css -->[\s\S]*?<!-- \/build:css -->/, () => '<style>\n' + css + '</style>')
  .replace(/<!-- build:js -->[\s\S]*?<!-- \/build:js -->/, () => '<script>\n' + js + '</script>')
  .replace(/<!-- \/?build:markup -->\n?/g, '');

const title = tpl.match(/<title>[\s\S]*?<\/title>/)[0];
const fonts = tpl.match(/<link rel="preconnect"[\s\S]*?display=swap">/)[0];
const markup = between(tpl, '<!-- build:markup -->', '<!-- /build:markup -->');
const artifact = `${title}\n${fonts}\n<style>\n${css}</style>\n${markup}<script>\n${js}</script>\n`;

mkdirSync(root + 'dist', { recursive: true });
writeFileSync(root + 'dist/index.html', full);
writeFileSync(root + 'dist/artifact.html', artifact);
console.log(`built dist/index.html (${(full.length / 1024).toFixed(0)} KB) and dist/artifact.html (${(artifact.length / 1024).toFixed(0)} KB)`);
