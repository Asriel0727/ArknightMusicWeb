import { ref, onMounted, onUnmounted } from 'vue';
import { decodeText } from '../utils/textGlitch.js';

export function useTextGlitch(originalText, duration = 3000) {
  const displayText = ref('');
  const isAnimating = ref(true);
  
  let animationFrame = null;
  let startTime = null;
  
  const animate = (timestamp) => {
    if (!startTime) startTime = timestamp;
    
    const elapsed = timestamp - startTime;
    const progress = Math.min(elapsed / duration, 1);
    
    displayText.value = decodeText(originalText, progress);
    
    if (progress < 1) {
      animationFrame = requestAnimationFrame(animate);
    } else {
      displayText.value = originalText;
      isAnimating.value = false;
    }
  };
  
  const start = () => {
    isAnimating.value = true;
    startTime = null;
    animationFrame = requestAnimationFrame(animate);
  };
  
  onMounted(() => {
    start();
  });
  
  onUnmounted(() => {
    if (animationFrame) {
      cancelAnimationFrame(animationFrame);
    }
  });
  
  return {
    displayText,
    isAnimating,
    start
  };
}

