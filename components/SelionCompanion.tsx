"use client";

import Image from "next/image";

export default function SelionCompanion() {
  return (
    <div className="relative flex min-h-[320px] w-full items-center justify-center">
      <div className="selion-halo-main" />
      <div className="selion-halo-secondary" />

      <div className="absolute animate-plumOrbit">
        <Image src="/plum.png" alt="Plum" width={110} height={110} />
      </div>

      <div className="relative animate-float">
        <Image
          src="/selion.png"
          alt="Sélion"
          width={230}
          height={230}
          priority
        />
      </div>
    </div>
  );
}
