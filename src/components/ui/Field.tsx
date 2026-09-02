import {
  forwardRef,
  type InputHTMLAttributes,
  type LabelHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from "react";

export function Label({ className = "", ...props }: LabelHTMLAttributes<HTMLLabelElement>) {
  return (
    <label
      className={`block text-xs font-semibold uppercase tracking-wide text-ink/50 mb-1.5 ${className}`}
      {...props}
    />
  );
}

const inputBase =
  "w-full rounded-xl border border-plum/25 bg-white/60 px-3.5 py-2.5 text-sm text-ink placeholder:text-ink/35 focus:border-rose/60 focus:bg-white transition-colors";

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
  ({ className = "", ...props }, ref) => (
    <input ref={ref} className={`${inputBase} ${className}`} {...props} />
  ),
);
Input.displayName = "Input";

export const Textarea = forwardRef<
  HTMLTextAreaElement,
  TextareaHTMLAttributes<HTMLTextAreaElement>
>(({ className = "", ...props }, ref) => (
  <textarea ref={ref} className={`${inputBase} resize-none ${className}`} {...props} />
));
Textarea.displayName = "Textarea";

export const Select = forwardRef<
  HTMLSelectElement,
  SelectHTMLAttributes<HTMLSelectElement> & { children: ReactNode }
>(({ className = "", children, ...props }, ref) => (
  <select ref={ref} className={`${inputBase} cursor-pointer ${className}`} {...props}>
    {children}
  </select>
));
Select.displayName = "Select";
