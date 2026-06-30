// Islamic 8-pointed-star (khatam) strapwork — a clean, tileable SVG Zellij-style
// divider in the Amanah emerald + stone palette. The motif is a true octagram
// (two overlapping squares whose tips meet edge-to-edge so it tessellates), with
// a layered stone inner diamond and an emerald centre knot for a muqarnas-like
// depth. A horizontal linear fade masks both ends so it reads as a subtle,
// premium section break rather than a hard rule. Pure SVG, no dependencies.
//
// SVG def ids are made unique per instance (useId) so the divider can be repeated
// safely across a page — duplicate ids would otherwise collide on url(#…) refs.

import { useId } from "react";

const GeometricDivider = ({ className = "" }) => {
  const uid = useId().replace(/:/g, "");
  const pat = `amanah-zellij-${uid}`;
  const fade = `amanah-zellij-fade-${uid}`;
  const mask = `amanah-zellij-mask-${uid}`;
  return (
    <div className={`w-full select-none ${className}`} aria-hidden="true">
      <svg viewBox="0 0 1152 72" preserveAspectRatio="xMidYMid slice" className="w-full h-10 md:h-14" role="presentation" focusable="false">
        <defs>
          {/* One 72×72 octagram tile. Diamond tips at the edge midpoints make it
              interlock with its neighbours into a continuous star band. */}
          <pattern id={pat} width="72" height="72" patternUnits="userSpaceOnUse">
            <g fill="none" strokeLinejoin="round">
              {/* outer octagram — diamond + axis square, same circumradius */}
              <polygon points="36,0 72,36 36,72 0,36" stroke="#047857" strokeWidth="1.15" strokeOpacity="0.42" />
              <rect x="10.5" y="10.5" width="51" height="51" stroke="#047857" strokeWidth="1.15" strokeOpacity="0.42" />
              {/* stone inner diamond — the layered "knot" */}
              <polygon points="36,13 59,36 36,59 13,36" stroke="#a8a29e" strokeWidth="0.9" strokeOpacity="0.4" />
            </g>
            {/* emerald centre dot */}
            <circle cx="36" cy="36" r="2.3" fill="#047857" fillOpacity="0.45" />
          </pattern>
          <linearGradient id={fade} x1="0" y1="0" x2="1" y2="0">
            <stop offset="0" stopColor="#fff" stopOpacity="0" />
            <stop offset="0.5" stopColor="#fff" stopOpacity="1" />
            <stop offset="1" stopColor="#fff" stopOpacity="0" />
          </linearGradient>
          <mask id={mask}><rect width="1152" height="72" fill={`url(#${fade})`} /></mask>
        </defs>
        <rect width="1152" height="72" fill={`url(#${pat})`} mask={`url(#${mask})`} />
      </svg>
    </div>
  );
};

export default GeometricDivider;
