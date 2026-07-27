import toast from 'react-hot-toast';

const IS_DEMO = import.meta.env.VITE_DEMO_MODE === 'true';

export const demoBlock = (message = 'Deletes are disabled in demo mode') => {
  if (IS_DEMO) {
    toast('🔒 ' + message, { duration: 3000 });
    return true;
  }
  return false;
};

export const IS_DEMO_MODE = IS_DEMO;
