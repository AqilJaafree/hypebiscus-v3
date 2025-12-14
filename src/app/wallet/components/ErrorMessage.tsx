import { InfoIcon } from '@phosphor-icons/react';

interface ErrorMessageProps {
  error: string;
}

export function ErrorMessage({ error }: ErrorMessageProps) {
  if (!error) return null;

  return (
    <div className="bg-primary/10 border border-primary rounded-lg p-4 mb-6">
      <div className="flex items-center space-x-2">
        <InfoIcon className="w-5 h-5 text-primary" />
        <span className="text-primary">{error}</span>
      </div>
    </div>
  );
}
