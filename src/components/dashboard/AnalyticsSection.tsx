import { BarChart3, TrendingUp, Users, Eye, Heart } from 'lucide-react';

export const AnalyticsSection = () => {
  return (
    <div className="p-6 space-y-6">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: 'Profile Views', value: '0', icon: Eye, change: '+0%' },
          { label: 'Followers', value: '0', icon: Users, change: '+0%' },
          { label: 'Engagement', value: '0%', icon: Heart, change: '+0%' },
          { label: 'Click Rate', value: '0%', icon: TrendingUp, change: '+0%' },
        ].map((stat) => (
          <div key={stat.label} className="rounded-2xl border border-border bg-card p-4">
            <div className="flex items-center gap-2 mb-2">
              <stat.icon className="w-4 h-4 text-muted-foreground" />
              <span className="text-xs text-muted-foreground">{stat.label}</span>
            </div>
            <div className="text-2xl font-bold">{stat.value}</div>
            <div className="text-xs text-muted-foreground mt-1">{stat.change}</div>
          </div>
        ))}
      </div>

      <div className="rounded-2xl border border-border bg-card p-6">
        <h3 className="font-semibold mb-4">Traffic Overview</h3>
        <div className="h-48 flex items-center justify-center text-muted-foreground text-sm">
          No data available yet. Share your profile to start tracking!
        </div>
      </div>
    </div>
  );
};
