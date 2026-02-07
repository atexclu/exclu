# Contributing to Exclu

## Getting Started

### Prerequisites
- Node.js 18+ 
- npm or bun
- Supabase CLI
- Git

### Setup

1. **Clone the repository**
```bash
git clone https://github.com/your-org/exclu.git
cd exclu
```

2. **Install dependencies**
```bash
npm install
```

3. **Setup environment variables**
```bash
cp .env.example .env.local
```

Fill in your Supabase credentials in `.env.local`:
```
VITE_SUPABASE_URL=your_supabase_url
VITE_SUPABASE_ANON_KEY=your_supabase_anon_key
```

4. **Start development server**
```bash
npm run dev
```

## Development Workflow

### Branch Strategy
- `main`: Production branch (protected)
- `develop`: Development branch
- `feature/*`: Feature branches
- `fix/*`: Bug fix branches

### Commit Convention
We use conventional commits:
```
feat: add new feature
fix: fix bug
docs: update documentation
style: format code
refactor: refactor code
test: add tests
chore: update dependencies
```

### Pull Request Process
1. Create a feature branch from `develop`
2. Make your changes
3. Write/update tests
4. Update documentation if needed
5. Create a PR to `develop`
6. Wait for review and CI checks
7. Merge after approval

## Code Style

### TypeScript
- Use strict mode
- Prefer interfaces over types for objects
- Use explicit return types for functions
- Avoid `any`, use `unknown` if needed

### React
- Functional components only
- Use hooks (useState, useEffect, etc.)
- Prefer composition over inheritance
- Keep components small and focused

### Styling
- Use Tailwind CSS utility classes
- Follow the design system (shadcn/ui)
- Use CSS variables for theming
- Avoid inline styles

### File Organization
```
src/
├── components/     # Reusable UI components
├── pages/          # Page components (routes)
├── lib/            # Utilities and helpers
├── hooks/          # Custom React hooks
├── types/          # TypeScript types
└── test/           # Test utilities
```

## Testing

### Unit Tests
```bash
npm run test
```

### Component Tests
```bash
npm run test:ui
```

### Coverage
```bash
npm run test:coverage
```

## Supabase

### Local Development
```bash
supabase start
```

### Migrations
```bash
supabase migration new migration_name
```

### Deploy Functions
```bash
supabase functions deploy function_name
```

## Deployment

### Preview Deployments
Every PR automatically gets a preview deployment on Vercel.

### Production Deployment
Merging to `main` automatically deploys to production.

## Documentation

### Code Comments
- Use JSDoc for functions
- Explain complex logic
- Keep comments up to date

### README Updates
Update README.md when:
- Adding new features
- Changing setup process
- Updating dependencies

## Getting Help

- Check existing issues on GitHub
- Read the documentation in `/docs`
- Ask in team chat

## License

By contributing, you agree that your contributions will be licensed under the project's license.
