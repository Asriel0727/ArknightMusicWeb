<template>
  <canvas ref="canvasRef" class="particle-canvas"></canvas>
  <canvas ref="mouseCanvasRef" class="mouse-canvas"></canvas>
</template>

<script setup>
import { ref, onMounted, onUnmounted } from 'vue';

const canvasRef = ref(null);
const mouseCanvasRef = ref(null);
let ctx = null;
let mouseCtx = null;
let particles = [];
let targets = [];
let mouseX = null;
let mouseY = null;
let timer = null;
let nowImg = 0;
let animationFrameId = null;
let circleAnimationId = null;

// 檢測是否為觸摸設備（沒有精確指針）
const isTouchDevice = () => {
  return window.matchMedia('(hover: none) and (pointer: coarse)').matches;
};

// 粒子区域大小（右下角区域，调整为与按钮差不多大小）
const PARTICLE_WIDTH = 200;
const PARTICLE_HEIGHT = 200;

// 图片路径列表
// 使用 Vite 的 BASE_URL 来支持 GitHub Pages 的 base 路径
const BASEURL = import.meta.env.BASE_URL + "images/";
const suffix = ".png";
const imgList = ["logo_kazimierz", "logo_rhine", "logo_yan", "logo_victoria"];

// 鼠标周围圆的半径
const circleR = 20;
// 总运动时间
const duration = 300;
// 最大生效距离
const maxDis = 300;

// 重置画布
const initCanvasSize = () => {
  if (!canvasRef.value) return;
  // 粒子画布固定在右下角，固定大小
  canvasRef.value.width = PARTICLE_WIDTH;
  canvasRef.value.height = PARTICLE_HEIGHT;
  
  // 鼠标圆圈画布覆盖全屏
  if (mouseCanvasRef.value) {
    mouseCanvasRef.value.width = window.innerWidth;
    mouseCanvasRef.value.height = window.innerHeight;
  }
};

// 清空画布
const clear = () => {
  if (!ctx) return;
  ctx.clearRect(0, 0, canvasRef.value.width, canvasRef.value.height);
};

// 获取随机数
const getRandom = (min, max) => {
  return Math.floor(Math.random() * (max - min + 1) + min);
};

// 粒子类
class Particle {
  constructor(tx, ty, average_x, average_y) {
    // 粒子的位置
    if (average_x && average_y) {
      this.x = average_x + getRandom(-100, 100);
      this.y = average_y + getRandom(-100, 100);
    } else {
      this.x = tx + getRandom(-512, 0);
      this.y = ty + getRandom(-512, 0);
    }

    // 粒子的目标位置
    this.tx = tx;
    this.ty = ty;

    // 粒子的大小
    this.size = 1.5;
  }

  draw() {
    if (!ctx) return;
    ctx.beginPath();
    ctx.arc(this.x, this.y, this.size, 0, 2 * Math.PI);
    // 越近越亮
    const r = Math.sqrt((this.x - this.tx) ** 2 + (this.y - this.ty) ** 2);
    const alpha = 0.8 - r / maxDis;
    ctx.fillStyle = `rgba(255,255,255,${alpha})`;
    ctx.fill();
  }

  // 一帧动画
  move() {
    const startTime = Date.now();
    let lastTime = startTime;

    // 比例因子
    const k = 0.15;
    const _move = () => {
      if (!canvasRef.value) return;

      const nowTime = Date.now();
      const deltaTime = nowTime - lastTime;
      lastTime = nowTime;

      // 速度
      let xSpeed = (this.tx - this.x) / duration;
      let ySpeed = (this.ty - this.y) / duration;

      // 如果鼠标在画布范围内，影响粒子
      if (mouseX !== null && mouseY !== null && canvasRef.value) {
        // mouseX 和 mouseY 已经是相对于画布的坐标
        const r = Math.sqrt((this.x - mouseX) ** 2 + (this.y - mouseY) ** 2);
        let a = 0;
        if (r < maxDis) {
          a = Math.sqrt(maxDis / (r + 1)) - 1;
        }

        if (r != 0) {
          xSpeed += (this.x - mouseX) / r * a * k;
          ySpeed += (this.y - mouseY) / r * a * k;
        } else {
          xSpeed += (Math.random() * 2 * Math.PI - Math.PI) * a * k;
          ySpeed += (Math.random() * 2 * Math.PI - Math.PI) * a * k;
        }
      }

      this.x += (xSpeed) * deltaTime;
      this.y += (ySpeed) * deltaTime;
      animationFrameId = requestAnimationFrame(_move);
    };
    _move();
  }
}

// 绘制
const draw = () => {
  clear();
  for (let i = 0; i < particles.length; i++) {
    particles[i].draw();
  }
  animationFrameId = requestAnimationFrame(draw);
};

// 获取图片的像素信息
const getPoints = () => {
  if (!ctx || !canvasRef.value) return [];
  const { width, height, data } = ctx.getImageData(0, 0, canvasRef.value.width, canvasRef.value.height);
  const points = [];
  const gap = 6;
  for (let i = 0; i < width; i += gap) {
    for (let j = 0; j < height; j += gap) {
      const index = (j * width + i) * 4;
      const r = data[index];
      const g = data[index + 1];
      const b = data[index + 2];
      const a = data[index + 3];
      if (r == 255 && g == 255 && b == 255 && a == 255) {
        points.push({
          x: i,
          y: j
        });
      }
    }
  }
  return points;
};

// 更新粒子位置
const update = () => {
  if (!canvasRef.value || !ctx) return;

  // 加载图片
  const img = document.createElement("img");
  img.src = BASEURL + imgList[nowImg] + suffix;
  img.crossOrigin = "anonymous";
  nowImg = (nowImg + 1) % imgList.length;

  img.onload = function () {
    if (!canvasRef.value || !ctx) return;

    // 计算图片显示尺寸，确保不超过画布大小
    const maxSize = Math.min(canvasRef.value.width, canvasRef.value.height);
    let displayWidth = img.width;
    let displayHeight = img.height;
    
    // 如果图片太大，按比例缩小
    if (displayWidth > maxSize || displayHeight > maxSize) {
      const scale = maxSize / Math.max(displayWidth, displayHeight);
      displayWidth = displayWidth * scale;
      displayHeight = displayHeight * scale;
    }

    // 画图像（在右下角区域中心）
    clear();
    const imgX = canvasRef.value.width / 2 - displayWidth / 2;
    const imgY = canvasRef.value.height / 2 - displayHeight / 2;
    ctx.drawImage(
      img,
      imgX,
      imgY,
      displayWidth,
      displayHeight
    );
    targets = getPoints();

    // 清空画布
    clear();

    // 更新粒子
    if (particles.length > targets.length) {
      particles.splice(targets.length, particles.length - targets.length);
    }

    // 打乱数组
    particles.sort(() => Math.random() - 0.5);

    const average_x = targets.length > 0 ? targets.reduce((sum, cur) => sum + cur.x, 0) / targets.length : 0;
    const average_y = targets.length > 0 ? targets.reduce((sum, cur) => sum + cur.y, 0) / targets.length : 0;
    for (let i = 0; i < targets.length; i++) {
      const { x, y } = targets[i];
      let point = particles[i];

      if (!point) {
        point = new Particle(x, y, average_x, average_y);
        point.move();
        particles.push(point);
      } else {
        point.tx = x;
        point.ty = y;
      }
    }
  };
};

// 存储全局鼠标坐标（用于圆圈显示）
let globalMouseX = null;
let globalMouseY = null;

// 给鼠标周围加上圆圈（在独立的鼠标画布上）
const circle = () => {
  if (!mouseCtx || !mouseCanvasRef.value || globalMouseX === null || globalMouseY === null) {
    circleAnimationId = requestAnimationFrame(circle);
    return;
  }

  // 清空鼠标画布
  mouseCtx.clearRect(0, 0, mouseCanvasRef.value.width, mouseCanvasRef.value.height);
  
  // 绘制鼠标圆圈（使用全局坐标）
  mouseCtx.beginPath();
  mouseCtx.arc(globalMouseX, globalMouseY, circleR, 0, 2 * Math.PI);
  mouseCtx.strokeStyle = "rgb(255,255,255)";
  mouseCtx.lineWidth = 2;
  mouseCtx.stroke();
  mouseCtx.closePath();
  circleAnimationId = requestAnimationFrame(circle);
};

// 获取粒子画布的位置
const getCanvasPosition = () => {
  if (!canvasRef.value) return { x: 0, y: 0 };
  const rect = canvasRef.value.getBoundingClientRect();
  return {
    x: rect.left,
    y: rect.top,
    width: rect.width,
    height: rect.height
  };
};

// 鼠标移动事件
const handleMouseMove = (e) => {
  // 始终记录全局坐标（用于圆圈显示）
  globalMouseX = e.clientX;
  globalMouseY = e.clientY;
  
  const canvasPos = getCanvasPosition();
  // 将鼠标坐标转换为相对于粒子画布的坐标
  const relativeX = e.clientX - canvasPos.x;
  const relativeY = e.clientY - canvasPos.y;
  
  // 检查鼠标是否在粒子画布区域内
  if (relativeX >= 0 && relativeX <= canvasPos.width && 
      relativeY >= 0 && relativeY <= canvasPos.height) {
    mouseX = relativeX;
    mouseY = relativeY;
  } else {
    // 如果不在画布内，清除相对坐标
    mouseX = null;
    mouseY = null;
  }
};

// 页面可见性改变事件
const handleVisibilityChange = () => {
  if (!document.hidden) {
    // 定时器
    timer = setInterval(update, 5000);
  } else {
    if (timer) {
      clearInterval(timer);
      timer = null;
    }
  }
};

// 窗口大小改变事件
const handleResize = () => {
  initCanvasSize();
};

const run = () => {
  if (!canvasRef.value) return;
  
  initCanvasSize();
  timer = setInterval(update, 5000);
  draw();
  
  // 只在非觸摸設備上顯示鼠標圓圈
  if (!isTouchDevice()) {
    circle();
  }
};

onMounted(() => {
  if (canvasRef.value) {
    ctx = canvasRef.value.getContext("2d", {
      willReadFrequently: true
    });
  }
  
  // 只在非觸摸設備上初始化鼠標畫布
  if (mouseCanvasRef.value && !isTouchDevice()) {
    mouseCtx = mouseCanvasRef.value.getContext("2d");
  }
  
  if (canvasRef.value) {
    run();
    // 只在非觸摸設備上監聽鼠標移動
    if (!isTouchDevice()) {
      window.addEventListener("mousemove", handleMouseMove);
    }
    document.addEventListener("visibilitychange", handleVisibilityChange);
    window.addEventListener("resize", handleResize);
  }
});

onUnmounted(() => {
  if (timer) {
    clearInterval(timer);
  }
  if (animationFrameId) {
    cancelAnimationFrame(animationFrameId);
  }
  if (circleAnimationId) {
    cancelAnimationFrame(circleAnimationId);
  }
  window.removeEventListener("mousemove", handleMouseMove);
  document.removeEventListener("visibilitychange", handleVisibilityChange);
  window.removeEventListener("resize", handleResize);
});
</script>

<style scoped>
.particle-canvas {
  position: fixed;
  bottom: 20px;
  right: 20px;
  width: 200px;
  height: 200px;
  z-index: 1;
  pointer-events: auto;
  cursor: pointer;
}

.mouse-canvas {
  position: fixed;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  z-index: 9999;
  pointer-events: none;
}

/* 在觸摸設備上隱藏鼠標圓圈 */
@media (hover: none) and (pointer: coarse) {
  .mouse-canvas {
    display: none;
  }
}

@media (max-width: 768px) {
  .particle-canvas {
    width: 150px;
    height: 150px;
    bottom: 15px;
    right: 15px;
  }
}

@media (max-width: 480px) {
  .particle-canvas {
    width: 120px;
    height: 120px;
    bottom: 10px;
    right: 10px;
  }
}
</style>

