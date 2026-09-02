import { usePackage } from '../hooks/usePackage';

export function Header() {
  const { customer, reference } = usePackage();
  const name = [reference, customer].filter(Boolean).join(' \u00b7 ');
  return (
    <header className="header">
      <div className="header__identity">
        <h1 className="header__product">Spotcheck</h1>
      </div>
      <span className="header__package">{name === '' ? 'RFQ package' : name}</span>
    </header>
  );
}
