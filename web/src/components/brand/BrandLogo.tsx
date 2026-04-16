import brandLogo from '../../assets/logo.jpg';

type BrandLogoProps = {
  size?: number;
  className?: string;
};

export function BrandLogo({
  size = 44,
  className = '',
}: BrandLogoProps) {
  return (
    <div
      className={[
        'inline-flex shrink-0 items-center justify-center overflow-hidden rounded-[14px] border border-slate-200 bg-white shadow-[0_10px_24px_rgba(15,23,42,0.08)]',
        className,
      ].join(' ')}
      style={{ width: size, height: size }}
    >
      <img
        src={brandLogo}
        alt="kubejojo logo"
        className="h-full w-full object-cover"
        loading="eager"
      />
    </div>
  );
}
