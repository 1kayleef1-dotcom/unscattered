import type { LucideIcon } from "lucide-react";

export function EmptyState({
  icon: Icon,
  title,
  message,
  action,
}: {
  icon: LucideIcon;
  title: string;
  message: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center text-center py-14 px-6 rounded-2xl border border-dashed border-plum/25 bg-white/30">
      <div className="mb-4 rounded-full bg-lavender/25 p-3 text-eggplant">
        <Icon size={22} />
      </div>
      <h3 className="font-display text-xl text-eggplant mb-1.5">{title}</h3>
      <p className="text-sm text-ink/60 max-w-sm mb-4">{message}</p>
      {action}
    </div>
  );
}
