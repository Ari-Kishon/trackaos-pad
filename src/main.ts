const root = document.querySelector('#app');
if (!(root instanceof HTMLElement)) {
  throw new Error('Missing #app');
}

root.replaceChildren();

const title = document.createElement('h1');
title.textContent = 'Vite + TypeScript';

const blurb = document.createElement('p');
blurb.textContent = 'Replace this stub and ship.';

root.append(title, blurb);
