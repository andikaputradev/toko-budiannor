import '../../styles/portal.css';
import { renderGaya } from './gaya';
import { renderHome } from './home';
import { renderViewer } from './viewer';

export function mount(root: HTMLElement, fullPath: string): () => void {
  const [path = '/', search = ''] = fullPath.split('?');
  const html = document.documentElement;
  html.dataset['app'] = 'portal';
  if (path === '/gaya') {
    delete html.dataset['view'];
    renderGaya(root);
    return () => undefined;
  }
  if (path === '/tinjau') {
    html.dataset['view'] = 'tinjau';
    return renderViewer(root, new URLSearchParams(search));
  }
  html.dataset['view'] = 'portal';
  return renderHome(root);
}
