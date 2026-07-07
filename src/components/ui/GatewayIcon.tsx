import React from 'react';

export default function GatewayIcon({ className = "h-12 w-auto" }: { className?: string }) {
  return (
    <svg 
      viewBox="50 0 185 185" 
      fill="none" 
      xmlns="http://www.w3.org/2000/svg"
      className={className}
    >
      {/* WAYPOINT PIN */}
      <polygon points="140,42 157,42 149,60" fill="#010409"/>
      <circle cx="149" cy="26" r="18" fill="#010409"/>
      <circle cx="149" cy="25" r="8" fill="#eab308"/>

      {/* CAPSTONE */}
      <rect x="62" y="66" width="174" height="18" rx="2" fill="#D4B46A" stroke="#8B6830" strokeWidth="1"/>
      <line x1="124" y1="68" x2="124" y2="82" stroke="#9E7838" strokeWidth="0.7"/>
      <line x1="174" y1="68" x2="174" y2="82" stroke="#9E7838" strokeWidth="0.7"/>

      {/* LEFT PILLAR */}
      <rect x="78" y="88" width="44" height="16" rx="1" fill="#E8D49A" stroke="#8B6830" strokeWidth="1"/>
      <line x1="100" y1="90" x2="100" y2="102" stroke="#9E7838" strokeWidth="0.6"/>
      <rect x="76" y="107" width="46" height="16" rx="1" fill="#BC9448" stroke="#7A5A28" strokeWidth="1"/>
      <line x1="98" y1="109" x2="98" y2="121" stroke="#9E7838" strokeWidth="0.6"/>
      <rect x="78" y="126" width="44" height="16" rx="1" fill="#D4B46A" stroke="#8B6830" strokeWidth="1"/>
      <line x1="102" y1="128" x2="102" y2="140" stroke="#9E7838" strokeWidth="0.6"/>
      <rect x="76" y="145" width="46" height="16" rx="1" fill="#E8D49A" stroke="#8B6830" strokeWidth="1"/>
      <line x1="99" y1="147" x2="99" y2="159" stroke="#9E7838" strokeWidth="0.6"/>

      {/* RIGHT PILLAR */}
      <rect x="176" y="88" width="44" height="16" rx="1" fill="#D4B46A" stroke="#8B6830" strokeWidth="1"/>
      <line x1="200" y1="90" x2="200" y2="102" stroke="#9E7838" strokeWidth="0.6"/>
      <rect x="176" y="107" width="44" height="16" rx="1" fill="#E8D49A" stroke="#8B6830" strokeWidth="1"/>
      <line x1="202" y1="109" x2="202" y2="121" stroke="#9E7838" strokeWidth="0.6"/>
      <rect x="176" y="126" width="46" height="16" rx="1" fill="#BC9448" stroke="#7A5A28" strokeWidth="1"/>
      <line x1="198" y1="128" x2="198" y2="140" stroke="#9E7838" strokeWidth="0.6"/>
      <rect x="176" y="145" width="44" height="16" rx="1" fill="#D4B46A" stroke="#8B6830" strokeWidth="1"/>
      <line x1="200" y1="147" x2="200" y2="159" stroke="#9E7838" strokeWidth="0.6"/>

      {/* FOUNDATION */}
      <rect x="62" y="164" width="174" height="14" rx="2" fill="#BC9448" stroke="#7A5A28" strokeWidth="1"/>
      <line x1="130" y1="166" x2="130" y2="176" stroke="#9E7838" strokeWidth="0.7"/>
      <line x1="190" y1="166" x2="190" y2="176" stroke="#9E7838" strokeWidth="0.7"/>
    </svg>
  );
}
