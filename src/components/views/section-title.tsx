export function SectionTitle({ title, subtitle, right }: { title: string; subtitle?: string; right?: React.ReactNode }) {
  return (
    <div className="flex items-end justify-between gap-3">
      <div>
        <h2 className="text-lg font-bold tracking-tight sm:text-xl">{title}</h2>
        {subtitle && <p className="text-xs text-white/45">{subtitle}</p>}
      </div>
      {right}
    </div>
  );
}

export function ViewHeader({ icon, title, subtitle, children }: { icon: string; title: string; subtitle: string; children?: React.ReactNode }) {
  return (
    <div className="glass relative overflow-hidden rounded-3xl p-5">
      <div className="pointer-events-none absolute -right-6 -top-8 text-[120px] leading-none opacity-[0.07]">{icon}</div>
      <div className="flex items-center gap-3">
        <span className="text-3xl">{icon}</span>
        <div>
          <h1 className="text-xl font-bold tracking-tight sm:text-2xl">{title}</h1>
          <p className="text-xs text-white/50 sm:text-sm">{subtitle}</p>
        </div>
      </div>
      {children && <div className="mt-4">{children}</div>}
    </div>
  );
}
