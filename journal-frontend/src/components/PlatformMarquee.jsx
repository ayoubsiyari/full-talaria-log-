import React from 'react';

// Import your logos here. I'm using the ones we found as placeholders.
import logo1 from '../assets/LOGO-01.png';
import logo3 from '../assets/LOGO-03.png';
import logo6 from '../assets/LOGO-06.png';
import logo7 from '../assets/LOGO-07.png';
import logo9 from '../assets/LOGO-09.png';
import logo10 from '../assets/LOGO-10.png';

const logos = [
  { src: logo1, alt: 'Platform 1' },
  { src: logo3, alt: 'Platform 2' },
  { src: logo6, alt: 'Platform 3' },
  { src: logo7, alt: 'Platform 4' },
  { src: logo9, alt: 'Platform 5' },
  { src: logo10, alt: 'Platform 6' },
];

const MarqueeContent = () => (
  <div className="flex-shrink-0 flex items-center justify-around min-w-full">
    {logos.map((logo, index) => (
      <div key={index} className="px-8">
        <img src={logo.src} alt={logo.alt} className="h-10 w-auto object-contain" />
      </div>
    ))}
  </div>
);

export default function PlatformMarquee() {
  return (
    <div className="w-full py-12 bg-white/5 overflow-hidden">
      <div className="flex animate-marquee whitespace-nowrap">
        <MarqueeContent />
        <MarqueeContent />
      </div>
    </div>
  );
}
