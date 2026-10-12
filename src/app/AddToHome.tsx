import { useState } from 'react';
import { installLabel, installSteps, promptInstall, useInstall } from './install';

/**
 * One button for Add to Home Screen. Where the browser offers an install prompt, it opens that. Elsewhere
 * (iPhone Safari) it shows the steps. Nothing is drawn once the app is installed, or on a desktop browser
 * that has no install prompt to give.
 */
export function AddToHome({ className = 'btn btn-small' }: { className?: string }) {
  const install = useInstall();
  const [steps, setSteps] = useState(false);
  if (!install.available) return null;
  return (
    <>
      <button
        className={className}
        aria-expanded={install.canPrompt ? undefined : steps}
        onClick={() => (install.canPrompt ? void promptInstall() : setSteps((s) => !s))}
      >
        {installLabel}
      </button>
      {steps && !install.canPrompt && <p className="install-steps">{installSteps}</p>}
    </>
  );
}
