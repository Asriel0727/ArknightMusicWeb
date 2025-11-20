import { decodeText } from '../utils/textGlitch.js';

const duration = 3000; // 3秒

export default {
  mounted(el) {
    // 获取原始文本
    const originalText = el.textContent.trim();
    
    if (!originalText) return;
    
    // 存储原始文本到元素
    el._glitchOriginalText = originalText;
    el._glitchStartTime = null;
    el._glitchAnimationFrame = null;
    
    // 添加动画类
    el.classList.add('text-glitching');
    
    const animate = (timestamp) => {
      if (!el._glitchStartTime) {
        el._glitchStartTime = timestamp;
      }
      
      const elapsed = timestamp - el._glitchStartTime;
      const progress = Math.min(elapsed / duration, 1);
      
      if (progress < 1) {
        el.textContent = decodeText(originalText, progress);
        el._glitchAnimationFrame = requestAnimationFrame(animate);
      } else {
        el.textContent = originalText;
        el.classList.remove('text-glitching');
        el._glitchAnimationFrame = null;
      }
    };
    
    // 启动动画
    el._glitchAnimationFrame = requestAnimationFrame(animate);
  },
  
  unmounted(el) {
    // 清理动画
    if (el._glitchAnimationFrame) {
      cancelAnimationFrame(el._glitchAnimationFrame);
      el._glitchAnimationFrame = null;
    }
  }
};

