import { useState } from 'react';
import { Eye, EyeOff } from 'lucide-react';

export default function PasswordInput({ leadingIcon, className = '', ...inputProps }) {
  const [visible, setVisible] = useState(false);

  return (
    <div className="relative">
      {leadingIcon && (
        <span className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3 text-slate-400">
          {leadingIcon}
        </span>
      )}
      <input
        {...inputProps}
        type={visible ? 'text' : 'password'}
        className={className}
      />
      <button
        type="button"
        onClick={() => setVisible((current) => !current)}
        aria-label={visible ? 'Hide password' : 'Show password'}
        title={visible ? 'Hide password' : 'Show password'}
        className="absolute inset-y-0 right-0 flex items-center px-3 text-slate-400 hover:text-slate-200"
      >
        {visible ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
      </button>
    </div>
  );
}
