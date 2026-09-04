import { render } from 'preact';
import { registerSW } from 'virtual:pwa-register';
import { App } from './app/App';
import './styles/tokens.css';
import './styles/base.css';
import './styles/app.css';

registerSW({ immediate: true });
render(<App />, document.getElementById('app')!);
