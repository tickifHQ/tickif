const items = [
  { mark: '✓', label: '12,400+ real homes, fully verified' },
  { mark: '⛉', label: 'Talk directly to the designers' },
  { mark: '✦', label: 'No commissions · No middlemen' },
];

export function TrustStrip() {
  return (
    <div className="bg-[#1d2721]">
      <div className="mx-auto flex max-w-[1240px] flex-wrap items-center justify-center gap-x-8 gap-y-1.5 px-6 py-2.5">
        {items.map((item) => (
          <span key={item.label} className="inline-flex items-center gap-2 text-xs font-medium text-[#f3f0e7]/95">
            <span aria-hidden className="text-[#f3f0e7]">{item.mark}</span>
            {item.label}
          </span>
        ))}
      </div>
    </div>
  );
}
