// Shared legal/compliance footer. Small, muted legal text required site-wide
// (company registration, VAT, ICO, registered office) — rendered in the PublicHome
// footer and every dashboard shell (parent / mosque / scholar / admin). There was no
// shared footer or layout shell, so this is the single place the legal text lives.
// `className` lets a caller tweak spacing/tone per surface (e.g. the dark PublicHome
// footer); the default muted stone tone reads fine on both light and dark surfaces.
const LegalFooter = ({ className = "" }) => (
  <div className={`text-xs leading-relaxed text-stone-400 ${className}`}>
    <p>
      Amanah is a trading name of Saveco Tech Ltd. Registered in England &amp; Wales
      {" · "}Company No. 12720369{" · "}VAT No. GB356663862{" · "}ICO Reg. ZC190773
      {" · "}Registered office: Trust House C/O Isaacs, St James Business Park,
      5 New Augustus Street, Bradford, West Yorkshire, BD1 5LL
    </p>
    <p className="mt-1">© 2026 Saveco Tech Ltd. All rights reserved.</p>
  </div>
);

export default LegalFooter;
