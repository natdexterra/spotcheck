import { packageData } from '../data/package';

export function Header() {
  const packageTitle = (packageData as typeof packageData & { title?: string }).title ?? 'RFQ package';
  return (
    <header className="header">
      <div className="header__identity">
        <h1 className="header__product">Spotcheck</h1>
        <span className="header__tagline">Your agent reads the RFQ. You spot-check it.</span>
      </div>
      <span className="header__package">{packageTitle}</span>
    </header>
  );
}
