import { useEffect, useState } from 'react';

interface InstallEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}
export function useInstallPrompt() {
  const [prompt, setPrompt] = useState<InstallEvent | null>(null);
  const [installed, setInstalled] = useState(() => matchMedia('(display-mode: standalone)').matches);
  useEffect(() => {
    function handleInstallPrompt(event: Event) {
      event.preventDefault();
      setPrompt(event as InstallEvent);
    }
    function handleInstalled() {
      setInstalled(true);
      setPrompt(null);
    }
    const display = matchMedia('(display-mode: standalone)');
    const displayChanged = () => setInstalled(display.matches);
    addEventListener('beforeinstallprompt', handleInstallPrompt);
    addEventListener('appinstalled', handleInstalled);
    display.addEventListener('change', displayChanged);
    return () => {
      removeEventListener('beforeinstallprompt', handleInstallPrompt);
      removeEventListener('appinstalled', handleInstalled);
      display.removeEventListener('change', displayChanged);
    };
  }, []);
  const install = async () => {
    if (!prompt) return;
    // The browser's prompt event is single-use, even if the user dismisses it.
    const current = prompt;
    setPrompt(null);
    await current.prompt();
    await current.userChoice;
  };
  return { installed, canInstall: !!prompt, install };
}
