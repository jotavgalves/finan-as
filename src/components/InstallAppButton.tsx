import { useEffect, useState } from 'preact/hooks';

type InstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
};

export function InstallAppButton() {
  const [promptEvent,setPromptEvent]=useState<InstallPromptEvent|null>(null);
  const [installed,setInstalled]=useState(false);
  useEffect(()=>{
    const standalone=window.matchMedia('(display-mode: standalone)').matches;
    if(standalone)setInstalled(true);
    const before=(event:Event)=>{event.preventDefault();setPromptEvent(event as InstallPromptEvent)};
    const done=()=>{setInstalled(true);setPromptEvent(null)};
    window.addEventListener('beforeinstallprompt',before);
    window.addEventListener('appinstalled',done);
    return()=>{window.removeEventListener('beforeinstallprompt',before);window.removeEventListener('appinstalled',done)};
  },[]);
  if(installed||!promptEvent)return null;
  async function install(){if(!promptEvent)return;await promptEvent.prompt();const result=await promptEvent.userChoice;if(result.outcome==='accepted')setInstalled(true);setPromptEvent(null)}
  return <button class="btn primary" onClick={install}>Instalar app no Android</button>;
}
