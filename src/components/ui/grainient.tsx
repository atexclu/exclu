import { useEffect, useRef } from 'react';

interface GrainientProps {
  color1?: string;
  color2?: string;
  color3?: string;
  timeSpeed?: number;
  colorBalance?: number;
  warpStrength?: number;
  warpFrequency?: number;
  warpSpeed?: number;
  warpAmplitude?: number;
  blendAngle?: number;
  blendSoftness?: number;
  rotationAmount?: number;
  noiseScale?: number;
  grainAmount?: number;
  grainScale?: number;
  grainAnimated?: boolean;
  contrast?: number;
  gamma?: number;
  saturation?: number;
  centerX?: number;
  centerY?: number;
  zoom?: number;
  className?: string;
}

export function Grainient({
  color1 = '#FF9FFC',
  color2 = '#5227FF',
  color3 = '#B19EEF',
  timeSpeed = 0.25,
  colorBalance = 0,
  warpStrength = 1,
  warpFrequency = 5,
  warpSpeed = 2,
  warpAmplitude = 50,
  blendAngle = 0,
  blendSoftness = 0.05,
  rotationAmount = 500,
  noiseScale = 2,
  grainAmount = 0.1,
  grainScale = 2,
  grainAnimated = false,
  contrast = 1.5,
  gamma = 1,
  saturation = 1,
  centerX = 0,
  centerY = 0,
  zoom = 0.9,
  className = '',
}: GrainientProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animationFrameRef = useRef<number>();

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let time = 0;

    const hexToRgb = (hex: string) => {
      const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
      return result
        ? {
            r: parseInt(result[1], 16),
            g: parseInt(result[2], 16),
            b: parseInt(result[3], 16),
          }
        : { r: 0, g: 0, b: 0 };
    };

    const rgb1 = hexToRgb(color1);
    const rgb2 = hexToRgb(color2);
    const rgb3 = hexToRgb(color3);

    const animate = () => {
      const width = canvas.width;
      const height = canvas.height;

      time += timeSpeed * 0.01;

      const imageData = ctx.createImageData(width, height);
      const data = imageData.data;

      for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
          const i = (y * width + x) * 4;

          const nx = ((x - width / 2) / width) * 2 * zoom + centerX;
          const ny = ((y - height / 2) / height) * 2 * zoom + centerY;

          const angle = Math.atan2(ny, nx) + (rotationAmount * time) / 1000;
          const radius = Math.sqrt(nx * nx + ny * ny);

          const warp =
            Math.sin(radius * warpFrequency + time * warpSpeed) * (warpAmplitude / 100) * warpStrength;

          const gradientValue = (Math.sin(angle + warp) + 1) / 2;

          let r, g, b;
          if (gradientValue < 0.5) {
            const t = gradientValue * 2;
            r = rgb1.r * (1 - t) + rgb2.r * t;
            g = rgb1.g * (1 - t) + rgb2.g * t;
            b = rgb1.b * (1 - t) + rgb2.b * t;
          } else {
            const t = (gradientValue - 0.5) * 2;
            r = rgb2.r * (1 - t) + rgb3.r * t;
            g = rgb2.g * (1 - t) + rgb3.g * t;
            b = rgb2.b * (1 - t) + rgb3.b * t;
          }

          const noise =
            (Math.sin(x * noiseScale + time * (grainAnimated ? 10 : 0)) *
              Math.cos(y * grainScale + time * (grainAnimated ? 10 : 0))) *
            grainAmount *
            255;

          r = Math.pow((r + noise) / 255, gamma) * 255 * contrast;
          g = Math.pow((g + noise) / 255, gamma) * 255 * contrast;
          b = Math.pow((b + noise) / 255, gamma) * 255 * contrast;

          const gray = 0.299 * r + 0.587 * g + 0.114 * b;
          r = gray + (r - gray) * saturation;
          g = gray + (g - gray) * saturation;
          b = gray + (b - gray) * saturation;

          data[i] = Math.max(0, Math.min(255, r));
          data[i + 1] = Math.max(0, Math.min(255, g));
          data[i + 2] = Math.max(0, Math.min(255, b));
          data[i + 3] = 255;
        }
      }

      ctx.putImageData(imageData, 0, 0);
      animationFrameRef.current = requestAnimationFrame(animate);
    };

    const resizeCanvas = () => {
      const parent = canvas.parentElement;
      if (parent) {
        canvas.width = parent.clientWidth;
        canvas.height = parent.clientHeight;
      }
    };

    resizeCanvas();
    window.addEventListener('resize', resizeCanvas);
    animate();

    return () => {
      window.removeEventListener('resize', resizeCanvas);
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, [
    color1,
    color2,
    color3,
    timeSpeed,
    colorBalance,
    warpStrength,
    warpFrequency,
    warpSpeed,
    warpAmplitude,
    blendAngle,
    blendSoftness,
    rotationAmount,
    noiseScale,
    grainAmount,
    grainScale,
    grainAnimated,
    contrast,
    gamma,
    saturation,
    centerX,
    centerY,
    zoom,
  ]);

  return <canvas ref={canvasRef} className={`w-full h-full ${className}`} />;
}
