import { mountApp } from './ui/app';

const root = document.querySelector('#app');
if (!(root instanceof HTMLElement)) {
  throw new Error('Missing #app');
}

mountApp(root);
