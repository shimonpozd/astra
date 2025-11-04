import clsx from 'clsx';
import { motion, type Variants } from 'framer-motion';

export interface ComingSoonPanelProps {
  sectionName: string;
  theme: 'dark' | 'light' | 'system';
  variants: Variants;
}

function ComingSoonPanel({ sectionName, theme, variants }: ComingSoonPanelProps) {
  return (
    <motion.section
      key="coming-soon"
      variants={variants}
      initial="initial"
      animate="animate"
      exit="exit"
      className={clsx(
        'rounded-2xl border p-5 shadow-lg backdrop-blur-lg',
        theme === 'dark'
          ? 'border-white/10 bg-white/10 text-white/70 shadow-black/20'
          : 'border-gray-200 bg-white/20 text-gray-600 shadow-gray-200/20',
      )}
    >
      <div className="space-y-3">
        <h3
          className={clsx(
            'text-lg font-semibold',
            theme === 'dark' ? 'text-white' : 'text-gray-900',
          )}
        >
          Раздел в разработке
        </h3>
        <p className="mt-2 text-sm">
          Дополнительные материалы для раздела{' '}
          <span className={theme === 'dark' ? 'text-white' : 'text-gray-900'}>{sectionName}</span>
          {' '}появятся в ближайшем обновлении. Мы сообщим, когда навигация будет готова.
        </p>
      </div>
    </motion.section>
  );
}

export default ComingSoonPanel;
