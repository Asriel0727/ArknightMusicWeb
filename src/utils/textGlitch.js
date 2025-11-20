// 生成随机乱码字符
const glitchChars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*()_+-=[]{}|;:,.<>?~`';
const chineseGlitchChars = '的一是在不了有和人这中大为上个国我以要他时来用们生到作地于出就分对成会可主发年动同工也能下过子说产种面而方后多定行学法所民得经十三之进着等部度家电力里如水化高自二理起小物现实加量都两体制机当使点从业本去把性好应开它合还因由其些然前外天政四日那社义事平形相全表间样与关各重新线内数正心反你明看原又么利比或但质气第向道命此变条只没结解问意建月公无系军很情者最立代想已通并提直题党程展五果料象员革位入常文总次品式活设及管特件长求老头基资边流路级少图山统接知较将组见计别她手角期根论运农指几九区强放决西被干做必战先回则任取据处队南给色光门即保治北造百规热领七海口东导器压志世金增争济阶油思术极交受联什认六共权收证改清己美再采转更单风切打白教速花带安场身车例真务具万每至达走积示议声报斗完类离离字母参层止边清至万确究书低术状厂须离断深速';
const japaneseGlitchChars = 'あいうえおかきくけこさしすせそたちつてとなにぬねのはひふへほまみむめもやゆよらりるれろわをんアイウエオカキクケコサシスセソタチツテトナニヌネノハヒフヘホマミムメモヤユヨラリルレロワヲン';

// 获取所有可能的乱码字符
const getAllGlitchChars = () => {
  return glitchChars + chineseGlitchChars + japaneseGlitchChars;
};

// 生成随机乱码字符
export function getRandomGlitchChar() {
  const chars = getAllGlitchChars();
  return chars[Math.floor(Math.random() * chars.length)];
}

// 判断字符类型
function getCharType(char) {
  if (/[\u4e00-\u9fa5]/.test(char)) return 'chinese';
  if (/[\u3040-\u309F\u30A0-\u30FF]/.test(char)) return 'japanese';
  if (/[a-zA-Z0-9]/.test(char)) return 'alphanumeric';
  return 'symbol';
}

// 生成与原始字符类型相似的乱码
export function getGlitchCharForChar(originalChar) {
  const type = getCharType(originalChar);
  let chars;
  
  switch (type) {
    case 'chinese':
      chars = chineseGlitchChars;
      break;
    case 'japanese':
      chars = japaneseGlitchChars;
      break;
    case 'alphanumeric':
      chars = glitchChars;
      break;
    default:
      chars = getAllGlitchChars();
  }
  
  return chars[Math.floor(Math.random() * chars.length)];
}

// 生成乱码文本
export function generateGlitchText(text) {
  return text.split('').map(char => {
    if (char === ' ') return ' ';
    if (char === '\n') return '\n';
    return getGlitchCharForChar(char);
  }).join('');
}

// 逐步解码文字
export function decodeText(originalText, progress) {
  if (progress >= 1) return originalText;
  
  const chars = originalText.split('');
  const decodedChars = [];
  
  // 使用更平滑的解码方式
  // 从左边开始逐步解码，但保持一些随机性
  const baseDecodeIndex = Math.floor(progress * chars.length * 1.2); // 稍微提前解码
  
  for (let i = 0; i < chars.length; i++) {
    const distanceFromStart = i;
    const decodeThreshold = baseDecodeIndex;
    
    // 计算这个字符应该被解码的概率
    let decodeProbability = 0;
    
    if (distanceFromStart < decodeThreshold) {
      // 已经应该解码的区域，但保持一些随机性
      decodeProbability = 0.85 + (progress * 0.15); // 85%-100%
    } else if (distanceFromStart < decodeThreshold + 3) {
      // 过渡区域
      decodeProbability = progress * 0.5;
    } else {
      // 还未解码的区域
      decodeProbability = progress * 0.1;
    }
    
    // 根据概率决定显示原始字符还是乱码
    if (Math.random() < decodeProbability) {
      decodedChars.push(chars[i]);
    } else {
      decodedChars.push(getGlitchCharForChar(chars[i]));
    }
  }
  
  return decodedChars.join('');
}

