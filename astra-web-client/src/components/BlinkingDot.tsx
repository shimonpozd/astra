import React, { useState, useEffect } from 'react';

export const BlinkingDot: React.FC = () => {
  const [color, setColor] = useState('green');

  useEffect(() => {
    const intervalId = setInterval(() => {
      setColor(prevColor => (prevColor === 'green' ? 'red' : 'green'));
    }, 1000);

    return () => clearInterval(intervalId);
  }, []);

  return (
    <div style={{
      position: 'fixed',
      top: '10px',
      left: '10px',
      width: '20px',
      height: '20px',
      backgroundColor: color,
      borderRadius: '50%',
      zIndex: 9999,
    }} title="Blinking Dot Test" />
  );
};
