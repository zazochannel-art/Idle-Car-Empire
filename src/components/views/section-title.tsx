export function SectionTitle({ title, subtitle, right }: { title: string; subtitle?: string; right?: React.ReactNode }) {
  return (
    <div className="flex items-end justify-between gap-3">
      <div>
        <h2 className="text-xl sm:text-2xl">{title}</h2>
        {subtitle && <p className="text-xs text-white/45">{subtitle}</p>}
      </div>
      {right}
    </div>
  );
}

export function ViewHeader({ icon, title, subtitle, children }: { icon: string; title: string; subtitle: string; children?: React.ReactNode }) {
  return (
    <div className="card-light relative overflow-hidden rounded-xl p-4">
      <div className="pointer-events-none absolute -right-4 -top-6 text-[110px] leading-none opacity-[0.12] grayscale">{icon}</div>
      <div className="flex items-center gap-3">
        <span className="text-4xl drop-shadow-[0_3px_2px_rgba(0,0,0,0.25)]">{icon}</span>
        <div className="min-w-0">
          <h1 className="text-[26px] text-[#1d1d20] sm:text-3xl">{title}</h1>
          <p className="mt-1 text-xs font-semibold text-[#4a4a50] sm:text-sm">{subtitle}</p>
        </div>
      </div>
      {/* the details stay on a dark inset, where the light lettering reads */}
      {children && <div className="mt-3 rounded-lg bg-[#2b2b2e] p-3 text-white">{children}</div>}
    </div>
  );
}
