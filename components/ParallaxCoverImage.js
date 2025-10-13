'use client'

import { useRef } from 'react';
import Image from "next/image";
import { StarIcon } from "lucide-react";
import { animate, motion, useMotionValue, useTransform } from 'motion/react';

export default function ParallaxCoverImage({ animeData }) {
  const cardRef = useRef(null);

  const x = useMotionValue(0);
  const y = useMotionValue(0);

  const rotateX = useTransform(y, [-150, 150], [5, -5]);
  const rotateY = useTransform(x, [-150, 150], [-6, 6]);

  const handleMouseMove = (e) => {
    if (!cardRef.current) return;
    const rect = cardRef.current.getBoundingClientRect();
    const mouseX = e.clientX - rect.left - rect.width / 2;
    const mouseY = e.clientY - rect.top - rect.height / 2;
    const options = { type: "spring", stiffness: 150, damping: 20, mass: 0.1 };
    animate(x, mouseX, options);
    animate(y, mouseY, options);
  };

  const handleMouseLeave = () => {
    animate(x, 0, { type: "spring", stiffness: 150, damping: 20 });
    animate(y, 0, { type: "spring", stiffness: 150, damping: 20 });
  };

  return (
    <motion.div
      ref={cardRef}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
      style={{
        rotateX,
        rotateY,
        transformStyle: "preserve-3d",
      }}
      whileTap={{ scale: 0.95 }}
      className="hidden md:block flex-shrink-0 w-56 -mb-4 cursor-pointer"
    >
      <div
        className="relative aspect-[2/3] rounded-xl overflow-hidden shadow-lg  transition-shadow duration-500"
      >
        <Image
          src={animeData.coverImage}
          alt={`${animeData.title} cover`}
          className="object-cover"
          fill
        />
        <div className="absolute bottom-0 left-0 flex items-center justify-center gap-1 w-full p-1 bg-black/50 backdrop-blur-sm text-sm font-bold">
          <StarIcon className="w-4 h-4 text-amber-400 fill-current" />
          <span>{animeData.score}</span>
        </div>
      </div>
    </motion.div>
  );
}