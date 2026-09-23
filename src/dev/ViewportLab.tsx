import { useState } from 'react';

// Local browser review only. The production entry removes this dynamic import.
export default function ViewportLab() {
  const [width, setWidth] = useState(390);
  const [height, setHeight] = useState(740);
  const [route, setRoute] = useState('/app/inbox');
  return <main style={{ padding: 20 }}>
    <h1 style={{ fontSize: 20 }}>Responsive review</h1>
    <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap', alignItems: 'center', margin: '16px 0' }}>
      <label>Viewport width <input aria-label="Viewport width" type="number" min="280" max="1920" value={width} onChange={event => setWidth(Math.min(1920, Math.max(280, Number(event.target.value) || 280)))} style={{ width: 90 }} /></label>
      <label>Viewport height <input aria-label="Viewport height" type="number" min="320" max="1200" value={height} onChange={event => setHeight(Math.min(1200, Math.max(320, Number(event.target.value) || 320)))} style={{ width: 90 }} /></label>
      <label>Screen <select aria-label="Review screen" value={route} onChange={event => setRoute(event.target.value)}>
        {['/', '/app/inbox', '/app/library', '/app/finished', '/app/rediscover', '/app/search', '/app/settings'].map(path => <option value={path} key={path}>{path === '/' ? 'Login' : path.split('/').at(-1)}</option>)}
      </select></label>
      <a href="/app/inbox">Return to Later</a>
    </div>
    <iframe title="Responsive Later" src={route} style={{ display: 'block', width, height, border: '1px solid #747d7d', boxSizing: 'content-box' }} />
  </main>;
}
