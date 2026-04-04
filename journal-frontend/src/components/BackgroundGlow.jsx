import React from 'react';
import { motion } from 'framer-motion';

const Blob = ({ style, animate, transition }) => (
  <motion.div
    className="absolute rounded-full mix-blend-screen filter blur-3xl opacity-[0.18]"
    style={{
      width: '28rem',
      height: '28rem',
      ...style,
    }}
    animate={animate}
    transition={transition}
  />
);

/** Ambient neon cyan blobs – matches journal / homepage dashboard */
export default function BackgroundGlow() {
  return (
    <>
      <Blob
        style={{ background: 'rgba(34, 211, 238, 0.45)' }}
        animate={{
          x: ['-15vw', '25vw', '-15vw'],
          y: ['-15vh', '35vh', '-15vh'],
          rotate: [0, 45, 0],
        }}
        transition={{
          duration: 38,
          repeat: Infinity,
          repeatType: 'mirror',
          ease: 'easeInOut',
        }}
      />
      <Blob
        style={{ background: 'rgba(6, 182, 212, 0.4)' }}
        animate={{
          x: ['85vw', '45vw', '85vw'],
          y: ['-8vh', '45vh', '-8vh'],
          rotate: [0, -40, 0],
        }}
        transition={{
          duration: 32,
          repeat: Infinity,
          repeatType: 'mirror',
          ease: 'easeInOut',
          delay: 4,
        }}
      />
      <Blob
        style={{ background: 'rgba(103, 232, 249, 0.25)' }}
        animate={{
          x: ['25vw', '-5vw', '25vw'],
          y: ['85vh', '25vh', '85vh'],
        }}
        transition={{
          duration: 42,
          repeat: Infinity,
          repeatType: 'mirror',
          ease: 'easeInOut',
          delay: 8,
        }}
      />
    </>
  );
}
