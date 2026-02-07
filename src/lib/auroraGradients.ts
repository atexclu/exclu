export interface AuroraGradient {
  id: string;
  name: string;
  colors: [string, string, string];
  preview: string;
}

export const auroraGradients: AuroraGradient[] = [
  {
    id: 'aurora',
    name: 'Aurora',
    colors: ['#7cff67', '#B19EEF', '#5227FF'],
    preview: 'linear-gradient(135deg, #7cff67 0%, #B19EEF 50%, #5227FF 100%)'
  },
  {
    id: 'sunset',
    name: 'Sunset',
    colors: ['#FF6B6B', '#FFD93D', '#FF8C42'],
    preview: 'linear-gradient(135deg, #FF6B6B 0%, #FFD93D 50%, #FF8C42 100%)'
  },
  {
    id: 'ocean',
    name: 'Ocean',
    colors: ['#00D4FF', '#0099FF', '#0052CC'],
    preview: 'linear-gradient(135deg, #00D4FF 0%, #0099FF 50%, #0052CC 100%)'
  },
  {
    id: 'purple_dream',
    name: 'Purple Dream',
    colors: ['#FF9FFC', '#B19EEF', '#8B5CF6'],
    preview: 'linear-gradient(135deg, #FF9FFC 0%, #B19EEF 50%, #8B5CF6 100%)'
  },
  {
    id: 'fire',
    name: 'Fire',
    colors: ['#FF4E50', '#FC913A', '#F9D423'],
    preview: 'linear-gradient(135deg, #FF4E50 0%, #FC913A 50%, #F9D423 100%)'
  },
  {
    id: 'mint',
    name: 'Mint',
    colors: ['#00F5A0', '#00D9F5', '#00B4D8'],
    preview: 'linear-gradient(135deg, #00F5A0 0%, #00D9F5 50%, #00B4D8 100%)'
  },
  {
    id: 'rose',
    name: 'Rose',
    colors: ['#FF6B9D', '#FFA8E2', '#FF69B4'],
    preview: 'linear-gradient(135deg, #FF6B9D 0%, #FFA8E2 50%, #FF69B4 100%)'
  },
  {
    id: 'emerald',
    name: 'Emerald',
    colors: ['#10B981', '#34D399', '#6EE7B7'],
    preview: 'linear-gradient(135deg, #10B981 0%, #34D399 50%, #6EE7B7 100%)'
  },
  {
    id: 'indigo',
    name: 'Indigo',
    colors: ['#4F46E5', '#6366F1', '#818CF8'],
    preview: 'linear-gradient(135deg, #4F46E5 0%, #6366F1 50%, #818CF8 100%)'
  },
  {
    id: 'orange',
    name: 'Orange',
    colors: ['#EA580C', '#F97316', '#FB923C'],
    preview: 'linear-gradient(135deg, #EA580C 0%, #F97316 50%, #FB923C 100%)'
  },
  {
    id: 'midnight',
    name: 'Midnight',
    colors: ['#1E3A8A', '#3B82F6', '#60A5FA'],
    preview: 'linear-gradient(135deg, #1E3A8A 0%, #3B82F6 50%, #60A5FA 100%)'
  },
  {
    id: 'cherry',
    name: 'Cherry',
    colors: ['#DC2626', '#EF4444', '#F87171'],
    preview: 'linear-gradient(135deg, #DC2626 0%, #EF4444 50%, #F87171 100%)'
  },
  {
    id: 'tropical',
    name: 'Tropical',
    colors: ['#14B8A6', '#06B6D4', '#22D3EE'],
    preview: 'linear-gradient(135deg, #14B8A6 0%, #06B6D4 50%, #22D3EE 100%)'
  },
  {
    id: 'peach',
    name: 'Peach',
    colors: ['#FBBF24', '#FB923C', '#F97316'],
    preview: 'linear-gradient(135deg, #FBBF24 0%, #FB923C 50%, #F97316 100%)'
  },
  {
    id: 'galaxy',
    name: 'Galaxy',
    colors: ['#6366F1', '#8B5CF6', '#A855F7'],
    preview: 'linear-gradient(135deg, #6366F1 0%, #8B5CF6 50%, #A855F7 100%)'
  },
  {
    id: 'forest',
    name: 'Forest',
    colors: ['#065F46', '#059669', '#10B981'],
    preview: 'linear-gradient(135deg, #065F46 0%, #059669 50%, #10B981 100%)'
  },
  {
    id: 'coral',
    name: 'Coral',
    colors: ['#FF6B9D', '#FF8FAB', '#FFB3C1'],
    preview: 'linear-gradient(135deg, #FF6B9D 0%, #FF8FAB 50%, #FFB3C1 100%)'
  },
  {
    id: 'electric',
    name: 'Electric',
    colors: ['#8B5CF6', '#EC4899', '#F43F5E'],
    preview: 'linear-gradient(135deg, #8B5CF6 0%, #EC4899 50%, #F43F5E 100%)'
  },
  {
    id: 'teal',
    name: 'Teal',
    colors: ['#0D9488', '#14B8A6', '#2DD4BF'],
    preview: 'linear-gradient(135deg, #0D9488 0%, #14B8A6 50%, #2DD4BF 100%)'
  },
  {
    id: 'sky',
    name: 'Sky',
    colors: ['#0284C7', '#0EA5E9', '#38BDF8'],
    preview: 'linear-gradient(135deg, #0284C7 0%, #0EA5E9 50%, #38BDF8 100%)'
  }
];

export const getAuroraGradient = (id: string): AuroraGradient => {
  return auroraGradients.find(g => g.id === id) || auroraGradients[0];
};
