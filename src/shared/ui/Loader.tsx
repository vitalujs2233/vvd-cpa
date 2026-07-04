import React, { useEffect, useState } from 'react';

interface LoaderProps {
  onComplete?: () => void;
}

export const Loader: React.FC<LoaderProps> = ({ onComplete }) => {
  const [progress, setProgress] = useState(0);
  const [isFadingOut, setIsFadingOut] = useState(false);
  const [showFlash, setShowFlash] = useState(false); // Состояние для яркой золотой вспышки

  useEffect(() => {
    // Настроили интервал, чтобы шкала ровно и плавно заполнялась за 5 - 6 секунд
    const interval = setInterval(() => {
      setProgress((prev) => {
        if (prev >= 100) {
          clearInterval(interval);
          return 100;
        }
        // Шаг от 1 до 3% для имитации реальной загрузки данных
        const step = Math.floor(Math.random() * 3) + 1;
        return Math.min(prev + step, 100);
      });
    }, 100);

    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (progress === 100) {
      // Кадр 7: При достижении 100% активируем ослепительную золотую вспышку на 300ms
      setShowFlash(true);
      
      const flashTimeout = setTimeout(() => {
        setShowFlash(false);
        setIsFadingOut(true);
        
        // Кадр 8: Плавное исчезновение экрана (Fade Out) перед показом Главной
        const completeTimeout = setTimeout(() => {
          if (onComplete) onComplete();
        }, 350);
        return () => clearTimeout(completeTimeout);
      }, 300);
      
      // Исправлено имя таймера на flashTimeout
      return () => clearTimeout(flashTimeout);
    }
  }, [progress, onComplete]);

  return (
    <div className={`fixed inset-0 z-[9999] flex flex-col items-center justify-between py-32 px-16 bg-[#0A0A0A] select-none overflow-hidden transition-all duration-350 ease-in-out ${
      isFadingOut ? 'opacity-0 scale-105 pointer-events-none' : 'opacity-100'
    }`}>
      
      {/* Высокопроизводительные аппаратные анимации для 60 FPS на iOS и Android */}
      <style>{`
        @keyframes scaleLogo {
          0% { transform: scale(0) rotate(-15deg); opacity: 0; filter: blur(10px); }
          60% { transform: scale(1.08) rotate(2deg); opacity: 0.9; filter: blur(0px); }
          100% { transform: scale(1) rotate(0deg); opacity: 1; }
        }

        @keyframes slideUpText {
          0% { transform: translateY(16px); opacity: 0; filter: blur(4px); }
          100% { transform: translateY(0); opacity: 1; filter: blur(0); }
        }

        @keyframes portalPulse {
          0%, 100% { transform: scale(1) translateX(-50%); opacity: 0.5; filter: blur(25px); }
          50% { transform: scale(1.2) translateX(-50%); opacity: 0.8; filter: blur(35px); }
        }

        @keyframes particleFloat {
          0% { transform: translateY(120px) translateX(0); opacity: 0; }
          50% { opacity: 0.5; }
          100% { transform: translateY(-140px) translateX(var(--particle-x, 20px)); opacity: 0; }
        }

        @keyframes rotateProgress {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }

        @keyframes flashEffect {
          0% { transform: scale(0); opacity: 0; }
          40% { transform: scale(3); opacity: 1; filter: blur(5px); }
          100% { transform: scale(4); opacity: 0; filter: blur(20px); }
        }

        .animate-logo {
          animation: scaleLogo 950ms cubic-bezier(0.34, 1.56, 0.64, 1) forwards;
        }

        .animate-text-brand {
          opacity: 0;
          animation: slideUpText 750ms cubic-bezier(0.16, 1, 0.3, 1) 500ms forwards;
        }

        .animate-portal {
          animation: portalPulse 3s infinite ease-in-out;
        }

        .floating-particle {
          position: absolute;
          width: 3px;
          height: 3px;
          background: #D4AF37; /* Золотые частицы */
          border-radius: 50%;
          filter: drop-shadow(0 0 4px #D4AF37);
          animation: particleFloat 4.5s infinite linear;
          bottom: 20%;
        }

        .cinematic-flash {
          animation: flashEffect 400ms cubic-bezier(0.16, 1, 0.3, 1) forwards;
        }
      `}</style>

      {/* Роскошные золотые фоновые световые пятна */}
      <div className="absolute top-[20%] left-[15%] w-80 h-80 bg-[#D4AF37]/[0.02] rounded-full blur-[90px] pointer-events-none" />
      <div className="absolute top-[40%] right-[10%] w-96 h-96 bg-[#FFE08A]/[0.02] rounded-full blur-[110px] pointer-events-none" />

      {/* Золотые парящие частицы */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden">
        <div className="floating-particle left-[20%]" style={{ '--particle-x': '-30px', animationDelay: '0s', animationDuration: '3.8s' } as React.CSSProperties} />
        <div className="floating-particle left-[40%]" style={{ '--particle-x': '20px', animationDelay: '1.5s', animationDuration: '4.8s' } as React.CSSProperties} />
        <div className="floating-particle left-[60%]" style={{ '--particle-x': '-15px', animationDelay: '0.8s', animationDuration: '4.2s' } as React.CSSProperties} />
        <div className="floating-particle left-[85%]" style={{ '--particle-x': '35px', animationDelay: '2.5s', animationDuration: '5.2s' } as React.CSSProperties} />
      </div>

      <div className="h-4" />

      {/* ЦЕНТРАЛЬНАЯ ОБЛАСТЬ: Золотой логотип V + Название */}
      <div className="flex flex-col items-center justify-center gap-16 relative z-10">
        
        {/* Изящная золотая лента в форме буквы V */}
        <div className="animate-logo">
          <svg width="110" height="110" viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg">
            <g filter="url(#goldGlow)">
              {/* Левая золотая ветвь логотипа */}
              <path d="M20 15 C30 15 42 55 46 72 C48 76 52 76 54 72 C58 55 70 15 80 15 C74 15 62 48 52 68 C51 70 49 70 48 68 C38 48 26 15 20 15 Z" fill="url(#goldGrad1)" />
              {/* Правая наложенная сияющая ветвь */}
              <path opacity="0.9" d="M30 15 C36 15 45 48 48 65 C49 68 51 68 52 65 C55 48 64 15 70 15 C66 15 56 42 51 60 C50 62 50 62 49 60 C44 42 34 15 30 15 Z" fill="url(#goldGrad2)" />
            </g>
            <defs>
              <linearGradient id="goldGrad1" x1="50" y1="15" x2="50" y2="75" gradientUnits="userSpaceOnUse">
                <stop offset="0%" stopColor="#FFE08A" />
                <stop offset="50%" stopColor="#D4AF37" />
                <stop offset="100%" stopColor="#F6C453" />
              </linearGradient>
              <linearGradient id="goldGrad2" x1="50" y1="15" x2="50" y2="75" gradientUnits="userSpaceOnUse">
                <stop offset="0%" stopColor="#FFFFFF" />
                <stop offset="100%" stopColor="#FFE08A" />
              </linearGradient>
              <filter id="goldGlow" x="-30%" y="-30%" width="160%" height="160%">
                <feGaussianBlur stdDeviation="8" result="blur" />
                <feMerge>
                  <feMergeNode in="blur" />
                  <feMergeNode in="SourceGraphic" />
                </feMerge>
              </filter>
            </defs>
          </svg>
        </div>

        {/* Название бренда VVD CPA в золотом цвете */}
        <div className="flex flex-col items-center justify-center text-center animate-text-brand mt-4">
          <span className="text-[28px] font-bold text-[#F6C453] tracking-widest font-sans uppercase drop-shadow-[0_0_12px_rgba(246,196,83,0.3)]">VVD CPA</span>
          <span className="text-[9px] font-bold text-[#D4AF37] tracking-[0.25em] uppercase mt-2">PREMIUM NETWORK</span>
        </div>
      </div>

      {/* НИЖНЯЯ ОБЛАСТЬ: Световой портал + Золотой индикатор */}
      <div className="relative flex flex-col items-center justify-center w-full h-32 z-10">
        
        {/* Неоновый золотой световой портал на полу */}
        <div className="absolute bottom-2 left-1/2 w-48 h-3.5 bg-gradient-to-r from-[#D4AF37] via-[#FFE08A] to-[#D4AF37] rounded-full animate-portal" style={{ transform: 'translateX(-50%)' }} />

        {/* Индикатор загрузки (Circular Progress) */}
        <div className="flex flex-col items-center justify-center gap-10 mt-4 animate-text-brand" style={{ animationDelay: '900ms' }}>
          
          {/* Золотое крутящееся кольцо */}
          <div className="relative w-8 h-8 flex items-center justify-center">
            <div className="absolute inset-0 rounded-full border border-white/[0.05]" />
            <div 
              className="absolute inset-0 rounded-full border border-transparent border-t-[#F6C453] border-r-[#D4AF37]"
              style={{ animation: 'rotateProgress 1s linear infinite' }}
            />
          </div>

          <div className="flex flex-col items-center justify-center gap-1.5 mt-2 font-semibold">
            <span className="text-[10px] text-textSecondary font-bold tracking-widest uppercase">Загрузка платформы</span>
            <span className="text-sm font-bold text-[#F6C453] font-mono drop-shadow-[0_0_8px_rgba(246,196,83,0.25)]">{progress}%</span>
          </div>
        </div>
      </div>

      {/* ЭКРАННЫЙ ЭФФЕКТ: Яркая золотая кинематографичная вспышка в центре при 100% */}
      {showFlash && (
        <div className="absolute top-1/2 left-1/2 w-32 h-32 bg-[#FFE08A] rounded-full blur-md cinematic-flash transform -translate-x-1/2 -translate-y-1/2 z-[10000]" />
      )}

    </div>
  );
};
