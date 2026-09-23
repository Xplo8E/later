import { useEffect, useState } from 'react';

interface InstallEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}
export function useInstallPrompt() {
  const [prompt, setPrompt] = useState<InstallEvent | null>(null);
  const [installed, setInstalled] = useState(() => matchMedia('(display-mode: standalone)').matches);
  useEffect(() => {
    const ready = (event: Event) => { event.preventDefault(); setPrompt(event as InstallEvent); };
    const done = () => { setInstalled(true); setPrompt(null); };
    const display = matchMedia('(display-mode: standalone)');
    const displayChanged = () => setInstalled(display.matches);
    addEventListener('beforeinstallprompt', ready); addEventListener('appinstalled', done); display.addEventListener('change', displayChanged);
    return () => { removeEventListener('beforeinstallprompt', ready); removeEventListener('appinstalled', done); display.removeEventListener('change', displayChanged); };
  }, []);
  const install = async () => {
    if (!prompt) return;
    const current = prompt; setPrompt(null);
    await current.prompt();
    await current.userChoice;
  };
  return { installed, canInstall: !!prompt, install };
}
