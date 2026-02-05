import React from 'react';
import { motion } from 'framer-motion';

const Blob = ({ style, animate, transition }) => (
  <motion.div
    className={`absolute rounded-full mix-blend-lighten filter blur-3xl opacity-30`}
    style={{
      width: '30rem',
      height: '30rem',
      ...style
    }}
    animate={animate}
    transition={transition}
  />
);

export default function BackgroundGlow() {
  return (
    <>
      <Blob
        style={{ background: 'rgba(139, 92, 246, 0.5)' }} // purple
        animate={{
          x: ['-20vw', '30vw', '-20vw'],
          y: ['-20vh', '40vh', '-20vh'],
          rotate: [0, 90, 0]
        }}
        transition={{
          duration: 35,
          repeat: Infinity,
          repeatType: 'mirror',
          ease: 'easeInOut',
        }}
      />
      <Blob
        style={{ background: 'rgba(59, 130, 246, 0.6)' }} // blue
        animate={{
          x: ['90vw', '40vw', '90vw'],
          y: ['-10vh', '50vh', '-10vh'],
          rotate: [0, -90, 0]
        }}
        transition={{
          duration: 30,
          repeat: Infinity,
          repeatType: 'mirror',
          ease: 'easeInOut',
          delay: 5
        }}
      />
       <Blob
        style={{ background: 'rgba(22, 163, 74, 0.4)' }} // green
        animate={{
          x: ['30vw', '0vw', '30vw'],
          y: ['90vh', '30vh', '90vh'],
        }}
        transition={{
          duration: 40,
          repeat: Infinity,
          repeatType: 'mirror',
          ease: 'easeInOut',
          delay: 10
        }}
      />
    </>
  );
}
