import React, { useEffect, useRef } from 'react';
import { CallStatus } from '../shared/types';

interface AudioVisualizerProps {
  status: CallStatus;
  analyserNode: AnalyserNode | null;
}

export const AudioVisualizer: React.FC<AudioVisualizerProps> = ({ status, analyserNode }) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animationFrameId: number;
    const bufferLength = analyserNode ? analyserNode.frequencyBinCount : 64;
    const dataArray = new Uint8Array(bufferLength);

    const render = () => {
      animationFrameId = requestAnimationFrame(render);

      const width = canvas.width;
      const height = canvas.height;

      ctx.clearRect(0, 0, width, height);

      if (analyserNode && (status === 'listening' || status === 'speaking')) {
        analyserNode.getByteFrequencyData(dataArray);
      } else {
        // Generate soft idle/thinking wave
        for (let i = 0; i < bufferLength; i++) {
          if (status === 'thinking') {
            dataArray[i] = Math.sin(Date.now() * 0.008 + i * 0.2) * 35 + 40;
          } else if (status === 'speaking') {
            dataArray[i] = Math.sin(Date.now() * 0.015 + i * 0.15) * 55 + 65;
          } else if (status === 'listening') {
            dataArray[i] = Math.sin(Date.now() * 0.005 + i * 0.1) * 20 + 25;
          } else {
            dataArray[i] = 4;
          }
        }
      }

      const barCount = 28;
      const barWidth = 3.5;
      const gap = 4;
      const totalWidth = barCount * (barWidth + gap);
      const startX = (width - totalWidth) / 2;

      for (let i = 0; i < barCount; i++) {
        const value = dataArray[i * 2] || 10;
        const barHeight = Math.max(4, (value / 255) * (height * 0.85));

        const x = startX + i * (barWidth + gap);
        const y = (height - barHeight) / 2;

        // Gradient color depending on agent status
        const gradient = ctx.createLinearGradient(0, y, 0, y + barHeight);
        if (status === 'speaking') {
          gradient.addColorStop(0, '#38bdf8');
          gradient.addColorStop(1, '#6366f1');
        } else if (status === 'thinking') {
          gradient.addColorStop(0, '#fbbf24');
          gradient.addColorStop(1, '#f97316');
        } else if (status === 'listening') {
          gradient.addColorStop(0, '#34d399');
          gradient.addColorStop(1, '#059669');
        } else {
          gradient.addColorStop(0, '#475569');
          gradient.addColorStop(1, '#1e293b');
        }

        ctx.fillStyle = gradient;
        ctx.beginPath();
        ctx.roundRect(x, y, barWidth, barHeight, 2);
        ctx.fill();
      }
    };

    render();

    return () => {
      cancelAnimationFrame(animationFrameId);
    };
  }, [status, analyserNode]);

  return (
    <div className="flex items-center justify-center w-full h-14">
      <canvas
        ref={canvasRef}
        width={260}
        height={56}
        className="w-[260px] h-[56px]"
      />
    </div>
  );
};
