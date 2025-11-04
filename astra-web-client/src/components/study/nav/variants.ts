import type { Variants } from 'framer-motion';

export const SECTION_VARIANTS: Variants = {
  initial: { opacity: 0, y: 16 },
  animate: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.25, ease: 'easeOut' },
  },
  exit: {
    opacity: 0,
    y: 16,
    transition: { duration: 0.2, ease: 'easeIn' },
  },
};

export const ITEM_VARIANTS: Variants = {
  initial: { opacity: 0, y: 12 },
  animate: (index: number) => ({
    opacity: 1,
    y: 0,
    transition: {
      duration: 0.2,
      delay: index * 0.03,
    },
  }),
  exit: { opacity: 0, y: 12, transition: { duration: 0.15 } },
};
