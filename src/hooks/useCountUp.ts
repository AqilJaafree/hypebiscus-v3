import { useEffect, useState } from 'react';

export const useCountUp = (target: number, duration: number = 1000, reset: boolean) => {
  const [count, setCount] = useState(0);

  useEffect(() => {
    let start = 0;
    setCount(0);
    const increment = (target - start) / (duration / 10);

    const interval = setInterval(() => {
      start += increment;
      if (start >= target) {
        start = target;
        clearInterval(interval);
      }
      setCount(parseFloat(start.toFixed(2)));
    }, 10);

    return () => clearInterval(interval);
  }, [target, duration, reset]);

  return count;
};