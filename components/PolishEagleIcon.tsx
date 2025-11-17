
import React from 'react';

/**
 * Renders the high-fidelity 1980 PRL Eagle using the official Wikimedia source.
 * Uses an img tag to ensure perfect path rendering and color accuracy.
 */
export const PolishEagleIcon: React.FC<{ className?: string }> = ({ className = "w-24 h-24" }) => (
  <div className={`${className} flex items-center justify-center overflow-hidden`}>
    <img 
      src="https://upload.wikimedia.org/wikipedia/commons/3/38/God%C5%82o_PRL_1980.svg" 
      alt="Godło PRL 1980"
      className="w-full h-full object-contain opacity-90 hover:opacity-100 transition-opacity duration-500 drop-shadow-xl"
    />
  </div>
);

export default PolishEagleIcon;
