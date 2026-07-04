import React, { useEffect, useState } from 'react';

interface LoaderProps {
  onComplete?: () => void;
}

export const Loader: React.FC<LoaderProps> = ({ onComplete }) => {
  const [progress, setProgress] = useState(0);
  const [isFadingOut, setIsFadingOut] = useState(false);

  useEffect(() => {
    // Настроили интервал обновления и шаг, чтобы загрузка плавно шла ровно 5 - 6 секунд
    const interval = setInterval(() => {
      setProgress((prev) => {
        if (prev >= 100) {
          clearInterval(interval);
          return 100;
        }
        // Шаг от 1 до 3 (в среднем 2% за тик), что дает около 50 тиков по 100ms = ~5-6 секунд плавной загрузки
        const step = Math.floor(Math.random() * 3) + 1;
        return Math.min(prev + step, 100);
      });
    }, 100);

    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (progress === 100) {
      const timeout = setTimeout(() => {
        setIsFadingOut(true);
        const completeTimeout = setTimeout(() => {
          if (onComplete) onComplete();
        }, 350);
        return () => clearTimeout(completeTimeout);
      }, 300);
      return () => clearTimeout(timeout);
    }
  }, [progress, onComplete]);

  return (
    <div className={`fixed inset-0 z-[9999] flex flex-col items-center justify-between py-32 px-16 bg-[#070A14] select-none overflow-hidden transition-all duration-350 ease-in-out ${
      isFadingOut ? 'opacity-0 scale-105 pointer-events-none' : 'opacity-100'
    }`}>
      
      {/* Встроенные высокопроизводительные аппаратные анимации для 60 FPS на iOS и Android */}
      <style>{`
        @keyframes scaleLogo {
          0% { transform: scale(0) rotate(-10deg); opacity: 0; filter: blur(10px); }
          60% { transform: scale(1.08) rotate(2deg); opacity: 0.9; filter: blur(0px); }
          100% { transform: scale(1) rotate(0deg); opacity: 1; }
        }

        @keyframes slideUpText {
          0% { transform: translateY(16px); opacity: 0; filter: blur(4px); }
          100% { transform: translateY(0); opacity: 1; filter: blur(0); }
        }

        @keyframes portalPulse {
          0%, 100% { transform: scale(1) translateX(-50%); opacity: 0.6; filter: blur(25px); }
          50% { transform: scale(1.15) translateX(-50%); opacity: 0.9; filter: blur(35px); }
        }

        @keyframes particleFloat {
          0% { transform: translateY(100px) translateX(0); opacity: 0; }
          50% { opacity: 0.6; }
          100% { transform: translateY(-120px) translateX(var(--particle-x, 15px)); opacity: 0; }
        }

        @keyframes rotateProgress {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }

        .animate-logo {
          animation: scaleLogo 900ms cubic-bezier(0.34, 1.56, 0.64, 1) forwards;
        }

        .animate-text-brand {
          opacity: 0;
          animation: slideUpText 700ms cubic-bezier(0.16, 1, 0.3, 1) 500ms forwards;
        }

        .animate-portal {
          animation: portalPulse 3s infinite ease-in-out;
        }

        .floating-particle {
          position: absolute;
          width: 3px;
          height: 3px;
          background: #784DFF;
          border-radius: 50%;
          filter: drop-shadow(0 0 4px #784DFF);
          animation: particleFloat 4s infinite linear;
          bottom: 20%;
        }
      `}</style>

      {/* Роскошные фоновые световые пятна ( Radial Spots & Blur Circles ) */}
      <div className="absolute top-[20%] left-[20%] w-72 h-72 bg-[#784DFF]/[0.02] rounded-full blur-[80px] pointer-events-none" />
      <div className="absolute top-[40%] right-[10%] w-80 h-80 bg-[#C44DFF]/[0.02] rounded-full blur-[100px] pointer-events-none" />

      {/* Парящие световые частицы */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden">
        <div className="floating-particle left-[25%]" style={{ '--particle-x': '-25px', animationDelay: '0s', animationDuration: '3.5s' } as React.CSSProperties} />
        <div className="floating-particle left-[45%]" style={{ '--particle-x': '15px', animationDelay: '1.2s', animationDuration: '4.5s' } as React.CSSProperties} />
        <div className="floating-particle left-[65%]" style={{ '--particle-x': '-10px', animationDelay: '0.6s', animationDuration: '4s' } as React.CSSProperties} />
        <div className="floating-particle left-[80%]" style={{ '--particle-x': '30px', animationDelay: '2.1s', animationDuration: '5s' } as React.CSSProperties} />
      </div>

      {/* Пустой блок-распорка для выравнивания по вертикали */}
      <div className="h-4" />

      {/* ЦЕНТРАЛЬНАЯ ОБЛАСТЬ: Логотип + Название */}
      <div className="flex flex-col items-center justify-center gap-16 relative z-10">
        
        {/* Векторный оригинальный трехлепестковый герб VVD CPA (SVG со встроенным неоновым свечением) */}
        <div className="animate-logo">
          <svg width="100" height="100" viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg">
            <g filter="url(#neonGlow)">
              {/* Левый лепесток */}
              <path d="M42 22C38 38 20 48 20 64C20 78 30 82 40 82C50 82 60 78 60 64C60 48 44 38 42 22Z" fill="url(#brandGrad1)" />
              {/* Правый наложенный лепесток */}
              <path opacity="0.85" d="M43 35C41 48 31 55 31 68C31 76 37 79 43 79C49 79 55 76 55 68C55 48 45 48 43 35Z" fill="url(#brandGrad2)" />
              {/* Central petal */}
              <path opacity="0.95" d="M44 50C42 58 37 62 37 68C37 73 40 75 43 75C46 75 49 73 49 68C49 58 44 58 44 50Z" fill="url(#brandGrad3)" />
            </g>
            <defs>
              <linearGradient id="brandGrad1" x1="40" y1="22" x2="40" y2="82" gradientUnits="userSpaceOnUse">
                <stop offset="0%" stopColor="#784DFF" />
                <stop offset="100%" stopColor="#C44DFF" />
              </linearGradient>
              <linearGradient id="brandGrad2" x1="43" y1="35" x2="43" y2="79" gradientUnits="userSpaceOnUse">
                <stop offset="0%" stopColor="#A855F7" />
                <stop offset="100%" stopColor="#784DFF" />
              </linearGradient>
              <linearGradient id="brandGrad3" x1="43" y1="50" x2="43" y2="75" gradientUnits="userSpaceOnUse">
                <stop offset="0%" stopColor="#FFFFFF" />
                <stop offset="100%" stopColor="#A855F7" />
              </linearGradient>
              <filter id="neonGlow" x="-20%" y="-20%" width="140%" height="140%">
                <feGaussianBlur stdDeviation="6" result="blur" />
                <feMerge>
                  <feMergeNode in="blur" />
                  <feMergeNode in="SourceGraphic" />
                </feMerge>
              </filter>
            </defs>
          </svg>
        </div>

        {/* Название бренда VVD CPA и PREMIUM NETWORK */}
        <div className="flex flex-col items-center justify-center text-center animate-text-brand mt-4">
          <span className="text-[26px] font-bold text-white tracking-widest font-sans uppercase">VVD CPA</span>
          <span className="text-[9px] font-bold text-[#784DFF] tracking-[0.25em] uppercase mt-2">PREMIUM NETWORK</span>
        </div>
      </div>

      {/* НИЖНЯЯ ОБЛАСТЬ: Световой портал + Индикатор загрузки */}
      <div className="relative flex flex-col items-center justify-center w-full h-32 z-10">
        
        {/* Неоновый световой портал (Light Spot) на полу */}
        <div className="absolute bottom-2 left-1/2 w-48 h-3.5 bg-gradient-to-r from-[#784DFF] via-[#C44DFF] to-[#784DFF] rounded-full animate-portal" style={{ transform: 'translateX(-50%)' }} />

        {/* Анимированный деликатный индикатор загрузки с процентами */}
        <div className="flex flex-col items-center justify-center gap-10 mt-4 animate-text-brand" style={{ animationDelay: '900ms' }}>
          
          {/* Премиальное крутящееся кольцо загрузки на 60 FPS */}
          <div className="relative w-8 h-8 flex items-center justify-center">
            <div className="absolute inset-0 rounded-full border border-white/[0.05]" />
            <div 
              className="absolute inset-0 rounded-full border border-transparent border-t-[#784DFF] border-r-[#C44DFF]"
              style={{ animation: 'rotateProgress 1s linear infinite' }}
            />
          </div>

          {/* Бегущие проценты загрузки */}
          <div className="flex flex-col items-center justify-center gap-1.5 mt-2 font-semibold">
            <span className="text-[10px] text-textSecondary font-bold tracking-widest uppercase">Загрузка платформы</span>
            <span className="text-sm font-bold text-white font-mono">{progress}%</span>
          </div>
        </div>
      </div>

    </div>
  );
};
