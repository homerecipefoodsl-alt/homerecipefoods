import { useNavigate, useLocation } from 'react-router-dom';
import { Grid, Home, MapPin, MessageCircle, Search, Sparkles } from 'lucide-react';

interface MobileBottomNavProps {
  onOpenChat: (mode?: 'ai' | 'human') => void;
}

export function MobileBottomNav({ onOpenChat }: MobileBottomNavProps) {
  const navigate = useNavigate();
  const location = useLocation();

  const goSection = (id: string) => {
    navigate(
      { pathname: '/', hash: `#${id}` },
      { state: { scrollTarget: id, scrollNonce: Date.now() } }
    );
  };

  return (
    <nav
      aria-label="Mobile Bottom Navigation"
      className="fixed bottom-0 left-0 right-0 z-30 border-t border-[#E7E5E4] bg-[#FAFAF8]/95 pb-[env(safe-area-inset-bottom)] backdrop-blur-md md:hidden"
    >
      <div className="grid h-12 grid-cols-6 items-center">
        <button
          type="button"
          onClick={() => navigate('/')}
          className={`flex h-full cursor-pointer flex-col items-center justify-center gap-0.5 text-[10px] font-medium ${
            location.pathname === '/' ? 'text-[#DC1F26]' : 'text-[#57534E]'
          }`}
        >
          <Home className="h-4 w-4" />
          <span>Home</span>
        </button>

        <button
          type="button"
          onClick={() => goSection('categories')}
          className="flex h-full cursor-pointer flex-col items-center justify-center gap-0.5 text-[10px] font-medium text-[#57534E]"
        >
          <Grid className="h-4 w-4" />
          <span>Categories</span>
        </button>

        <button
          type="button"
          onClick={() => navigate('/products')}
          className={`flex h-full cursor-pointer flex-col items-center justify-center gap-0.5 text-[10px] font-medium ${
            location.pathname === '/products' ? 'text-[#DC1F26]' : 'text-[#57534E]'
          }`}
        >
          <Search className="h-4 w-4" />
          <span>Search</span>
        </button>

        <button
          type="button"
          onClick={() => goSection('occasions')}
          className="flex h-full cursor-pointer flex-col items-center justify-center gap-0.5 text-[10px] font-medium text-[#57534E]"
        >
          <Sparkles className="h-4 w-4" />
          <span>Occasions</span>
        </button>

        <button
          type="button"
          onClick={() => navigate('/outlets')}
          className={`flex h-full cursor-pointer flex-col items-center justify-center gap-0.5 text-[10px] font-medium ${
            location.pathname === '/outlets' ||
            location.pathname === '/our-outlets' ||
            location.pathname === '/showrooms'
              ? 'text-[#DC1F26]'
              : 'text-[#57534E]'
          }`}
        >
          <MapPin className="h-4 w-4" />
          <span>Outlets</span>
        </button>

        <button
          type="button"
          onClick={() => onOpenChat()}
          className="flex h-full cursor-pointer flex-col items-center justify-center gap-0.5 text-[10px] font-semibold text-[#DC1F26]"
        >
          <MessageCircle className="h-4 w-4" />
          <span>Support</span>
        </button>
      </div>
    </nav>
  );
}
